#!/usr/bin/env node

import { resolveConfig } from './config.js'
import { runInit } from './init.js'
import { createRenderer } from './renderer.js'
import { Agent } from './agent.js'
import { OpenAIProvider } from './providers/openai.js'
import { VERSION } from './version.js'
import { getAvailableSkills } from './skills.js'
import chalk from 'chalk'
import os from 'node:os'

// Extended parseArgs to support subcommands
// The plan wants a type like this:
type Parsed =
  | { command: 'init'; flags: { model?: string; trace?: boolean } }
  | { command: 'run'; prompt: string; flags: { model?: string; trace?: boolean } }
  | { command: 'skills_list'; flags: { model?: string; trace?: boolean } }
  | { command: 'skill_new'; name: string; description?: string; scope: 'global' | 'project'; flags: { model?: string; trace?: boolean } }

export function parseArgs(argv: string[]): Parsed {
  const args = argv.slice(2)
  const flags: { model?: string; trace?: boolean } = {}
  let i = 0
  const next = () => args[i] || ''

  // Recognize --model and --trace flags in any subcommand
  while (i < args.length) {
    if (args[i] === '--model' && i + 1 < args.length) {
      flags.model = args[i + 1]
      i += 2
    } else if (args[i] === '--trace') {
      flags.trace = true
      i += 1
    } else {
      break
    }
  }

  if (args[i] === 'init') return { command: 'init', flags }
  if (args[i] === 'skills' && args[i + 1] === 'list') {
    return { command: 'skills_list', flags }
  }
  if (args[i] === 'skill' && args[i + 1] === 'new') {
    const name = args[i + 2]
    if (!name) {
      console.error(chalk.red('Missing skill name.'))
      logSessionId()
      process.exit(1)
    }
    // Parse --description, --global, --project
    let description: string | undefined = undefined
    let scope: 'global' | 'project' = 'project'
    let j = i + 3
    while (j < args.length) {
      if (args[j] === '--description' && j + 1 < args.length) {
        description = args[j + 1]
        j += 2
      } else if (args[j] === '--global') {
        scope = 'global'
        j++
      } else if (args[j] === '--project') {
        scope = 'project'
        j++
      } else {
        j++
      }
    }
    return { command: 'skill_new', name, description, scope, flags }
  }
  // Fallback: prompt
  // Scan for other flags and treat rest as raw prompt
  let positional: string[] = []
  for (; i < args.length; ++i) {
    if (args[i].startsWith('--')) {
      if (args[i] === '--model' && i + 1 < args.length) {
        flags.model = args[++i]
      }
      // skip other flags for backward compat
      continue
    }
    positional.push(args[i])
  }
  const prompt = positional.join(' ')
  return { command: 'run', prompt, flags }
}

function createProvider(provider: string, apiKey: string, model: string) {
  if (provider === 'openai') {
    return new OpenAIProvider({ apiKey, model })
  }
  console.error(chalk.red(`Provider "${provider}" is not implemented yet.`))
  logSessionId()
  process.exit(1)
}

import { generateSessionId } from './session.js'

// SessionId logging for every CLI run
declare global {
  // eslint-disable-next-line no-var
  var sessionId: string | undefined
}
function logSessionId() {
  if (global.sessionId) {
    console.log(chalk.gray(`Session ID: ${global.sessionId}`))
  }
}

