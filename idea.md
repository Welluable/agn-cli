# Ash

A coding agent simple enough to fit in your head. Just a loop, an LLM, and 4 tools.

## Why

Every developer uses AI assistants now. But most of us don't understand what's happening inside them. It feels like magic — and magic is hard to trust, debug, or extend.

Ash exists to demystify agents. The entire codebase fits in your head. There's no abstraction you didn't write, no behavior you can't trace, no framework between you and the LLM.

It's also a daily driver. Not for building your next startup — for the small, annoying tasks you do twenty times a week. Rename these files. Hit this API. Fix this type error. Organize this folder. Write a quick script and run it. The stuff that takes 5 minutes to do manually and 30 seconds to describe in English.

And because Ash is just a library, you can import it into your own tools. A CI pipeline that reviews PRs. A cron job that writes standup notes. A script that generates types from your database schema. Ash is the agent primitive — you bring the workflow.

## For Whom

Developers who:

- Want to understand how agents actually work, not just use them
- Want a personal CLI tool for routine tasks, not a product or platform
- Prefer code they own over dependencies they don't understand
- Think the best plugin system is a markdown file
- Want an agent they can call from their own scripts, not just use interactively
- Believe composition beats configuration

If you've ever written a bash script to automate something tedious, Ash is that — but you describe the task in English instead of bash.

## Interface

### Setup

First run walks you through configuration:

```bash
ash init
```

```
Welcome to Ash.

Select a provider:
  ❯ OpenAI
    Anthropic

Paste your API key: sk-••••••••••••

Default model (gpt-4.1): 

Config saved to ~/.ash/config.yml
```

The config file:

```yaml
# ~/.ash/config.yml
provider: openai
model: gpt-4.1
api_key: sk-...
```

Run `ash init` again anytime to change provider, model, or key.

### Basic Usage

```bash
ash "find all TODO comments in this project and list them by file"
```

The agent researches, plans, executes, and reports — then exits.

### Confirmation Mode

By default, Ash asks before writing files or running commands.

```
┌─ shell: rg "TODO" --files-with-matches
└─ Allow? [y]es / [n]o / [a]bort ▌
```

Skip confirmation when you trust the task:

```bash
ash --no-confirm "organize the downloads folder by file type"
```

### Structured Thinking

Before touching anything, Ash thinks out loud:

```
PLAN:
  1. Search for all TODO/FIXME comments using rg
  2. Group results by file
  3. Format as a readable list

Then it executes the plan — reading, searching, acting — and reports the result.
```

### Model Selection

Ash supports OpenAI and Anthropic out of the box. Set the provider via flag or env var.

```bash
ash --model gpt-4.1-mini "add a .gitignore for a Node project"
ash --model claude-sonnet-4-20250514 "refactor the auth module to handle refresh tokens"
```

Configure the default in `~/.ash/config.yml` or via environment variables:

```bash
export ASH_PROVIDER=anthropic
export ASH_MODEL=claude-sonnet-4-20250514
```

### Skills

Drop a markdown file into `~/.ash/skills/` to teach Ash your conventions:

```bash
echo "Always use pnpm, never npm. Use vitest for tests." > ~/.ash/skills/my-project.md
```

Ash loads all skill files into its system prompt. No plugin API. No registration. Just markdown.

Project-level skills go in `.ash/skills/` and override global ones.

### Short Alias

```bash
alias a="ash --no-confirm"

a "compress all PNGs in this folder"
a "curl api.example.com/health and tell me the status"
a "kill whatever is running on port 3000"
```

## Orchestration

Ash does one task and exits. For complex workflows, you compose multiple runs — and the filesystem carries state between them. No conversation history, no session management. The code Ash wrote in step 1 is just there on disk for step 2 to read.

### Shell Scripts

The simplest orchestration. Each line is a deterministic step. Ash handles the intelligence within each step.

```bash
#!/bin/bash
set -e

ash --no-confirm "read db/schema.prisma and generate TypeScript types in src/types/db.ts"
ash --no-confirm "run npx tsc --noEmit and fix any type errors"
ash --no-confirm "run npm test and fix any failures"

echo "Done."
```

