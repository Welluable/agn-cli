# CLI

Command-line interface for agn. One prompt in, one result out. Yolo.

agn is a yolo coding agent. It runs a single task and exits — no confirmation prompts, no hand-holding. It plans, uses 5 tools (`read_file`, `write_file`, `patch`, `shell`, `read_skill`), and reports the result. No conversation history is carried between runs. Each CLI invocation gets a fresh session ID, and the filesystem carries state between runs.

## Install

Global install (recommended):

```bash
npm install -g @welluable/agn-cli
```

Run without installing:

```bash
npx @welluable/agn-cli "find all TODO comments"
```

Local project dependency:

```bash
npm install @welluable/agn-cli
```

## Setup

```bash
agn init
```

Walks through provider, API key, and default model:

```
Welcome to agn.

Select a provider:
  ❯ OpenAI
    Anthropic

Paste your API key: sk-••••••••••••

Default model (gpt-4.1):

Config saved to ~/.agn/config.yml
```

Saves to `~/.agn/config.yml`:

```yaml
# ~/.agn/config.yml
provider: openai
model: gpt-4.1
api_key: sk-...
```

| Field | Description |
|---|---|
| `provider` | LLM provider — `openai` or `anthropic` |
| `model` | Default model identifier (e.g. `gpt-4.1`, `claude-sonnet-4-20250514`) |
| `api_key` | API key for the selected provider |

Run `agn init` again anytime to change any value.

## Usage

```bash
agn "find all TODO comments and list them by file"
agn --help
agn -h
agn --version
agn -v
```

`agn --help` and `agn -h` print the full command reference with examples and
exit without loading configuration, contacting a provider, or creating a
session ID. Both flags are global, so forms such as `agn init --help` and
`agn skill new --help` work too.

`agn --version` and `agn -v` print the package version and exit without creating a session ID.

### List skills

Show discovered skills (internal/global/project, with project overriding global on name collisions):

```
agn skills list
```

Output is a compact list (one skill per line), e.g.:

```
create-skill  Create a skill file...
prisma       Work with Prisma schemas...
```

### Create a new skill

Scaffold a new skill directory with a `SKILL.md` file:

```
agn skill new my-skill --description "Knows how to do X" --project
```

Create it globally instead (in `~/.agn/skills/...`):

```
agn skill new my-skill --description "Knows how to do X" --global
```

Flags:

- `--description "..."` optional description to include in the `SKILL.md` frontmatter
- `--project` create under `.agn/skills/<name>/` (default)
- `--global` create under `~/.agn/skills/<name>/`

Skills are markdown files that teach the agent domain-specific knowledge. They live in three locations:

- **Internal**: bundled with agn in `dist/skills/`, such as `create-skill`
- **Global**: `~/.agn/skills/<skill-name>/SKILL.md` — available in every project
- **Project**: `.agn/skills/<skill-name>/SKILL.md` — project-specific, overrides global and internal skills with the same directory name

Each skill directory contains a `SKILL.md` file with YAML frontmatter (`name`, `description`) and markdown content. Supporting `.md` files in the same directory, including nested markdown files, are bundled automatically when the skill is loaded.

### How it works

When agn runs, it scans internal, global, and project skill directories and builds an index of available skills. The index is injected into the system prompt so the LLM knows what skills exist. The LLM can then load any skill at runtime using the `read_skill` tool.

```
PLAN:
  1. Search for all TODO/FIXME comments using rg
  2. Group results by file
  3. Format as a readable list
```

Then it executes — calling tools, feeding results back into the loop — until the task is done. Each tool call is shown as it happens:

```
┌─ shell: rg "TODO|FIXME" -n
│  src/agent.ts:12: // TODO: add tool execution loop
│  src/cli.ts:1: // TODO: implement CLI parser
│  src/tools.ts:40: // FIXME: validate path before read
└─ done

Found 3 items across 3 files:
  src/agent.ts:12    — TODO: add tool execution loop
  src/cli.ts:1       — TODO: implement CLI parser
  src/tools.ts:40    — FIXME: validate path before read
```

More examples:

```bash
agn "rename all .jpeg files to .jpg in this folder"
agn "hit api.example.com/health and tell me the status"
agn "kill whatever is running on port 3000"
```

