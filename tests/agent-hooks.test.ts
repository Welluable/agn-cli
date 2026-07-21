import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '../src/agent.js'
import { scriptedProvider } from './helpers.js'

describe('Agent hooks — ids and onAssistantMessage', () => {
  beforeEach(() => {
    global.sessionId = 'sess-hooks'
  })

  afterEach(() => {
    global.sessionId = undefined
  })

  it('fires onAssistantMessage after each assistant segment with content', async () => {
    const onAssistantMessage = vi.fn()
    const provider = scriptedProvider([
      {
        content: 'first',
        tool_calls: [{ id: 'call_1', name: 'nope', arguments: '{}' }],
      },
      { content: 'second', tool_calls: [] },
    ])
    const agent = new Agent({
      provider,
      hooks: { onAssistantMessage },
      skills: [],
    })
    await agent.run('go', { maxIterations: 5 })
    expect(onAssistantMessage).toHaveBeenCalledTimes(2)
    expect(onAssistantMessage.mock.calls[0][0]).toEqual({
      content: 'first',
      iteration: 0,
    })
    expect(onAssistantMessage.mock.calls[1][0]).toEqual({
      content: 'second',
      iteration: 1,
    })
  })

  it('passes tool call id through onToolCall / onToolResult', async () => {
    const onToolCall = vi.fn()
    const onToolResult = vi.fn()
    const provider = scriptedProvider([
      {
        content: 'using tool',
        tool_calls: [
          { id: 'call_xyz', name: 'nope', arguments: '{"x":1}' },
        ],
      },
      { content: 'done', tool_calls: [] },
    ])
    const agent = new Agent({
      provider,
      hooks: { onToolCall, onToolResult },
      skills: [],
    })
    await agent.run('go', { maxIterations: 5 })
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'call_xyz',
      name: 'nope',
      args: { x: 1 },
    })
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call_xyz',
        name: 'nope',
        result: expect.stringContaining('unknown tool'),
      }),
    )
  })

  it('fires onAssistantMessage before tool hooks within the same iteration', async () => {
    const order: string[] = []
    const provider = scriptedProvider([
      {
        content: 'before tools',
        tool_calls: [{ id: 'call_1', name: 'nope', arguments: '{}' }],
      },
      { content: 'after tools', tool_calls: [] },
    ])
    const agent = new Agent({
      provider,
      hooks: {
        onAssistantMessage: () => order.push('assistant'),
        onToolCall: () => order.push('tool_started'),
        onToolResult: () => order.push('tool_completed'),
      },
      skills: [],
    })
    await agent.run('go', { maxIterations: 5 })
    expect(order).toEqual([
      'assistant',
      'tool_started',
      'tool_completed',
      'assistant',
    ])
  })
})
