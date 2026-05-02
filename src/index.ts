export const VERSION = "0.0.1";

export { Agent } from './agent.js'
export type { RunResult, AgentHooks, AgentOptions } from './agent.js'
export { OpenAIProvider } from './providers/openai.js'
export type { Provider, Message, ChatResponse, ToolCall, ToolDefinition, ToolHandler } from './types.js'
