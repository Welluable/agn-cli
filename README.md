# agn-cli

A small, inspectable coding agent for the terminal and for TypeScript programs.

`agn` takes one prompt, calls an LLM, lets the model use four built-in tools, and exits. The goal is to keep the agent primitive simple enough to understand: a loop, a provider, and tools for reading, writing, patching, and running shell commands.

> **Yolo by design:** `agn` can read files, write files, patch files, and execute shell commands without confirmation prompts. Run it only in directories and environments where that is acceptable.

## Features

- **Simple agent loop** — LLM response → tool calls → tool results → repeat until done.
- **Terminal CLI** — run one task from your shell with `agn "..."`.
- **Programmatic API** — import `Agent` and `OpenAIProvider` in TypeScript/JavaScript.
- **Built-in tools** — `read_file`, `write_file`, `patch`, and `shell`.
- **Streaming text output** — provider text deltas can stream to the terminal via hooks.
- **OpenAI provider** — OpenAI chat completions with tool calling support.
- **Small codebase** — intended to be easy to read, fork, and modify.

## Installation

```bash
npm install -g @welluable/agn-cli
```

Or run it without installing globally:

```bash
npx @welluable/agn-cli "list the files in this project"
```

Requires Node.js 18 or newer.

## Quick start

Configure your API key and default model:

```bash
agn init
```

Then run a task:

```bash
agn "find all TODO comments and summarize them by file"
```

Override the model for a single run:

```bash
agn --model gpt-4.1-mini "add a .gitignore for a Node project"
```

Show help/version:

```bash
agn --help
agn --version
```

## Configuration

`agn init` writes a config file to:

```text
~/.agn/config.yml
```

Example:

```yaml
provider: openai
model: gpt-4.1
api_key: sk-...
```

You can also configure it with environment variables:

| Variable | Description |
| --- | --- |
| `AGN_PROVIDER` | Provider name. Currently only `openai` is implemented. |
| `AGN_MODEL` | Default model identifier. |
| `AGN_API_KEY` | API key used by the provider. |

Resolution order:

1. CLI flags, for example `--model`
2. Environment variables
3. `~/.agn/config.yml`
4. Built-in defaults

> Note: the init flow includes an Anthropic option, but the current CLI implementation only creates the OpenAI provider. Anthropic support is planned, not implemented.

## CLI usage

```bash
agn "rename all .jpeg files in this folder to .jpg"
agn "run npm test and fix any failures"
agn "read package.json and explain the available scripts"
agn "curl https://example.com/health and tell me the status"
```

The CLI streams assistant text and displays tool calls as they happen. A task exits with:

| Exit code | Meaning |
| --- | --- |
| `0` | Completed successfully. |
| `1` | Failed, hit max iterations, missing config/API key, or provider error. |

## Programmatic usage

```ts
import { Agent, OpenAIProvider } from '@welluable/agn-cli'

const agent = new Agent({
  provider: new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4.1-mini',
  }),
  hooks: {
    onText: (delta) => process.stdout.write(delta),
    onToolCall: (name, args) => console.log('\nTool:', name, args),
    onToolResult: (name, result) => console.log('\nResult:', name, result),
  },
})

const result = await agent.run('list all files in the current directory')

console.log(result.status)
console.log(result.iterations)
```

`agent.run()` returns:

```ts
interface RunResult {
  content: string
  iterations: number
  status: 'done' | 'max_iterations' | 'error'
  messages: Message[]
}
```

You can raise the loop limit for larger tasks:

```ts
await agent.run('migrate the small utility files to TypeScript', {
  maxIterations: 50,
})
```

## How it works

The core loop lives in `src/agent.ts`:

1. Start with a system message and the user prompt.
2. Call `provider.chat(messages, tools)`.
3. Append the assistant response to the message history.
4. If the model requested tool calls, execute them and append tool results.
5. Repeat until the model returns no tool calls or the max iteration limit is reached.

The default toolset lives in `src/tools.ts`:

| Tool | What it does |
| --- | --- |
| `read_file` | Reads a UTF-8 file. |
| `write_file` | Creates/overwrites a UTF-8 file, creating parent directories as needed. |
| `patch` | Replaces an exact string in an existing file. |
| `shell` | Runs a shell command and returns stdout/stderr. |

The provider interface lives in `src/types.ts`:

```ts
interface Provider {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse>
}
```

This keeps model/API-specific code separate from the agent loop. The included implementation is `OpenAIProvider` in `src/providers/openai.ts`.

## Repository layout

```text
src/
  agent.ts             Agent loop and hooks
  cli.ts               Command-line entrypoint
  config.ts            Config/env resolution
  init.ts              Interactive config setup
  providers/openai.ts  OpenAI provider implementation
  renderer.ts          Terminal rendering hooks
  tools.ts             Built-in tool definitions and handlers
  types.ts             Shared Provider/message/tool types

docs/
  Agent.md             Agent loop details
  Cli.md               CLI behavior and examples
  Provider.md          Provider interface details

examples/
  openai.ts            Programmatic OpenAI example
```

## Local development

Clone the repository and install dependencies:

```bash
git clone https://github.com/welluable/agn-cli.git
cd agn-cli
npm install
```

Build TypeScript:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the CLI locally after building:

```bash
node dist/cli.js --help
node dist/cli.js "list files in this repository"
```

Run the OpenAI example:

```bash
OPENAI_API_KEY=sk-... npm run example -- examples/openai.ts
```

## Safety notes

- `agn` does not ask before modifying files or running commands.
- Prefer trying it in a clean git working tree so you can inspect/revert changes.
- Avoid running it with unnecessary credentials in the environment.
- Do not commit API keys or local `.env` files.
- The `shell` tool uses your system shell and inherits the permissions of the current process.

## Current limitations

- Only the OpenAI provider is implemented.
- No confirmation mode.
- No sandbox mode.
- No stdin/pipe mode.
- No structured output mode.
- No custom tool registration.
- No conversation history between `run()` calls.

Some of these ideas are explored in `docs/`, `idea.md`, and `complex.md`, but they should be treated as design notes unless the code implements them.

## Contributing

Contributions are welcome. A good contribution keeps the project easy to understand.

Suggested workflow:

1. Open an issue or discussion for larger changes.
2. Keep pull requests focused and small.
3. Run `npm run build` and `npm test` before submitting.
4. Update docs/README examples when behavior changes.
5. Avoid adding broad abstractions unless they simplify the codebase.

Good first areas:

- Provider improvements and additional providers.
- Tests for the agent loop, tools, config resolution, and provider translation.
- Safer execution options that remain easy to understand.
- Documentation improvements and realistic examples.

## License

MIT © Welluable
