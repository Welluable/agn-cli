import type { Provider, Message, ChatResponse } from './types.js'
import { DEFAULT_TOOLS, TOOL_HANDLERS } from './tools.js'
import { buildSkillIndex, loadExplicitSkills } from './skills.js'

const SYSTEM_PROMPT = `
  You are a helpful coding agent. Help the user with programming, code questions, and technical tasks.

  ## Hard constraints
  - Always readd .gitignore before reading any files in the codebase.
  - Never read or write to files which are mentioned in the .gitignore file.
  - You are an YOLO agent. You do not need to ask for confirmation before reading or writing to files. Until user asks you specifically to ask for confirmation, you should not ask for confirmation.
  - Do not explain your actions. Just do them. Until user asks you specifically to explain your actions, you should not explain your actions.
  - Don't tell how to fix the code. Just fix it. Until user asks you specifically to explain how to fix the code, you should not explain how to fix the code.
`

export interface AgentHooks {
  onToolCall?: (call: {
    id: string
    name: string
    args: Record<string, unknown>
  }) => void
  onToolResult?: (call: {
    id: string
    name: string
    result: string
  }) => void
  onAssistantMessage?: (message: {
    content: string
    iteration: number
  }) => void
  onText?: (delta: string) => void
  onIterationStart?: (index: number) => void
  onIterationEnd?: (index: number) => void
}

export interface AgentOptions {
  provider: Provider
  hooks?: AgentHooks
  skills?: string | string[]
}

export interface RunResult {
  content: string
  iterations: number
  status: 'done' | 'max_iterations' | 'error'
  messages: Message[]
}

declare global {
  // Provided by injection in cli
  // @ts-ignore
  var sessionId: string | undefined
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
  private skills?: string | string[]

  constructor(options: AgentOptions) {
    this.provider = options.provider
    this.hooks = options.hooks ?? {}
    this.skills = options.skills
  }

  private async buildSystemPrompt(): Promise<string> {
    let sessionNote = ''
    if (typeof global.sessionId === 'string' && global.sessionId) {
      sessionNote = `\n\nSession ID for this run: ${global.sessionId}`
    }
    const skillsContent = this.skills === undefined
      ? await buildSkillIndex()
      : [
        '<mandatory_skill_instructions>',
        'The following skill has been loaded for this task. You MUST follow its instructions exactly as written.',
        'These are operational procedures, NOT reference material. Do NOT answer the user\'s question directly — instead, execute the steps defined in the skill.',
        'Do NOT use read_skill — the skill is already loaded below.',
        '',
        await loadExplicitSkills(this.skills),
        '</mandatory_skill_instructions>',
      ].join('\n')

    return [SYSTEM_PROMPT, sessionNote, skillsContent]
      .filter(Boolean)
      .join('\n\n')
  }

  async run(
    prompt: string,
    options?: { maxIterations?: number }
  ): Promise<RunResult> {
    const maxIterations = options?.maxIterations ?? 30
    const systemPrompt = await this.buildSystemPrompt()
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
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

      if (response.content) {
        this.hooks.onAssistantMessage?.({
          content: response.content,
          iteration: iterations,
        })
      }

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
          this.hooks.onToolCall?.({
            id: tc.id,
            name: tc.name,
            args: tryParseJson(tc.arguments),
          })

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

          this.hooks.onToolResult?.({
            id: tc.id,
            name: tc.name,
            result,
          })
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
