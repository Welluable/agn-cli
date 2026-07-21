# JSON Streaming Output (`--output-format stream-json`)

Add machine-readable, newline-delimited JSON (NDJSON) output to `agn`, modeled on
Claude Code and Cursor CLI's headless streaming. The token stream already exists
internally (`OpenAIProvider.chat` calls `onText` per delta); this spec adds the
CLI flags, a JSON renderer, and richer hooks so stdout can be consumed by scripts.

## Decisions

1. Add `--output-format <text|json|stream-json>` (default `text`). `text` keeps the
   current human renderer unchanged.
2. Add `-p` / `--print` as the print-mode flag. Structured formats require print
   mode (also inferred when stdout is not a TTY).
3. Add `--stream-partial-output` — only valid with `stream-json`; emits per-token
   `assistant` delta events. Without it, `assistant` events are one complete
   segment per iteration, emitted **live and in order** (interleaved with
   `tool_call` events), not batched at the end.
4. Define a small, stable **`agn` schema** (Cursor-like top-level events). Do NOT
   try to be byte-compatible with both Claude and Cursor — their schemas differ.
   Compatibility modes (`--stream-schema cursor|claude`) are a non-goal for v1.
5. stdout is **strictly NDJSON** in structured modes. All human diagnostics
   (trace notices, errors, session-id line) move to **stderr**.
6. `json` mode = buffer everything, print a single terminal `result` object at the
   end. `stream-json` = one event object per line as things happen.
7. Every run in structured mode ends with exactly one terminal event: `result`
   with `subtype: success | error | max_iterations`.

## Rationale

- Token streaming and tool execution already flow through `AgentHooks`; the only
  missing piece is a renderer + flag plumbing, so this is a moderate change.
- A single owned schema avoids coupling to two moving upstreams while staying
  familiar to anyone who has parsed Cursor/Claude output.
- Keeping stdout pure NDJSON is the one hard rule that makes the output usable
  with `jq` and pipelines.

## Non-goals (v1)

- `--input-format stream-json` (streaming *input* / multi-turn over stdin).
- Byte-for-byte Claude or Cursor schema compatibility, or a `--stream-schema` flag.
- `--json-schema` / structured-output validation.
- Cost/usage/token accounting fields (may be added later; consumers must ignore
  unknown fields).
- Thinking/reasoning events, subagent forwarding, hook lifecycle events.
- Changing the default `text` renderer's appearance.

## Current state

| Item | Detail |
|------|--------|
| Token streaming | `OpenAIProvider.chat` calls `options.onText(delta)` per chunk |
| Hooks | `AgentHooks`: `onToolCall(name,args)`, `onToolResult(name,result)`, `onText`, `onIterationStart/End` |
| Renderer | `createRenderer()` writes chalk-formatted text to stdout |
| Tool-call id | Assembled in provider (`ToolCall.id`) but **not** passed to hooks |
| Assistant segments | Each iteration's `response.content` is pushed to `messages` in the loop (`src/agent.ts:116-122`) but **never surfaced live** — no per-message hook exists |
| CLI output | `cli.ts` writes prompts/results/errors directly to `console.log`/`console.error` |
| Result shape | `RunResult { content, iterations, status, messages }` |
| Session id | `global.sessionId`, currently printed to stdout via `logSessionId()` |

## Target event schema (`agn` NDJSON)

One JSON object per line, each with a `type`. Unknown fields must be ignored by
consumers (forward-compatible).

```jsonc
// once, at start
{"type":"system","subtype":"init","session_id":"...","model":"gpt-4.1","cwd":"/abs/path","version":"0.0.10"}

// the user prompt, echoed once
{"type":"user","session_id":"...","message":{"role":"user","content":"<prompt>"}}

// assistant text — one complete segment per iteration (default), streamed live
// and interleaved in order with the tool_call events below ...
{"type":"assistant","session_id":"...","message":{"role":"assistant","content":"<segment text>"}}
// ... or per-token deltas (only with --stream-partial-output)
{"type":"assistant","subtype":"delta","session_id":"...","delta":"<token text>"}

// tool lifecycle
{"type":"tool_call","subtype":"started","session_id":"...","call_id":"call_123","name":"read_file","input":{"path":"src/cli.ts"}}
{"type":"tool_call","subtype":"completed","session_id":"...","call_id":"call_123","name":"read_file","output":"<result text>"}

// exactly one terminal event
{"type":"result","subtype":"success","session_id":"...","result":"<final assistant text>","iterations":2,"is_error":false}
{"type":"result","subtype":"max_iterations","session_id":"...","result":"...","iterations":30,"is_error":true}
{"type":"result","subtype":"error","session_id":"...","error":"<message>","is_error":true}
```

