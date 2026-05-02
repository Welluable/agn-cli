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
