# Provider

A Provider is a translation layer between the agent loop and an LLM API. It has one job: take messages and tool definitions in, return a response. It doesn't hold conversation history, it doesn't know it's inside a loop, and it doesn't make decisions. The agent loop handles all of that.

## Interface

```typescript
interface Provider {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse>
}
```

One method. Messages in, response out. The optional `options` bag lets the agent thread per-call callbacks (like `onText` for streaming) without baking them into the provider's config.

## Types

### Message

The conversation within a single `agent.run()` call. Messages accumulate as the agent loop calls tools and feeds results back.

```typescript
type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
```

- `system` — the agent's personality and instructions
- `user` — the human's prompt
- `assistant` — what the LLM said (may include tool calls)
- `tool` — result of executing a tool, matched by `tool_call_id`

### ToolDefinition

Describes a tool the LLM can call. Passed on every `chat()` invocation — the Provider doesn't hold them.

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}
```

### ChatResponse

What came back from the LLM.

```typescript
interface ChatResponse {
  content: string
  tool_calls: ToolCall[]
}
```

The agent loop's decision is trivial: `tool_calls.length > 0` means keep looping. Otherwise, done.

### ToolCall

A single tool invocation requested by the LLM.

```typescript
interface ToolCall {
  id: string
  name: string
  arguments: string  // JSON string, caller parses
}
```

## Streaming

Streaming is a rendering concern, not a logic concern. The agent owns it via hooks.

Internally, the OpenAI implementation always uses the streaming API (it's strictly better — same data, earlier visibility). The agent passes its `onText` hook through the per-call `options` parameter. Tokens flow to the terminal while the promise is pending. When the stream finishes, the full `ChatResponse` resolves.

```typescript
const agent = new Agent({
  provider: new OpenAIProvider({
    apiKey: 'sk-...',
    model: 'gpt-4.1',
  }),
  hooks: {
    onText: (delta) => process.stdout.write(delta),
  },
})
```

The agent loop threads `onText` to the provider on each `chat()` call. The provider doesn't own the callback — it just uses whatever is passed.

## Implementing a Provider

A Provider is constructed with whatever config it needs. That's not part of the interface — different providers have different needs.

### OpenAIProvider

```typescript
import { OpenAIProvider } from '@welluable/agn-cli'

const provider = new OpenAIProvider({
  apiKey: 'sk-...',
  model: 'gpt-4.1',
  baseUrl: 'https://api.openai.com/v1',  // optional, for proxies/Azure/local
})
```

### Config

| Field     | Required | Description                                |
|-----------|----------|--------------------------------------------|
| `apiKey`  | yes      | OpenAI API key                             |
| `model`   | yes      | Model identifier (e.g. `gpt-4.1`)         |
| `baseUrl` | no       | Override API endpoint                      |

Streaming (`onText`) is not a provider config option — it's an agent-level hook that gets threaded to the provider per-call via `options`.

### Writing Your Own

Implement the `Provider` interface. One method, one contract.

```typescript
import type { Provider, Message, ToolDefinition, ChatResponse } from '@welluable/agn-cli'

class MyProvider implements Provider {
  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse> {
    // translate messages/tools to your API's format
    // call the API (stream if options.onText is provided)
    // translate the response back to ChatResponse
  }
}
```

That's it. The agent doesn't know or care which provider it's talking to.