Notes:

- `input` on `tool_call.started` is the parsed args object (fall back to
  `{"_raw": "..."}` on invalid JSON, matching `tryParseJson`).
- `output` on `completed` is the raw tool result string (no truncation — the
  20-line truncation is a `text`-renderer concern only).
- With `--stream-partial-output`, per-token `assistant.delta` events are emitted
  and the per-iteration full `assistant` event is suppressed to avoid duplicate
  text; the terminal `result.result` still carries the full text.
- Event **ordering** mirrors the agent loop: for each iteration, the `assistant`
  segment (if any) is emitted before that iteration's `tool_call` events.
  Concurrent tool calls (run via `Promise.all`) may interleave their
  `started`/`completed` events nondeterministically — correlate by `call_id`,
  do not rely on ordering between distinct concurrent tools.

## Design changes

### 1. Extend `AgentHooks` (`src/agent.ts`)

Pass the tool-call id (and keep name/args) so JSON events can correlate
started/completed, **and add a per-iteration assistant hook** so full-segment
assistant text can be emitted live and in the correct order relative to tool
calls (see Design note below).

```ts
onToolCall?: (call: { id: string; name: string; args: Record<string, unknown> }) => void
onToolResult?: (call: { id: string; name: string; result: string }) => void
// NEW — fires once per iteration when an assistant segment is complete
onAssistantMessage?: (msg: { content: string; iteration: number }) => void
```

Call `onAssistantMessage` in `Agent.run` right after the assistant message is
pushed (`src/agent.ts:116-122`), guarded by `if (response.content)`. This fires
in loop order: segment → tool calls → next segment → …

Update the existing text `createRenderer` to the new tool signatures (it just
ignores `id`) and leave `onAssistantMessage` unset there (the text renderer keeps
using live `onText`). Update the tool call sites in `Agent.run` to pass `tc.id`.

> **Design note (why not emit after the run).** Emitting assistant segments from
> `RunResult.messages` *after* the loop would (a) not be real-time in default
> `stream-json`, and (b) break ordering — every `tool_call` streams live but all
> `assistant` events would arrive in one batch at the end, so a consumer could
> not reconstruct "said X → called tool Y → said Z". The `onAssistantMessage`
> hook fixes both by emitting inside the loop.

### 2. New JSON renderer (`src/renderer-json.ts`)

`createJsonRenderer(opts: { partial: boolean }): AgentHooks` that maps hooks to
NDJSON lines via a single `emit(obj)` helper (`process.stdout.write(JSON.stringify(obj) + "\n")`).

- `onToolCall` → `tool_call.started`.
- `onToolResult` → `tool_call.completed`.
- **Default (`partial: false`)**: `onAssistantMessage` → full `assistant` event,
  emitted live per iteration. `onText` is **not** wired (no deltas).
- **Partial (`partial: true`)**: `onText` → `assistant.delta` per token.
  `onAssistantMessage` is **suppressed** (or emitted without text) so the same
  text is not printed twice. The terminal `result.result` still carries the full
  final text.

Keep `session_id` injection in one place (renderer closure captures it).

### 3. CLI flag parsing (`src/cli.ts`)

- Extend `Parsed` run flags: `{ print?: boolean; outputFormat?: 'text'|'json'|'stream-json'; streamPartial?: boolean }`.
- Parse `-p`/`--print`, `--output-format <v>`, `--stream-partial-output`.
- Validate: `--output-format` other than `text` implies/needs print mode; infer
  print mode when `!process.stdout.isTTY`. `--stream-partial-output` only valid
  with `stream-json` (warn to stderr and ignore otherwise).
- Select renderer: `text` → `createRenderer()`; `json`/`stream-json` →
  `createJsonRenderer()`.

