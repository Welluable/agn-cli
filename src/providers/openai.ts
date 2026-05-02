import OpenAI from 'openai'
import type { Provider, Message, ChatResponse, ToolDefinition, ToolCall } from '../types.js'

interface OpenAIProviderConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export class OpenAIProvider implements Provider {
  private client: OpenAI
  private model: string

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey) throw new Error('apiKey is required')
    if (!config.model) throw new Error('model is required')

    this.model = config.model

    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    })
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse> {
    const openaiMessages = messages.map((msg) => {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        }
      }
      return { ...msg }
    })

    const request: Record<string, unknown> = {
      model: this.model,
      messages: openaiMessages,
      stream: true,
    }

    if (tools.length > 0) {
      request.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    const response = await this.client.chat.completions.create(request as any)

    let content = ''
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>()

    if (Symbol.asyncIterator in Object(response)) {
      for await (const chunk of response as any) {
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          content += delta.content
          options?.onText?.(delta.content)
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                arguments: tc.function?.arguments ?? '',
              })
            } else {
              const existing = toolCallMap.get(idx)!
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name = tc.function.name
              if (tc.function?.arguments) existing.arguments += tc.function.arguments
            }
          }
        }
      }
    } else {
      const message = (response as any).choices?.[0]?.message
      if (message) {
        content = message.content || ''
        if (message.tool_calls) {
          for (const tc of message.tool_calls) {
            toolCallMap.set(toolCallMap.size, {
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })
          }
        }
      }
    }

    const assembledToolCalls: ToolCall[] = [...toolCallMap.values()]

    if (!content && assembledToolCalls.length === 0) {
      throw new Error('No choices returned from OpenAI')
    }

    return {
      content: content || '',
      tool_calls: assembledToolCalls,
    }
  }
}