### Programmatic (TypeScript)

Import Ash as a library for full control — conditionals, loops, parallelism, error handling.

```typescript
import { Agent } from 'ash'

const agent = new Agent()

const schema = await agent.run("read the database schema and summarize it")

await agent.run(`generate TypeScript types for: ${schema.summary}`)

const tests = await agent.run("run the tests")

if (!tests.passed) {
  await agent.run(`fix the failing tests: ${tests.summary}`)
}
```

### Parallel Execution

Run independent tasks concurrently by spawning multiple agents:

```typescript
const [types, docs, tests] = await Promise.all([
  agent.run("generate types from the schema"),
  agent.run("update the API documentation"),
  agent.run("write tests for the new endpoints"),
])
```

### Cron / Git Hooks

Ash runs anywhere a shell command runs:

```bash
# Pre-commit hook
ash --no-confirm "check staged files for console.logs and hardcoded secrets"

# Cron job
0 9 * * * cd ~/project && ash --no-confirm "summarize yesterday's git log into a standup note"
```

### Sandbox Mode

Run everything in a disposable Docker container. The agent reads, writes, patches, and shells — but nothing touches the real filesystem. When it's done, you see a diff. Apply it or discard it.

```bash
ash --sandbox "refactor the config module to use zod"
```

The agent doesn't know it's sandboxed. The tools work the same way. The only difference is where they execute.

### Streaming

See the agent think and act in real-time. The plan streams as it's written. Tool calls appear as they happen. Output flows instead of arriving in one block.

Useful for longer tasks where you want to watch progress, and makes the agent feel fast even when a task takes 30 seconds.

### Pipe Mode

Read from stdin, act on it, write to stdout. Makes Ash a Unix citizen.

```bash
cat error.log | ash "summarize the errors and suggest fixes"
curl -s api.example.com/data | ash "convert this JSON to CSV" > data.csv
git diff --staged | ash "write a commit message for these changes"
```

Composes with `jq`, `rg`, `awk`, and anything else that speaks stdin/stdout.

### Structured Output

Pass a `--output` flag with a JSON schema, and Ash returns structured data on exit instead of free-form text.

```bash
ash --output '{"status": "string", "files_changed": ["string"]}' \
  "fix the type errors in src/"
```

Returns:

```json
{"status": "fixed", "files_changed": ["src/config.ts", "src/db.ts"]}
```

This makes Ash scriptable. A wrapper script can parse the output, branch on values, feed results into the next step. The agent becomes a function with typed returns — not just a chatbot that prints text.

In the programmatic API:

```typescript
const result = await agent.run("fix the type errors", {
  output: { status: "string", files_changed: ["string"] }
})

if (result.status === "fixed") {
  await agent.run("now run the full test suite")
}
```

Under the hood, Ash uses OpenAI's structured output to force the final response to match the schema. The agent doesn't have to be told about the format — it's enforced at the API level.

### Skills

The only extensibility mechanism. A skill is a markdown file that gets loaded into the system prompt. It teaches the agent domain knowledge — not new capabilities, just better judgment about how to use the 4 tools it already has.

```
~/.ash/skills/          → global skills (loaded always)
.ash/skills/            → project skills (loaded for this project)
```

Want Ash to work with Docker? Write a skill. Want it to follow your team's conventions? Write a skill. Want it to manage your AWS infra? Write a skill that teaches it the right CLI commands.

No plugin API. No tool interface. No TypeScript to write. Just markdown.

## What Ash Is Not

- **Not a framework.** There's no plugin API, no middleware, no lifecycle hooks. But because Ash is just a function — string in, result out — you can wrap it in anything: your scripts, your CI, your own tools.
- **Not a product.** No auth, no cloud, no dashboard. It runs in your terminal.
- **Not complex.** A handful of files, 1 runtime dependency. You can read all of it during a coffee break.
- **Not disposable.** Skills make it grow with you. Composition makes it handle big tasks. But the core never changes.

