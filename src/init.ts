import { createInterface } from 'node:readline/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { stringify as toYaml } from 'yaml'
import chalk from 'chalk'
import { CONFIG_DIR, CONFIG_PATH } from './config.js'

const MODEL_DEFAULTS: Record<string, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-20250514',
}

export async function runInit(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    console.log(`\n${chalk.bold('Welcome to agn.')}\n`)

    console.log('Select a provider:')
    console.log(`  ${chalk.cyan('1)')} OpenAI`)
    console.log(`  ${chalk.cyan('2)')} Anthropic`)
    const providerChoice = await rl.question('\nProvider (1): ')
    const provider = providerChoice.trim() === '2' ? 'anthropic' : 'openai'

    const apiKey = await rl.question('\nPaste your API key: ')
    if (!apiKey.trim()) {
      console.error(chalk.red('API key is required.'))
      process.exit(1)
    }

    const defaultModel = MODEL_DEFAULTS[provider]
    const modelAnswer = await rl.question(`\nDefault model (${defaultModel}): `)
    const model = modelAnswer.trim() || defaultModel

    await mkdir(CONFIG_DIR, { recursive: true })
    const config = { provider, model, api_key: apiKey.trim() }
    await writeFile(CONFIG_PATH, toYaml(config), 'utf-8')

    console.log(`\n${chalk.green('Config saved to')} ${CONFIG_PATH}`)
  } finally {
    rl.close()
  }
}
