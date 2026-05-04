#!/usr/bin/env node

import { resolveConfig } from './config.js'
import { runInit } from './init.js'
import { createRenderer } from './renderer.js'
import { Agent } from './agent.js'
import { OpenAIProvider } from './providers/openai.js'
import { VERSION } from './version.js'
import chalk from 'chalk'

function parseArgs(argv: string[]): { command: 'init' | 'run'; prompt: string; flags: { model?: string } } {
  const args = argv.slice(2)

  if (args[0] === 'init') {
    return { command: 'init', prompt: '', flags: {} }
  }

  const flags: { model?: string } = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      flags.model = args[++i]
    } else if (args[i] === '--version' || args[i] === '-v') {
      console.log(`agn v${VERSION}`)
      process.exit(0)
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: agn [init] [--model <id>] "<prompt>"`)
      console.log(`       agn init          Configure provider, API key, model`)
      console.log(`       agn "<prompt>"    Run a task`)
      console.log(`       --model <id>      Override model for this run`)
      console.log(`       --version, -v     Show version`)
      process.exit(0)
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i])
    }
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
  const { command, prompt, flags } = parseArgs(process.argv)

  if (command === 'init') {
    await runInit()
    return
  }

  if (!prompt) {
    console.error(chalk.red('No prompt provided.'))
    console.error('Usage: agn "<prompt>" or agn init')
    process.exit(1)
  }

  const config = await resolveConfig(flags)
  const provider = createProvider(config.provider, config.apiKey, config.model)
  const renderer = createRenderer()
  const agent = new Agent({ provider, hooks: renderer })

  const result = await agent.run(prompt)

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

main().catch((err) => {
  console.error(chalk.red(err.message))
  process.exit(1)
})
