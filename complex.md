# Ash — Complex Workflow Examples

These examples show what happens when you treat Ash as a primitive and build workflows around it. Ash handles the intelligence within each step. Your code handles the flow between steps. The filesystem carries state.

## The Pattern

Every complex workflow follows the same shape:

1. **Linear steps** where files carry state — sequential `agent.run()` calls
2. **Independent work** that can parallelize — `Promise.all()`
3. **Structured output** for branching decisions — `if/else` in the wrapper
4. **Verification loops** — run tests, fix, run again
5. **The wrapper is deterministic, Ash is smart** — you control flow, Ash controls intelligence

The wrapper never needs AI. Ash never needs memory. They each do what they're good at.

---

## PR Review Pipeline

Every PR gets an automated multi-angle review. Each angle is an independent one-shot — perfect for parallelism.

```typescript
import { Agent } from 'ash'
import { execSync } from 'child_process'

const agent = new Agent()
const diff = execSync('git diff main...HEAD').toString()

const [security, performance, types, tests] = await Promise.all([
  agent.run(`Review this diff for security issues:\n${diff}`, {
    output: { issues: [{ severity: "string", file: "string", description: "string" }] }
  }),
  agent.run(`Review this diff for performance problems:\n${diff}`, {
    output: { issues: [{ severity: "string", file: "string", description: "string" }] }
  }),
  agent.run("run npx tsc --noEmit and report any type errors", {
    output: { errors: [{ file: "string", line: "number", message: "string" }] }
  }),
  agent.run("run npm test and report failures", {
    output: { passed: "boolean", failures: ["string"] }
  }),
])

const allIssues = [...security.issues, ...performance.issues]
const critical = allIssues.filter(i => i.severity === 'critical')

if (critical.length > 0 || !tests.passed) {
  await agent.run(`Write a PR review comment summarizing these problems:
    Security: ${JSON.stringify(security.issues)}
    Performance: ${JSON.stringify(performance.issues)}
    Type errors: ${JSON.stringify(types.errors)}
    Test failures: ${JSON.stringify(tests.failures)}
    
    Write it to pr-review.md`)
  process.exit(1)
}
```

Four agents run in parallel, each focused on one concern. Structured output lets the wrapper make decisions. No agent needs to know about the others.

---

## Codebase Migration

Migrate a codebase file-by-file — JavaScript to TypeScript, class components to hooks, CommonJS to ESM. Each file is an independent one-shot with verification after each step.

```bash
#!/bin/bash
set -e

FILES=$(find src -name "*.js" -not -name "*.test.js")

for file in $FILES; do
  echo "Migrating: $file"
  
  ash --no-confirm "convert $file from JavaScript to TypeScript. \
    Rename it to .ts/.tsx. Add proper types, no 'any'. \
    Keep the same logic."
  
  ts_file="${file%.js}.ts"
  
  if ! npx tsc --noEmit "$ts_file" 2>/dev/null; then
    ash --no-confirm "fix the TypeScript errors in $ts_file"
  fi
  
  ash --no-confirm "find all files that import from '$file' and \
    update the import path to '$ts_file'"
  
  echo "Done: $file → $ts_file"
done

ash --no-confirm "run npx tsc --noEmit and fix any remaining type errors"
ash --no-confirm "run npm test and fix any failures"
```

The loop is deterministic. Ash handles the intelligence within each step. If one file fails, the script stops cleanly at that file.

---

## API-First Development

Start from an OpenAPI spec. Generate everything downstream, each step producing artifacts the next step reads from disk.

