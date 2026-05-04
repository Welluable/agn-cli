# CLI

Command-line interface for agn. One prompt in, one result out. Yolo.

agn is a yolo coding agent. It runs a single task and exits — no confirmation prompts, no hand-holding. It plans, uses 5 tools (`read_file`, `write_file`, `patch`, `shell`, `read_skill`), and reports the result. No conversation history, no sessions. The filesystem carries state between runs.

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
```

Before touching anything, the agent thinks out loud:

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
| `--model <id>` | Override the default model for this run |
| `--version`, `-v` | Show version and exit |
| `--help`, `-h` | Show usage info and exit |

```bash
agn "organize downloads by file type"
agn --model gpt-4.1-mini "add a .gitignore for a Node project"
agn --version
```

## Config Resolution

When the same setting is specified in multiple places, highest priority wins:

1. **Flags** (`--model gpt-4.1-mini`)
2. **Environment variables** (`AGN_MODEL=gpt-4.1-mini`)
3. **Config file** (`~/.agn/config.yml`)
4. **Defaults**

Example: config file says `model: gpt-4.1`, but you run `agn --model gpt-4.1-mini "..."` — the flag wins, and this run uses `gpt-4.1-mini`. The config file is not modified.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — task completed |
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

Skills are markdown files that teach the agent domain-specific knowledge. They live in two directories:

- **Global**: `~/.agn/skills/<skill-name>/SKILL.md` — available in every project
- **Project**: `.agn/skills/<skill-name>/SKILL.md` — project-specific, overrides global skills with the same directory name

Each skill directory contains a `SKILL.md` file with YAML frontmatter (`name`, `description`) and markdown content. Supporting `.md` files in the same directory are bundled automatically.

### How it works

When agn runs, it scans both skill directories and builds an index of available skills. The index is injected into the system prompt so the LLM knows what skills exist. The LLM can then load any skill at runtime using the `read_skill` tool.

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

Skills are resolved by directory name or by the `name` field in the YAML frontmatter. Project skills override global skills with the same directory name, so you can customize a global skill per-project.

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
