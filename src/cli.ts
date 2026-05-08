#!/usr/bin/env node

import { resolveConfig } from './config.js'
import { runInit } from './init.js'
import { createRenderer } from './renderer.js'
import { Agent } from './agent.js'
import { OpenAIProvider } from './providers/openai.js'
import { VERSION } from './version.js'
import { getAvailableSkills } from './skills.js'
import chalk from 'chalk'

// Extended parseArgs to support subcommands
// The plan wants a type like this:
type Parsed =
  | { command: 'init'; flags: { model?: string } }
  | { command: 'run'; prompt: string; flags: { model?: string } }
  | { command: 'skills_list'; flags: { model?: string } }
  | { command: 'skill_new'; name: string; description?: string; scope: 'global' | 'project'; flags: { model?: string } }

export function parseArgs(argv: string[]): Parsed {
  const args = argv.slice(2)
  const flags: { model?: string } = {}
  let i = 0
  const next = () => args[i] || ''

  // Recognize --model flag in any subcommand
  while (i < args.length) {
    if (args[i] === '--model' && i + 1 < args.length) {
      flags.model = args[i + 1]
      i += 2
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
  process.exit(1)
}

async function main() {
  const parsed = parseArgs(process.argv)
  const { command } = parsed

  if (command === 'init') {
    await runInit()
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
      process.exit(0)
    } else {
      process.exit(1)
    }
  }

  if (command === 'run' && !parsed.prompt) {
    console.error(chalk.red('No prompt provided.'))
    console.error('Usage: agn "<prompt>" or agn init')
    process.exit(1)
  }
  // legacy/normal single-prompt run
  const config = await resolveConfig(parsed.flags)
  const provider = createProvider(config.provider, config.apiKey, config.model)
  const renderer = createRenderer()
  const agent = new Agent({ provider, hooks: renderer })

  // @ts-ignore
  const result = await agent.run(parsed.prompt)

  if (result.status === 'done') {
    console.log()
    process.exit(0)
  } else if (result.status === 'max_iterations') {
    console.error(chalk.yellow('\nReached max iterations.'))
    process.exit(1)
  } else {
    console.error(chalk.red(`\nError: ${result.content}`))
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}