```typescript
import { Agent } from 'ash'

const agent = new Agent()

await agent.run(
  "read openapi.yaml and generate TypeScript interfaces in src/types/api.ts"
)

await agent.run(
  "read src/types/api.ts and openapi.yaml. Generate Express route handlers \
   in src/routes/ — one file per resource. Use the types for request/response."
)

await agent.run(
  "read openapi.yaml and add zod validation schemas to each route handler in src/routes/"
)

await Promise.all([
  agent.run("generate integration tests in tests/ for every route in src/routes/"),
  agent.run("generate API documentation from openapi.yaml into docs/api.md"),
  agent.run("generate a Postman collection from openapi.yaml into postman.json"),
])

const result = await agent.run("run npm test", {
  output: { passed: "boolean", failures: ["string"] }
})

if (!result.passed) {
  await agent.run(`fix the failing tests: ${result.failures.join(', ')}`)
}
```

Linear steps where each reads the previous step's output from disk, then a fan-out for independent work, then a verification step. This shape shows up constantly.

---

## Incident Response Bot

A cron job or webhook handler that diagnoses and fixes production issues. Fully unattended — no human present to have a conversation with.

```typescript
import { Agent } from 'ash'
import { execSync } from 'child_process'

const agent = new Agent()

const diagnosis = await agent.run(
  "read logs/error.log (last 100 lines). Identify the root cause.", {
  output: {
    error_type: "string",
    affected_service: "string",
    severity: "string",
    root_cause: "string",
    affected_file: "string"
  }
})

if (diagnosis.severity === "critical") {
  const fix = await agent.run(
    `The error is: ${diagnosis.root_cause} in ${diagnosis.affected_file}. 
     Fix it. Do not change any public API signatures.`, {
    output: { fixed: "boolean", changes: ["string"], explanation: "string" }
  })

  if (fix.fixed) {
    const verify = await agent.run("run npm test", {
      output: { passed: "boolean" }
    })

    if (verify.passed) {
      const branch = `fix/auto-${Date.now()}`
      execSync(`git checkout -b ${branch}`)
      execSync(`git add -A && git commit -m "auto-fix: ${diagnosis.root_cause}"`)
      execSync(`git push -u origin HEAD`)

      await agent.run(
        `write a pull request description to pr-body.md explaining:
         Error: ${diagnosis.root_cause}
         Fix: ${fix.explanation}
         Changes: ${fix.changes.join(', ')}
         Tests: passing`
      )
    }
  }
}
```

Each step is a clean one-shot. The wrapper handles all the decisions. Ash never needs to "remember" the diagnosis — the wrapper passes exactly what it needs.

---

## Multi-Package Dependency Update

Update a dependency across a monorepo, fixing breakages package by package.

```bash
#!/bin/bash
set -e

NEW_VERSION="$1"

for pkg in packages/*/; do
  echo "=== Updating $pkg ==="
  
  cd "$pkg"
  npm install "$NEW_VERSION"
  
  ash --no-confirm "the project just upgraded to $NEW_VERSION. \
    Read the changelog/migration guide for this version. \
    Fix any breaking changes in this package's source code."
  
  ash --no-confirm "run npm test and fix any failures caused by \
    the $NEW_VERSION upgrade. Do not change test expectations \
    unless the new behavior is correct."
  
  cd ../..
done

ash --no-confirm "run npm test from the repo root and fix any \
  integration issues between packages"
```

---

## Why These Work

These workflows succeed because of what Ash is — and what it isn't.

**The filesystem is the shared memory.** Step 1 writes `src/types/api.ts`. Step 2 reads it. No conversation history needed, no session state, no serialization. The artifact is just there on disk.

**Structured output makes Ash scriptable.** The wrapper doesn't parse free-form text. It gets `{ passed: false, failures: ["..."] }` and branches on it. Ash becomes a function with typed returns.

**Parallelism is free.** Independent tasks run concurrently with `Promise.all()`. Each agent is isolated. No shared state to corrupt.

**Failure is bounded.** If one step fails, the script stops. You know exactly which step failed and why. No cascading confusion from an agent that's been drifting for 20 turns.

**The wrapper is dumb on purpose.** It's a shell script or 50 lines of TypeScript. You can read it, debug it, version-control it. The intelligence is in Ash. The control flow is in your code.