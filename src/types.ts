export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface ChatResponse {
  content: string
  tool_calls: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface Provider {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse>
}

export type OutputFormat = 'text' | 'json' | 'stream-json'

export type StreamEvent =
  | {
      type: 'system'
      subtype: 'init'
      session_id: string
      model: string
      cwd: string
      version: string
    }
  | {
      type: 'user'
      session_id: string
      message: { role: 'user'; content: string }
    }
  | {
      type: 'assistant'
      session_id: string
      message: { role: 'assistant'; content: string }
    }
  | {
      type: 'assistant'
      subtype: 'delta'
      session_id: string
      delta: string
    }
  | {
      type: 'tool_call'
      subtype: 'started'
      session_id: string
      call_id: string
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_call'
      subtype: 'completed'
      session_id: string
      call_id: string
      name: string
      output: string
    }
  | {
      type: 'result'
      subtype: 'success' | 'max_iterations'
      session_id: string
      result: string
      iterations: number
      is_error: boolean
    }
  | {
      type: 'result'
      subtype: 'error'
      session_id: string
      error: string
      is_error: true
      iterations?: number
    }