async function main() {
  const sessionId = await generateSessionId()
  // This lets the LLM know about the session ID in the user prompt system message:
  //   You can reference sessionId variable in prompt context if needed.
  global.sessionId = sessionId
  const parsed = parseArgs(process.argv)
  const { command } = parsed

  if (command === 'init') {
    await runInit()
    logSessionId()
    return
  }

  if (command === 'skills_list') {
    const skills = await getAvailableSkills()

    const rows = skills.map((s) => ({
      name: s.name || '(unnamed)',
      description: (s.description || '').trim(),
    }))

    const nameHeader = 'Name'
    const descHeader = 'Description'

    const nameWidth = Math.max(
      nameHeader.length,
      ...rows.map((r) => r.name.length),
    )

    // Keep description readable; let it wrap if very long
    const maxDescWidth = 80
    const rawDescWidth = Math.max(descHeader.length, ...rows.map((r) => r.description.length))
    const descWidth = Math.min(maxDescWidth, rawDescWidth)

    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
    const wrap = (text: string, width: number) => {
      if (!text) return ['']
      if (width <= 0) return [text]
      const out: string[] = []
      let i = 0
      while (i < text.length) {
        out.push(text.slice(i, i + width))
        i += width
      }
      return out
    }

    const top = `┌${'─'.repeat(nameWidth + 2)}┬${'─'.repeat(descWidth + 2)}┐`
    const mid = `├${'─'.repeat(nameWidth + 2)}┼${'─'.repeat(descWidth + 2)}┤`
    const bot = `└${'─'.repeat(nameWidth + 2)}┴${'─'.repeat(descWidth + 2)}┘`

    console.log(top)
    console.log(`│ ${pad(nameHeader, nameWidth)} │ ${pad(descHeader, descWidth)} │`)
    console.log(mid)

    const rowSep = `├${'─'.repeat(nameWidth + 2)}┼${'─'.repeat(descWidth + 2)}┤`

    rows.forEach((r, rowIdx) => {
      const descLines = wrap(r.description, descWidth)
      descLines.forEach((line, idx) => {
        const nameCell = idx === 0 ? r.name : ''
        console.log(`│ ${pad(nameCell, nameWidth)} │ ${pad(line, descWidth)} │`)
      })

      // Differentiate each entry with a bottom border (separator), but not after the last row
      if (rowIdx !== rows.length - 1) {
        console.log(rowSep)
      }
    })

    console.log(bot)
    logSessionId()
    return
  }

  if (command === 'skill_new') {
    const config = await resolveConfig(parsed.flags)
    const provider = createProvider(config.provider, config.apiKey, config.model)
    const renderer = createRenderer()
    const agent = new Agent({ provider, hooks: renderer, skills: 'create-skill' })
    const basePrompt = [
      `Create a new skill file named "${parsed.name}".`,
      parsed.description ? `Skill description (this is NOT a question to answer): ${parsed.description}` : '',
      `Scope: ${parsed.scope}`,
      'Follow the loaded skill instructions exactly. Use tools to create files — do not just respond with text.',
    ].filter(Boolean).join('\n')
    const result = await agent.run(basePrompt)
    if (result.status === 'done') {
      logSessionId()
      process.exit(0)
    } else {
      logSessionId()
      process.exit(1)
    }
  }

  if (command === 'run' && !parsed.prompt) {
    console.error(chalk.red('No prompt provided.'))
    console.error('Usage: agn "<prompt>" or agn init')
    logSessionId()
    process.exit(1)
  }
  // legacy/normal single-prompt run
  const config = await resolveConfig(parsed.flags)
  const provider = createProvider(config.provider, config.apiKey, config.model)
  const renderer = createRenderer()
  const agent = new Agent({ provider, hooks: renderer })

  if (parsed.flags.trace) {
    const traceDir = `${os.homedir()}/.agn/traces`
    const tracepath = `${traceDir}/${global.sessionId}.md`
    console.log(chalk.blue(`Trace mode enabled. Tracepath: ${tracepath}`))
  }

  // @ts-ignore
  const result = await agent.run(parsed.prompt)

  if (result.status === 'done') {
    console.log()
    logSessionId()
    process.exit(0)
  } else if (result.status === 'max_iterations') {
    console.error(chalk.yellow('\nReached max iterations.'))
    logSessionId()
    process.exit(1)
  } else {
    console.error(chalk.red(`\nError: ${result.content}`))
    logSessionId()
    process.exit(1)
  }
}

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const realArgv1 = realpathSync(process.argv[1])
const realSelf = fileURLToPath(import.meta.url)

if (realArgv1 === realSelf) {
  main().catch((err) => {
    console.error(chalk.red(err.message))
    logSessionId()
    process.exit(1)
  })
}
