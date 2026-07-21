#!/usr/bin/env node

import { resolveConfig } from './config.js'
import { runInit } from './init.js'
import { createRenderer } from './renderer.js'
import { createJsonRenderer, emitStreamEvent } from './renderer-json.js'
import { Agent } from './agent.js'
import { OpenAIProvider } from './providers/openai.js'
import { VERSION } from './version.js'
import { getAvailableSkills } from './skills.js'
import chalk from 'chalk'
import os from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Message, OutputFormat, StreamEvent } from './types.js'

interface CommonFlags {
  model?: string
  trace?: boolean
  print?: boolean
  outputFormat?: OutputFormat
  streamPartial?: boolean
}

type Parsed =
  | { command: 'init'; flags: CommonFlags }
  | { command: 'run'; prompt: string; flags: CommonFlags }
  | { command: 'skills_list'; flags: CommonFlags }
  | { command: 'skill_new'; name: string; description?: string; scope: 'global' | 'project'; flags: CommonFlags }
  | { command: 'version' }
  | { command: 'help' }

function argumentError(message: string): never {
  console.error(chalk.red(message))
  process.exit(1)
}

export function parseArgs(argv: string[]): Parsed {
  const args = argv.slice(2)
  if (args.includes('--version') || args.includes('-v')) return { command: 'version' }
  if (args.includes('--help') || args.includes('-h')) return { command: 'help' }

  const flags: CommonFlags = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--model') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) {
        argumentError('Missing value for --model.')
      }
      flags.model = args[++i]
    } else if (arg === '--trace') {
      flags.trace = true
    } else if (arg === '-p' || arg === '--print') {
      flags.print = true
    } else if (arg === '--output-format') {
      const value = args[++i]
      if (!value || value.startsWith('-')) {
        argumentError('Missing value for --output-format.')
      }
      if (!['text', 'json', 'stream-json'].includes(value)) {
        argumentError(
          `Invalid output format "${value}". Expected text, json, or stream-json.`,
        )
      }
      flags.outputFormat = value as OutputFormat
    } else if (arg === '--stream-partial-output') {
      flags.streamPartial = true
    } else {
      positional.push(arg)
    }
  }

  if (positional[0] === 'init') return { command: 'init', flags }
  if (positional[0] === 'skills' && positional[1] === 'list') {
    return { command: 'skills_list', flags }
  }
  if (positional[0] === 'skill' && positional[1] === 'new') {
    const name = positional[2]
    if (!name) {
      argumentError('Missing skill name.')
    }
    let description: string | undefined = undefined
    let scope: 'global' | 'project' = 'project'
    let j = 3
    while (j < positional.length) {
      if (positional[j] === '--description' && j + 1 < positional.length) {
        description = positional[j + 1]
        j += 2
      } else if (positional[j] === '--global') {
        scope = 'global'
        j++
      } else if (positional[j] === '--project') {
        scope = 'project'
        j++
      } else {
        j++
      }
    }
    return { command: 'skill_new', name, description, scope, flags }
  }

  const prompt = positional.join(' ')
  return { command: 'run', prompt, flags }
}

function createProvider(provider: string, apiKey: string, model: string) {
  if (provider === 'openai') {
    return new OpenAIProvider({ apiKey, model })
  }
  throw new Error(`Provider "${provider}" is not implemented yet.`)
}

function formatTraceFile(messages: Message[], model: string, prompt: string): string {
  return [
    '```',
    `Session ID: ${global.sessionId ?? ''}`,
    `Model: ${model}`,
    `Prompts: \`${prompt}\``,
    '```',
    '',
    '## Messages & tool calls',
    '',
    '```JSON',
    JSON.stringify(messages, null, 2),
    '```',
  ].join('\n')
}

async function writeTraceFile(tracePath: string, messages: Message[], model: string, prompt: string) {
  await mkdir(dirname(tracePath), { recursive: true })
  await writeFile(tracePath, formatTraceFile(messages, model, prompt), 'utf8')
}

import { generateSessionId } from './session.js'

// SessionId logging for every CLI run
declare global {
  // eslint-disable-next-line no-var
  var sessionId: string | undefined
}
function logSessionId(stderr = false) {
  if (global.sessionId) {
    const message = chalk.gray(`Session ID: ${global.sessionId}`)
    if (stderr) console.error(message)
    else console.log(message)
  }
}

function printHelp() {
  console.log(`Usage:
  agn [flags] "<prompt>"
  agn init
  agn skills list
  agn skill new <name> [--description "..."] [--global|--project]

Flags:
  -p, --print                    Run in non-interactive print mode
  --output-format <format>       text, json, or stream-json (default: text)
  --stream-partial-output       Emit token deltas with stream-json
  --model <id>                  Override the configured model
  --trace                       Write a trace file
  -h, --help                    Show help
  -v, --version                 Show version`)
}

