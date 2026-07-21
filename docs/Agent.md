# Agent

The Agent is the core loop. It takes a prompt, talks to an LLM, executes tool calls, feeds results back, and repeats until the task is done. One method: `agent.run(prompt)`. Everything happens inside that call.

## The Loop

Every `run()` follows the same cycle:

```
User prompt
    ↓
┌─→ LLM call (with full message history + tool definitions)
│       ↓
│   Response has tool calls?
│       ├─ YES → execute tools → append results → ─┐
│       │                                           │
│       └─ NO  → return final text                  │
│                                                   │
└───────────────────────────────────────────────────┘
```

That's it. The agent is a `while` loop around a provider call.

### Step by step

1. Build the initial message array: system prompt (with an optional session ID note and skills index) + user prompt
2. Call `provider.chat(messages, tools, { onText })` — the provider handles the LLM API
3. Append the assistant's response to the message array and fire `onAssistantMessage`
4. If the response contains `tool_calls`, execute each one and append `{ role: 'tool', tool_call_id, content }` for every result
5. Go to step 2
6. If the response has no `tool_calls`, the model is done — return the final text

The message array grows with every iteration. The LLM sees everything: its own prior responses, every tool call it made, every tool result. This is how it maintains context across a multi-step task.

When the CLI sets `global.sessionId`, the system prompt includes `Session ID for this run: <id>`. Programmatic callers can set the same global value before calling `agent.run()` if they want the session ID included in the prompt.

### Worked example

Prompt: `"summarize all the files into one summary.md file"`

**Iteration 1** — The LLM needs to know what files exist.

```
Assistant: I'll start by listing the files.
Tool calls: [shell({ command: "ls -la" })]
```

Agent executes `shell("ls -la")`, gets back the directory listing, appends it as a tool result.

**Iteration 2** — The LLM now reads the files.

```
Assistant: Let me read each file.
Tool calls: [
  read_file({ path: "src/agent.ts" }),
  read_file({ path: "src/types.ts" }),
  read_file({ path: "src/tools.ts" })
]
```

Agent executes all three in parallel, appends three tool results.

**Iteration 3** — The LLM has all the content, writes the summary.

```
Assistant: Here's the summary. Writing it now.
Tool calls: [write_file({ path: "summary.md", content: "# Summary\n..." })]
```

Agent executes the write, appends the result.

**Iteration 4** — No tool calls. Done.

```
Assistant: Created summary.md with a summary of all 3 files.
Tool calls: []
```

Agent returns the final text. `run()` resolves.

## Tool Execution

The agent has 5 built-in tools: `read_file`, `write_file`, `patch`, `shell`, `read_skill`. Each tool has two parts:

- **Definition** — JSON Schema that the LLM sees (name, description, parameters). This tells the model what tools exist and how to call them.
- **Handler** — the actual function that runs when the tool is called. `read_file` calls `fs.readFile`, `shell` calls `child_process.exec`, `read_skill` loads a skill by name, etc.

The agent keeps a registry: a map from tool name to handler function.

```
"read_file"   → (args) => fs.readFile(args.path)
"write_file"  → (args) => fs.writeFile(args.path, args.content)
"patch"       → (args) => read, replace, write
"shell"       → (args) => exec(args.command)
"read_skill"  → (args) => load skill by name, return full content
```

When the LLM returns tool calls, the agent:

1. Parses the `arguments` JSON string
2. Looks up the handler by name
3. Calls the handler with the parsed arguments
4. Catches any error and returns it as the tool result (so the LLM can see what went wrong and retry)
5. Wraps the result as `{ role: 'tool', tool_call_id, content }`

Multiple tool calls in one response are executed in parallel with `Promise.all`. The LLM asked for them at the same time, so there's no dependency between them.

### No custom tools

The agent's toolset is fixed: `read_file`, `write_file`, `patch`, `shell`, `read_skill`. You can't pass in additional tools. The constructor doesn't accept a `tools` option.

This is intentional. The 5 tools are general enough to do anything — read, write, edit, run commands, load domain knowledge. Adding more tools adds surface area the LLM has to reason about and more things that can go wrong.

The way to extend the agent is **skills** — markdown files that teach the model *how* to use the 5 tools for a specific domain. A skill doesn't give the agent new capabilities. It gives it better judgment about the capabilities it already has.

## Skills

Skills are markdown files (`SKILL.md`) that provide domain-specific knowledge to the agent. They live in three locations:

