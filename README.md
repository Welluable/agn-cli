# agn-cli

A small, inspectable coding agent for the terminal and for TypeScript/JavaScript programs.

`agn` runs a single prompt, calls an LLM provider, lets the model use the built-in tools, and exits. The implemented agent is intentionally simple: a message loop, an OpenAI provider, terminal rendering hooks, config loading, and tools for files and shell commands.

> **Yolo by design:** `agn` can read files, write files, patch files, and execute shell commands without confirmation prompts. Run it only in directories and environments where that is acceptable.

## Implemented functionality

- **Single-task CLI** with `agn "<prompt>"`.
- **Interactive config setup** with `agn init`.
- **Model override flag** with `--model <id>`.
- **Help and version flags** with `--help`, `-h`, `--version`, and `-v`.
- **Programmatic API** exporting `Agent`, `OpenAIProvider`, and shared TypeScript types.
- **Agent loop** that sends messages to a provider, executes requested tool calls, appends tool results, and repeats until the provider returns no tool calls or the max iteration count is reached.
- **Built-in tools**: `read_file`, `write_file`, `patch`, and `shell`.
- **OpenAI chat completions provider** with streaming response handling and function/tool-call support.
- **Terminal renderer hooks** that stream assistant text and print tool call/result summaries.
- **Config resolution** from environment variables and `~/.agn/config.yml`.

## Future plans

Planned features and areas of exploration include:

- **Additional providers**, starting with Anthropic support in the CLI/runtime path.
- **Optional confirmation mode** for approving file writes, patches, and shell commands before they run.
- **Sandbox mode** for executing tasks in an isolated disposable environment and reviewing a diff before applying changes.
- **Skills** loaded from markdown files in global and project-level `.agn/skills/` directories to teach project conventions without a plugin system.
- **Pipe/stdin mode** so prompts and input can be composed with standard Unix tools.
- **Structured output** support for JSON-schema-like results that scripts can parse and branch on reliably.
- **Improved orchestration examples** for CI, cron jobs, git hooks, migrations, and multi-step workflows.

## Installation

```bash
npm install -g @welluable/agn-cli
```

Or run without installing globally:

```bash
npx @welluable/agn-cli "list the files in this project"
```

Requires Node.js 18 or newer.

## Quick start

Configure provider settings:

```bash
agn init
```

Then run a task:

```bash
agn "find all TODO comments and summarize them by file"
```

Override the configured/default model for one run:

```bash
agn --model gpt-4.1-mini "read package.json and explain the scripts"
```

Show help or version:

```bash
agn --help
agn --version
```

## CLI usage

```text
agn [init] [--model <id>] "<prompt>"
agn init
agn --help
agn --version
```

Examples:

```bash
agn "rename all .jpeg files in this folder to .jpg"
agn "run npm test and fix any failures"
agn "read package.json and explain the available scripts"
agn "curl https://example.com/health and tell me the status"
```

The CLI streams assistant text to stdout. When tools run, it prints a compact tool block with the tool name, a short argument summary, and up to 20 lines of tool output.

Exit codes:

| Exit code | Meaning |
| --- | --- |
| `0` | The agent finished with status `done`. |
| `1` | Missing prompt/config/API key, unsupported provider, provider error, max iterations reached, or another runtime error. |

## Configuration

`agn init` writes a YAML config file to:

```text
~/.agn/config.yml
```

Example:

```yaml
provider: openai
model: gpt-4.1
api_key: sk-...
```

Environment variables are also supported:

| Variable | Description |
| --- | --- |
| `AGN_PROVIDER` | Provider name. Currently only `openai` is implemented. |
| `AGN_MODEL` | Default model identifier. |
| `AGN_API_KEY` | API key passed to the provider. |

Resolution order implemented by the CLI:

| Setting | Resolution order |
| --- | --- |
| Provider | `AGN_PROVIDER` → `~/.agn/config.yml` → `openai` |
| Model | `--model` → `AGN_MODEL` → `~/.agn/config.yml` → `gpt-4.1` |
| API key | `AGN_API_KEY` → `~/.agn/config.yml` |

If no API key is resolved, the CLI exits with an error.