function resultEvent(
  result: { content: string; iterations: number; status: 'done' | 'max_iterations' | 'error' },
): StreamEvent {
  const sessionId = global.sessionId ?? ''
  if (result.status === 'done') {
    return {
      type: 'result',
      subtype: 'success',
      session_id: sessionId,
      result: result.content,
      iterations: result.iterations,
      is_error: false,
    }
  }
  if (result.status === 'max_iterations') {
    return {
      type: 'result',
      subtype: 'max_iterations',
      session_id: sessionId,
      result: result.content,
      iterations: result.iterations,
      is_error: true,
    }
  }
  return {
    type: 'result',
    subtype: 'error',
    session_id: sessionId,
    error: result.content,
    iterations: result.iterations,
    is_error: true,
  }
}

async function main() {
  const parsed = parseArgs(process.argv)
  const { command } = parsed
  
  if (command === 'version') {
    console.log(VERSION)
    process.exit(0)
  }
  if (command === 'help') {
    printHelp()
    process.exit(0)
  }
  const sessionId = await generateSessionId()
  // This lets the LLM know about the session ID in the user prompt system message:
  //   You can reference sessionId variable in prompt context if needed.
  global.sessionId = sessionId

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
    const outputFormat = parsed.flags.outputFormat ?? 'text'
    const structured = outputFormat !== 'text'
    const message = 'No prompt provided.'
    console.error(chalk.red(message))
    console.error('Usage: agn [flags] "<prompt>" or agn init')
    if (structured) {
      emitStreamEvent({
        type: 'result',
        subtype: 'error',
        session_id: global.sessionId ?? '',
        error: message,
        is_error: true,
      })
    }
    logSessionId(structured)
    process.exit(1)
  }

  const outputFormat = parsed.flags.outputFormat ?? 'text'
  const structured = outputFormat !== 'text'
  const printMode = parsed.flags.print || process.stdout.isTTY !== true
  let terminalEmitted = false

  try {
    if (structured && !printMode) {
      throw new Error(
        `${outputFormat} output requires -p/--print when stdout is a terminal.`,
      )
    }

    let streamPartial = parsed.flags.streamPartial ?? false
    if (streamPartial && outputFormat !== 'stream-json') {
      console.error(
        chalk.yellow(
          '--stream-partial-output is only valid with --output-format stream-json; ignoring it.',
        ),
      )
      streamPartial = false
    }

    const config = await resolveConfig(parsed.flags)
    const tracePath = `${os.homedir()}/.agn/traces/${global.sessionId}.md`

    if (parsed.flags.trace) {
      const traceMessage = chalk.blue(
        `Trace mode enabled. Tracepath: ${tracePath}`,
      )
      if (structured) console.error(traceMessage)
      else console.log(traceMessage)
    }

    if (outputFormat === 'stream-json') {
      emitStreamEvent({
        type: 'system',
        subtype: 'init',
        session_id: global.sessionId ?? '',
        model: config.model,
        cwd: process.cwd(),
        version: VERSION,
      })
      emitStreamEvent({
        type: 'user',
        session_id: global.sessionId ?? '',
        message: { role: 'user', content: parsed.prompt },
      })
    }

    const provider = createProvider(config.provider, config.apiKey, config.model)
    const hooks =
      outputFormat === 'text'
        ? createRenderer()
        : outputFormat === 'stream-json'
          ? createJsonRenderer({ partial: streamPartial })
          : {}
    const agent = new Agent({ provider, hooks })
    const result = await agent.run(parsed.prompt)

    if (parsed.flags.trace) {
      await writeTraceFile(tracePath, result.messages, config.model, parsed.prompt)
    }

    if (structured) {
      emitStreamEvent(resultEvent(result))
      terminalEmitted = true
      logSessionId(true)
    } else if (result.status === 'done') {
      console.log()
      logSessionId()
    } else if (result.status === 'max_iterations') {
      console.error(chalk.yellow('\nReached max iterations.'))
      logSessionId()
    } else {
      console.error(chalk.red(`\nError: ${result.content}`))
      logSessionId()
    }

    process.exit(result.status === 'done' ? 0 : 1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(chalk.red(message))
    if (structured && !terminalEmitted) {
      emitStreamEvent({
        type: 'result',
        subtype: 'error',
        session_id: global.sessionId ?? '',
        error: message,
        is_error: true,
      })
      terminalEmitted = true
    }
    logSessionId(structured)
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