- **Internal**: bundled with agn in `dist/skills/`, such as `create-skill`
- **Global**: `~/.agn/skills/` — available in every project
- **Project**: `.agn/skills/` — project-specific, overrides global and internal skills with the same directory name

Each skill has YAML frontmatter with `name` and `description`, followed by markdown content. Supporting `.md` files in the same directory, including nested markdown files, are bundled automatically when the skill is loaded.

### Auto-discovery (default)

When no `skills` option is passed to the constructor, the agent auto-discovers all available skills from internal, global, and project directories and builds an index for the system prompt. The LLM sees a list of available skills with descriptions and can load any of them at runtime using `read_skill`.

```typescript
const agent = new Agent({ provider })
// System prompt includes: "You have skills available..." followed by a list of discovered skills
```

### Explicit loading

Pass skill names to pre-load them directly into the system prompt. The LLM gets the full skill content upfront without needing to call `read_skill`. Explicitly loaded skills are wrapped in mandatory instructions telling the model to follow them and not call `read_skill` for them.

```typescript
const agent = new Agent({
  provider,
  skills: 'my-skill',            // single skill
})

const agent = new Agent({
  provider,
  skills: ['skill-a', 'skill-b'], // multiple skills
})
```

Skills are resolved by directory name or by the `name` field in the YAML frontmatter. Precedence by directory name is internal < global < project.

## Max Iterations

The loop has a cap. Default is 30 iterations. If the model keeps calling tools past the limit, the agent stops and returns whatever it has. This prevents runaway loops from a model that can't finish.

Each "iteration" is one LLM call. A response with 5 parallel tool calls is still 1 iteration.

```typescript
agent.run("do the thing", { maxIterations: 50 })
```

## Hooks

The agent accepts optional callbacks for observability. These are for rendering — the loop doesn't change behavior based on them.

| Hook | Fires when |
|---|---|
| `onToolCall({ id, name, args })` | A tool is about to be executed |
| `onToolResult({ id, name, result })` | A tool finished executing |
| `onAssistantMessage({ content, iteration })` | A complete assistant segment is stored, before its tool calls |
| `onText(delta)` | A text token streams from the LLM |
| `onIterationStart(index)` | A new loop iteration begins |
| `onIterationEnd(index)` | A loop iteration completes |

Tool hook callback signatures are object-shaped so callers can correlate concurrent
start and completion events by `id`. The CLI uses these hooks for both terminal
rendering and structured NDJSON output. The programmatic API can ignore them
entirely.

## RunResult

`run()` returns a `RunResult`:

```typescript
interface RunResult {
  content: string
  iterations: number
  status: 'done' | 'max_iterations' | 'error'
  messages: Message[]
}
```

| Field | Description |
|---|---|
| `content` | The assistant's final text response |
| `iterations` | How many loop iterations it took |
| `status` | `done` = model finished naturally, `max_iterations` = hit the cap, `error` = something broke |
| `messages` | The full message history from this run — useful for debugging or chaining |

## What the Agent Does NOT Do

- **No conversation history between runs.** Each `run()` starts fresh. The filesystem is the state.
- **No confirmation prompts.** The agent always executes tool calls without asking for approval.
- **No retries on API errors.** The provider can retry internally. The agent just surfaces the error.
- **No streaming decisions.** Streaming is handled by the provider via `onText`. The agent doesn't know or care.
- **No tool selection logic.** The agent passes all 5 tools to every LLM call. The model decides which to use.
- **No custom tools.** The toolset is fixed. Extend with skills, not tools.

## Relationship to Other Components

```
┌──────────────────────────────────────────┐
│  CLI / Programmatic caller               │
│  (parses args, renders output)           │
└──────────────────┬───────────────────────┘
                   │ agent.run(prompt)
                   ▼
┌──────────────────────────────────────────┐
│  Agent                                   │
│  (the loop: LLM call → tools → repeat)   │
│                                          │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │  Provider   │    │  Tool Registry  │  │
│  │  (LLM API)  │    │  (5 built-ins)  │  │
│  └─────────────┘    └─────────────────┘  │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  Skills (auto-discovered or explicit)││
│  │  (injected into system prompt)       ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

The Provider translates to/from the LLM API. The Tool Registry maps names to handlers. Skills inject domain knowledge into the system prompt. The Agent orchestrates all three. The CLI is just a thin wrapper that calls `agent.run()` and renders the output.
