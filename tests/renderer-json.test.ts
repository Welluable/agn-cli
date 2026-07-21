import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createJsonRenderer } from '../src/renderer-json.js'
import { captureStdio, parseNdjson } from './helpers.js'

describe('createJsonRenderer', () => {
  beforeEach(() => {
    global.sessionId = 'sess-test-1'
  })

  afterEach(() => {
    global.sessionId = undefined
  })

  it('emits a single JSON line per hook that JSON.parse accepts', async () => {
    const hooks = createJsonRenderer({ partial: false })
    const { stdout } = await captureStdio(() => {
      hooks.onAssistantMessage?.({ content: 'hello', iteration: 0 })
      hooks.onToolCall?.({
        id: 'call_abc',
        name: 'read_file',
        args: { path: 'src/cli.ts' },
      })
      hooks.onToolResult?.({
        id: 'call_abc',
        name: 'read_file',
        result: 'file contents',
      })
    })

    const events = parseNdjson(stdout)
    expect(events).toHaveLength(3)
    for (const ev of events) {
      expect(ev).toHaveProperty('type')
      expect(ev.session_id).toBe('sess-test-1')
    }
  })

  it('maps onAssistantMessage to a full assistant event (default)', async () => {
    const hooks = createJsonRenderer({ partial: false })
    const { stdout } = await captureStdio(() => {
      hooks.onAssistantMessage?.({ content: 'segment text', iteration: 0 })
    })
    const [ev] = parseNdjson(stdout)
    expect(ev).toMatchObject({
      type: 'assistant',
      session_id: 'sess-test-1',
      message: { role: 'assistant', content: 'segment text' },
    })
    expect(ev).not.toHaveProperty('subtype')
  })

  it('does not emit deltas when partial is false (onText unwired)', async () => {
    const hooks = createJsonRenderer({ partial: false })
    const { stdout } = await captureStdio(() => {
      hooks.onText?.('tok')
    })
    expect(stdout).toBe('')
  })

  it('emits assistant.delta from onText when partial is true', async () => {
    const hooks = createJsonRenderer({ partial: true })
    const { stdout } = await captureStdio(() => {
      hooks.onText?.('Ha')
      hooks.onText?.('iku')
    })
    const events = parseNdjson(stdout)
    expect(events).toEqual([
      {
        type: 'assistant',
        subtype: 'delta',
        session_id: 'sess-test-1',
        delta: 'Ha',
      },
      {
        type: 'assistant',
        subtype: 'delta',
        session_id: 'sess-test-1',
        delta: 'iku',
      },
    ])
  })

  it('suppresses full assistant segments when partial is true', async () => {
    const hooks = createJsonRenderer({ partial: true })
    const { stdout } = await captureStdio(() => {
      hooks.onText?.('x')
      hooks.onAssistantMessage?.({ content: 'x', iteration: 0 })
    })
    const events = parseNdjson(stdout)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ subtype: 'delta', delta: 'x' })
    expect(events.some((e) => e.type === 'assistant' && !e.subtype)).toBe(false)
  })

  it('emits tool_call.started / completed sharing call_id', async () => {
    const hooks = createJsonRenderer({ partial: false })
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    const { stdout } = await captureStdio(() => {
      hooks.onToolCall?.({
        id: 'call_123',
        name: 'read_file',
        args: { path: 'src/cli.ts' },
      })
      hooks.onToolResult?.({
        id: 'call_123',
        name: 'read_file',
        result: longOutput,
      })
    })
    const [started, completed] = parseNdjson(stdout)
    expect(started).toMatchObject({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'call_123',
      name: 'read_file',
      input: { path: 'src/cli.ts' },
    })
    expect(completed).toMatchObject({
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'call_123',
      name: 'read_file',
      output: longOutput,
    })
    // JSON renderer must not truncate tool output (text renderer does).
    expect(String(completed.output).split('\n')).toHaveLength(40)
  })

  it('uses parsed args object as tool_call.started input (including _raw fallback)', async () => {
    const hooks = createJsonRenderer({ partial: false })
    const { stdout } = await captureStdio(() => {
      hooks.onToolCall?.({
        id: 'call_raw',
        name: 'shell',
        args: { _raw: 'not-json' },
      })
    })
    const [started] = parseNdjson(stdout)
    expect(started.input).toEqual({ _raw: 'not-json' })
  })
})
