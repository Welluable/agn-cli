import type { Provider, Message, ChatResponse } from './types.js'
import { DEFAULT_TOOLS, TOOL_HANDLERS } from './tools.js'

const SYSTEM_PROMPT = `You are a helpful coding agent. Assist the user with their request.`

export interface AgentHooks {
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  onToolResult?: (name: string, result: string) => void
  onText?: (delta: string) => void
  onIterationStart?: (index: number) => void
  onIterationEnd?: (index: number) => void
}

export interface AgentOptions {
  provider: Provider
  hooks?: AgentHooks
}

export interface RunResult {
  content: string
  iterations: number
  status: 'done' | 'max_iterations' | 'error'
  messages: Message[]
}

function tryParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str)
  } catch {
    return { _raw: str }
  }
}

export class Agent {
  private provider: Provider
  private hooks: AgentHooks

  constructor(options: AgentOptions) {
    this.provider = options.provider
    this.hooks = options.hooks ?? {}
  }

  async run(
    prompt: string,
    options?: { maxIterations?: number }
  ): Promise<RunResult> {
    const maxIterations = options?.maxIterations ?? 30
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]

    let iterations = 0

    while (iterations < maxIterations) {
      this.hooks.onIterationStart?.(iterations)

      let response: ChatResponse
      try {
        response = await this.provider.chat(
          messages,
          DEFAULT_TOOLS,
          { onText: this.hooks.onText }
        )
      } catch (err) {
        return {
          content: (err as Error).message,
          iterations,
          status: 'error',
          messages,
        }
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        ...(response.tool_calls.length > 0
          ? { tool_calls: response.tool_calls }
          : {}),
      })

      if (!response.tool_calls.length) {
        return {
          content: response.content,
          iterations,
          status: 'done',
          messages,
        }
      }

      const toolResults = await Promise.all(
        response.tool_calls.map(async (tc) => {
          this.hooks.onToolCall?.(tc.name, tryParseJson(tc.arguments))

          let result: string
          try {
            const handler = TOOL_HANDLERS[tc.name]
            if (!handler) {
              result = `Error: unknown tool "${tc.name}"`
            } else {
              const args = JSON.parse(tc.arguments)
              result = await handler(args)
            }
          } catch (err) {
            result = `Error: ${(err as Error).message}`
          }

          this.hooks.onToolResult?.(tc.name, result)
          return { tool_call_id: tc.id, content: result }
        })
      )

      for (const tr of toolResults) {
        messages.push({
          role: 'tool' as const,
          tool_call_id: tr.tool_call_id,
          content: tr.content,
        })
      }

      iterations++
      this.hooks.onIterationEnd?.(iterations - 1)
    }

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')
    return {
      content: lastAssistant && 'content' in lastAssistant
        ? lastAssistant.content
        : '',
      iterations,
      status: 'max_iterations',
      messages,
    }
  }
}
