import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Agent } from '../src/agent.js'
import { createJsonRenderer } from '../src/renderer-json.js'
import { captureStdio, parseNdjson, scriptedProvider } from './helpers.js'

describe('stream-json e2e — NDJSON via Agent + createJsonRenderer', () => {
  beforeEach(() => {
    global.sessionId = 'sess-e2e'
  })

  afterEach(() => {
    global.sessionId = undefined
  })

  it('emits live assistant → tool_call → assistant ordering (not batched)', async () => {
    const provider = scriptedProvider([
      {
        content: 'looking',
        tool_calls: [
          { id: 'call_1', name: 'nope', arguments: '{"path":"a"}' },
        ],
      },
      { content: 'done', tool_calls: [] },
    ])
    const hooks = createJsonRenderer({ partial: false })
    const agent = new Agent({ provider, hooks, skills: [] })

    const { stdout } = await captureStdio(() =>
      agent.run('prompt', { maxIterations: 5 }),
    )
    const events = parseNdjson(stdout)
    const types = events.map((e) => {
      if (e.type === 'assistant') {
        return `assistant:${(e.message as { content: string }).content}`
      }
      if (e.type === 'tool_call') return `tool_call:${e.subtype}`
      return String(e.type)
    })

    expect(types).toEqual([
      'assistant:looking',
      'tool_call:started',
      'tool_call:completed',
      'assistant:done',
    ])
  })

  it('with partial: true emits deltas and no full assistant segments', async () => {
    const provider = scriptedProvider(
      [{ content: 'Hi', tool_calls: [] }],
      { deltas: [['H', 'i']] },
    )
    const hooks = createJsonRenderer({ partial: true })
    const agent = new Agent({ provider, hooks, skills: [] })

    const { stdout } = await captureStdio(() =>
      agent.run('hi', { maxIterations: 3 }),
    )
    const events = parseNdjson(stdout)
    expect(
      events.every((e) => e.type === 'assistant' && e.subtype === 'delta'),
    ).toBe(true)
    expect(events.map((e) => e.delta)).toEqual(['H', 'i'])
    expect(events.some((e) => e.type === 'assistant' && !e.subtype)).toBe(false)
  })

  it('every non-empty stdout line is valid JSON', async () => {
    const provider = scriptedProvider([
      {
        content: 'a',
        tool_calls: [{ id: 'c1', name: 'nope', arguments: '{}' }],
      },
      { content: 'b', tool_calls: [] },
    ])
    const hooks = createJsonRenderer({ partial: false })
    const agent = new Agent({ provider, hooks, skills: [] })
    const { stdout } = await captureStdio(() =>
      agent.run('x', { maxIterations: 5 }),
    )
    for (const line of stdout.split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})