`agn init` displays OpenAI and Anthropic choices and can write either provider name to the config file. The current run path only constructs an OpenAI provider; any other provider value exits with “Provider \"...\" is not implemented yet.”

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

`agent.run()` accepts a prompt and an optional max-iteration override:

```ts
const result = await agent.run('migrate the small utility files to TypeScript', {
  maxIterations: 50,
})
```

It returns:

```ts
interface RunResult {
  content: string
  iterations: number
  status: 'done' | 'max_iterations' | 'error'
  messages: Message[]
}
```

### Agent hooks

The `Agent` constructor accepts these optional hooks:

```ts
interface AgentHooks {
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  onToolResult?: (name: string, result: string) => void
  onText?: (delta: string) => void
  onIterationStart?: (index: number) => void
  onIterationEnd?: (index: number) => void
}
```

### OpenAIProvider options

```ts
new OpenAIProvider({
  apiKey: 'sk-...',
  model: 'gpt-4.1-mini',
  baseUrl: 'https://example-compatible-endpoint/v1', // optional
})
```

`baseUrl` is optional and is passed to the OpenAI SDK as `baseURL`.

## How it works

The core loop is implemented in `src/agent.ts`:

1. Start a new message list with a fixed system prompt and the user prompt.
2. Call `provider.chat(messages, DEFAULT_TOOLS, { onText })`.
3. Append the assistant response to the message history.
4. If the assistant requested tool calls, execute those tool calls.
5. Append each tool result as a `tool` message.
6. Repeat until no tool calls are returned, an error occurs, or `maxIterations` is reached.

Tool calls returned in the same assistant response are executed concurrently with `Promise.all`.

The default maximum iteration count is `30`. Each call to `agent.run()` starts a fresh message history; conversation history is returned in the result but is not carried into later runs automatically.

## Built-in tools

The default tool definitions and handlers are implemented in `src/tools.ts`.

| Tool | Arguments | Implemented behavior |
| --- | --- | --- |
| `read_file` | `{ path }` | Reads a UTF-8 file and returns its contents, or an error string. |
| `write_file` | `{ path, content }` | Creates parent directories as needed, writes UTF-8 content, overwrites existing files, and returns a byte-count message or error string. |
| `patch` | `{ path, old_string, new_string }` | Reads a UTF-8 file, replaces the first exact occurrence of `old_string` with `new_string`, writes the updated file, and returns a status/error string. |
| `shell` | `{ command }` | Runs `command` with Node's `child_process.exec` and returns stdout plus stderr, or the error message if there is no output. |

These are the tools used by both the CLI-created agent and the exported `Agent` class.

## Provider interface

The shared provider interface is implemented in `src/types.ts`:

```ts
interface Provider {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { onText?: (delta: string) => void }
  ): Promise<ChatResponse>
}
```

The included provider implementation is `OpenAIProvider` in `src/providers/openai.ts`. It sends chat completion requests with `stream: true`, maps internal tool definitions to OpenAI function tools, accumulates streamed text deltas, assembles streamed tool-call chunks, and returns `{ content, tool_calls }`.

## Repository layout

```text
src/
  agent.ts             Agent loop, run result, hooks
  cli.ts               Command-line entrypoint and argument parsing
  config.ts            Config file/env/default resolution
  init.ts              Interactive config writer
  providers/openai.ts  OpenAI provider implementation
  renderer.ts          Terminal rendering hooks
  tools.ts             Built-in tool definitions and handlers
  types.ts             Shared Provider/message/tool types
  index.ts             Package exports

docs/
  Agent.md
  Cli.md
  Provider.md

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
- Prefer using it in a clean git working tree so you can inspect or revert changes.
- Avoid running it with unnecessary credentials in the environment.
- Do not commit API keys or local `.env` files.
- The `shell` tool uses your system shell through `child_process.exec` and inherits the permissions and environment of the current process.

## Implemented limitations

- The CLI can run only the OpenAI provider.
- The built-in `Agent` uses the fixed default toolset from `src/tools.ts`.
- There is no confirmation prompt before file writes, patches, or shell commands.
- There is no sandboxing around shell commands or filesystem access.
- The CLI accepts a prompt as command-line arguments; it does not read prompt text from stdin.
- Each `agent.run()` call starts a new conversation.

## License

MIT © Welluable
