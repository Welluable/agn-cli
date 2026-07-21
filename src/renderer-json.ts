import type { AgentHooks } from './agent.js'
import type { StreamEvent } from './types.js'

export function emitStreamEvent(event: StreamEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

export function createJsonRenderer(options: { partial: boolean }): AgentHooks {
  const sessionId = global.sessionId ?? ''

  return {
    ...(options.partial
      ? {
          onText(delta: string) {
            emitStreamEvent({
              type: 'assistant',
              subtype: 'delta',
              session_id: sessionId,
              delta,
            })
          },
        }
      : {
          onAssistantMessage(message: { content: string }) {
            emitStreamEvent({
              type: 'assistant',
              session_id: sessionId,
              message: {
                role: 'assistant',
                content: message.content,
              },
            })
          },
        }),

    onToolCall({ id, name, args }) {
      emitStreamEvent({
        type: 'tool_call',
        subtype: 'started',
        session_id: sessionId,
        call_id: id,
        name,
        input: args,
      })
    },

    onToolResult({ id, name, result }) {
      emitStreamEvent({
        type: 'tool_call',
        subtype: 'completed',
        session_id: sessionId,
        call_id: id,
        name,
        output: result,
      })
    },
  }
}