### 4. stdout/stderr discipline

- In `json`/`stream-json` mode: emit `system.init` first, `user` next, then
  stream events (assistant segments + tool calls, in loop order), then exactly
  one `result`.
- Route `logSessionId`, trace notices ("Trace mode enabled…"), and error text to
  **stderr** so stdout stays valid NDJSON.
- `json` (non-stream) mode: suppress intermediate events, buffer, and print only
  the terminal `result` object as a single line.

## Files / layout

| File | Change |
|------|--------|
| `src/agent.ts` | Widen `AgentHooks` tool hook signatures; add `onAssistantMessage`; pass `tc.id` and fire `onAssistantMessage` at call sites |
| `src/renderer.ts` | Update to new hook signature (behavior unchanged) |
| `src/renderer-json.ts` | **New** — NDJSON renderer + `emit` helper |
| `src/cli.ts` | Parse new flags; pick renderer; emit init/user/result; move diagnostics to stderr |
| `src/types.ts` | Optional: shared `StreamEvent` type union for the schema |
| `README.md` | Document flags, schema, and a `jq` example |

## Testing

### Required

- `parseArgs`: `-p`, `--output-format stream-json`, `--stream-partial-output`
  parse into the right flags; invalid `--output-format` value errors.
- JSON renderer: each hook produces a single line that `JSON.parse`s; `type`/
  `subtype` fields match the schema; `started`/`completed` share a `call_id`.
- End-to-end (mock provider + mock tools): capture stdout, split on `\n`, assert
  every non-empty line parses, first is `system.init`, last is `result`, and no
  human text leaked to stdout.
- **Ordering (multi-iteration mock)**: a run of text → tool → text emits the
  first `assistant` segment *before* its `tool_call` events, and the second
  `assistant` segment after them — i.e. segments stream live, not batched at end.
- `--stream-partial-output`: `assistant.delta` events appear; no per-iteration
  full `assistant` segment is emitted for the same text.
- `text` mode output is byte-identical to today (regression guard).

### Manual

```bash
agn -p --output-format stream-json "list files in src" | jq -c 'select(.type=="tool_call")'
agn -p --output-format stream-json --stream-partial-output "write a haiku" \
  | jq -rj 'select(.type=="assistant" and .subtype=="delta") | .delta'
agn -p --output-format json "2+2?" | jq .result
```

## Implementation checklist

- [ ] Widen `AgentHooks` tool hooks to pass `call_id`; update `Agent.run` call sites
- [ ] Add `onAssistantMessage` hook; fire it per iteration after the assistant push
- [ ] Update text `createRenderer` to new signature (no visible change)
- [ ] Add `createJsonRenderer` in `src/renderer-json.ts`
- [ ] Parse `-p/--print`, `--output-format`, `--stream-partial-output` in `parseArgs`
- [ ] Emit `system.init` + `user` + terminal `result` from `cli.ts`
- [ ] Move session-id / trace / error output to stderr in structured modes
- [ ] Implement `json` (buffered single object) vs `stream-json` (per-line) split
- [ ] Tests: parseArgs, renderer, e2e NDJSON validity, partial deltas, text regression
- [ ] Update README + help text (`printHelp`)
- [ ] `npm test`

## Rejected for v1 (defer)

| Idea | Why later |
|------|-----------|
| `--stream-schema cursor\|claude` compat modes | Two moving targets; own schema first |
| `--input-format stream-json` (streaming input) | Separate feature; needs stdin loop |
| `--json-schema` structured output validation | Needs a validator; out of scope |
| Cost / token usage fields | Requires provider usage plumbing |
| Thinking / subagent / hook-event lines | Not modeled in agn yet |

## Done when

- `agn -p --output-format stream-json "<prompt>"` prints only valid NDJSON, one
  object per line, starting with `system.init` and ending with a single `result`.
- Assistant segments stream **live and in loop order** relative to `tool_call`
  events (not batched at the end).
- `--stream-partial-output` yields token-level `assistant.delta` events.
- `agn -p --output-format json "<prompt>"` prints one JSON object.
- `text` mode is unchanged; all diagnostics go to stderr in structured modes.
- `npm test` passes.
