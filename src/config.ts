import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse as parseYaml } from 'yaml'

export interface ResolvedConfig {
  provider: string
  model: string
  apiKey: string
}

interface ConfigFlags {
  model?: string
}

const DEFAULTS: { provider: string; model: string } = {
  provider: 'openai',
  model: 'gpt-4.1',
}

export const CONFIG_DIR = join(homedir(), '.agn')
export const CONFIG_PATH = join(CONFIG_DIR, 'config.yml')

async function readConfigFile(): Promise<Partial<ResolvedConfig>> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    const parsed = parseYaml(raw) as Record<string, string> | null
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      provider: parsed.provider,
      model: parsed.model,
      apiKey: parsed.api_key,
    }
  } catch {
    return {}
  }
}

function readEnv(): Partial<ResolvedConfig> {
  return {
    provider: process.env.AGN_PROVIDER || undefined,
    model: process.env.AGN_MODEL || undefined,
    apiKey: process.env.AGN_API_KEY || undefined,
  }
}

export async function resolveConfig(flags: ConfigFlags = {}): Promise<ResolvedConfig> {
  const file = await readConfigFile()
  const env = readEnv()

  const provider = env.provider ?? file.provider ?? DEFAULTS.provider
  const model = flags.model ?? env.model ?? file.model ?? DEFAULTS.model
  const apiKey = env.apiKey ?? file.apiKey ?? ''

  if (!apiKey) {
    throw new Error(
      'No API key found. Run `agn init` or set AGN_API_KEY.'
    )
  }

  return { provider, model, apiKey }
}