## Flags

| Flag | Description |
|---|---|
| `-p`, `--print` | Use non-interactive print mode (inferred when stdout is not a TTY) |
| `--output-format <text\|json\|stream-json>` | Select human text, one buffered result object, or live NDJSON |
| `--stream-partial-output` | Emit assistant token deltas; valid only with `stream-json` |
| `--model <id>` | Override the default model for this run |
| `--trace` | Print the trace path for the current prompt run under `~/.agn/traces/<session-id>.md` and write a markdown trace containing run metadata plus the JSON message/tool-call history |
| `--description <text>` | Set the description used by `skill new` |
| `--global` | Create a global skill with `skill new` |
| `--project` | Create a project skill with `skill new` (default) |
| `-h`, `--help` | Print commands, options, examples, and exit |
| `-v`, `--version` | Print the package version and exit |

```bash
agn --help
agn "organize downloads by file type"
agn --model gpt-4.1-mini "add a .gitignore for a Node project"
agn --trace "run npm test and summarize the result"
```

## Structured output

`--output-format json` writes exactly one `result` object. `stream-json` writes
one JSON object per line: `system.init`, the `user` prompt, live assistant and
tool-call events, and exactly one terminal `result`. Every event includes the
session ID. Tool starts and completions share a `call_id`.

```bash
agn -p --output-format json "2+2?" | jq .result
agn -p --output-format stream-json "list src" \
  | jq -c 'select(.type == "tool_call")'
agn -p --output-format stream-json --stream-partial-output "write a haiku" \
  | jq -rj 'select(.type == "assistant" and .subtype == "delta") | .delta'
```

Structured stdout contains JSON only. Session IDs, trace notices, compatibility
warnings, and human-readable errors go to stderr. Without
`--stream-partial-output`, each complete assistant segment is emitted live before
that segment's tool calls. Partial mode emits token-level `assistant.delta`
events and suppresses the duplicate full segment.

## Config Resolution

When the same setting is specified in multiple places, highest priority wins:

1. **Flags** (`--model gpt-4.1-mini`)
2. **Environment variables** (`AGN_MODEL=gpt-4.1-mini`)
3. **Config file** (`~/.agn/config.yml`)
4. **Defaults**

Example: config file says `model: gpt-4.1`, but you run `agn --model gpt-4.1-mini "..."` — the flag wins, and this run uses `gpt-4.1-mini`. The config file is not modified. Trace mode is controlled only by the `--trace` flag.

## Sessions

Each non-version CLI invocation generates an in-memory UUID session ID and prints it as `Session ID: <id>` before exit on success or error paths. Prompt runs inject the same ID into the agent system prompt so the model can reference the run identifier. `agn --version` and `agn -v` print the package version and exit without creating a session ID.

When `--trace` is used on a prompt run, the CLI prints:

```text
Trace mode enabled. Tracepath: ~/.agn/traces/<session-id>.md
```

After the prompt run finishes, the CLI creates the trace directory if needed and writes a markdown file at that path. The file contains a fenced metadata block, a `## Messages & tool calls` heading, and a fenced JSON dump of the messages returned by `agent.run()`.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — task completed or version printed |
| `1` | Error — agent failed, config missing, API error, or user abort |

## Environment Variables

| Variable | Description |
|---|---|
| `AGN_PROVIDER` | Provider name (`openai`, `anthropic`) |
| `AGN_MODEL` | Default model identifier |
| `AGN_API_KEY` | API key (alternative to config file) |

```bash
export AGN_PROVIDER=anthropic
export AGN_MODEL=claude-sonnet-4-20250514
```

Environment variables are useful for CI/CD where you don't want a config file, or when switching providers temporarily without modifying `~/.agn/config.yml`.

## Skills

Skills are markdown files that teach the agent domain-specific knowledge.

### List skills

Show discovered skills (internal/global/project, with project overriding global on name collisions):

```bash
agn skills list
```

Output is a compact list (one skill per line), e.g.:

```text
create-skill  Create a skill file...
prisma       Work with Prisma schemas...
```

### Create a new skill

Scaffold a new skill directory with a `SKILL.md` file:

```bash
agn skill new my-skill --description "Knows how to do X" --project
```

Create it globally instead (in `~/.agn/skills/...`):

```bash
agn skill new my-skill --description "Knows how to do X" --global
```

Flags:

- `--description "..."` optional description to include in the `SKILL.md` frontmatter
- `--project` create under `.agn/skills/<name>/` (default)
- `--global` create under `~/.agn/skills/<name>/`

Skills are markdown files that teach the agent domain-specific knowledge. They live in three locations:

- **Internal**: bundled with agn in `dist/skills/`, such as `create-skill`
- **Global**: `~/.agn/skills/<skill-name>/SKILL.md` — available in every project
- **Project**: `.agn/skills/<skill-name>/SKILL.md` — project-specific, overrides global and internal skills with the same directory name

Each skill directory contains a `SKILL.md` file with YAML frontmatter (`name`, `description`) and markdown content. Supporting `.md` files in the same directory, including nested markdown files, are bundled automatically when the skill is loaded.

### How it works

When agn runs, it scans internal, global, and project skill directories and builds an index of available skills. The index is injected into the system prompt so the LLM knows what skills exist. The LLM can then load any skill at runtime using the `read_skill` tool.

### Creating a skill

```
~/.agn/skills/
  my-skill/
    SKILL.md
    reference.md   # optional supporting file
```

```markdown
---
name: my-skill
description: Knows how to do the specific thing
---

# My Skill

Instructions for the agent...
```

### Skill resolution

Skills are resolved by directory name or by the `name` field in the YAML frontmatter. Precedence by directory name is internal < global < project, so you can customize a built-in or global skill per-project.

## Examples

### Alias

agn is already yolo, so the alias is just a shorter name:

```bash
alias a="agn"

a "compress all PNGs in this folder"
a "curl api.example.com/health and tell me the status"
a "kill whatever is running on port 3000"
```

### Shell Script

Each line is a deterministic step. agn handles the intelligence within each step. The filesystem carries state between runs — code written in step 1 is there on disk for step 2 to read. No flags needed — agn is yolo.

```bash
#!/bin/bash
set -e

agn "read db/schema.prisma and generate TypeScript types in src/types/db.ts"
agn "run npx tsc --noEmit and fix any type errors"
agn "run npm test and fix any failures"

echo "Done."
```

### Git Hook

```bash
# .git/hooks/pre-commit
agn "check staged files for console.logs and hardcoded secrets"
```

### Cron

```bash
0 9 * * * cd ~/project && agn "summarize yesterday's git log into a standup note"
```

### Programmatic (TypeScript)

Import agn as a library for full control — conditionals, loops, parallelism, error handling.

```typescript
import { Agent, OpenAIProvider } from '@welluable/agn-cli'

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4.1',
})

const agent = new Agent({ provider })

const schema = await agent.run("read the database schema and summarize it")

await agent.run(`generate TypeScript types for: ${schema.content}`)

const tests = await agent.run("run the tests")

if (tests.status !== 'done') {
  await agent.run(`fix the failing tests: ${tests.content}`)
}
```

Run independent tasks concurrently:

```typescript
const [types, docs, tests] = await Promise.all([
  agent.run("generate types from the schema"),
  agent.run("update the API documentation"),
  agent.run("write tests for the new endpoints"),
])
```

Pre-load skills for a specific domain:

```typescript
const agent = new Agent({
  provider,
  skills: ['prisma', 'testing'],
})

await agent.run("add a new user table with email and role fields")
```

---

## Future (Not Implemented Yet)

The following features are planned but not part of the initial build.

### Confirmation Mode (`--confirm`)

Safety net flag. Ask before each `write_file`, `patch`, and `shell` call. `read_file` executes without asking. Prompt: `[y]es / [n]o / [a]bort`.

### Pipe Mode

Read from stdin, inject into prompt. Clean stdout (final result only), diagnostics to stderr. Makes agn composable with Unix pipes (`cat`, `jq`, `rg`, etc).

### Structured Output (`--output`)

Pass `--output` with a JSON schema. Force the agent's final response to match the schema exactly. Uses OpenAI's structured output under the hood.

### Sandbox Mode (`--sandbox`)

Run in a disposable Docker container. Show diff when done. Apply or discard. Requires Docker.
