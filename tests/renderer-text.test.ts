import { describe, expect, it } from 'vitest'
import chalk from 'chalk'
import { createRenderer } from '../src/renderer.js'
import { captureStdio } from './helpers.js'

/**
 * Regression guard: text mode output must stay byte-identical for the same
 * hook invocations after AgentHooks signature changes (id is ignored).
 */
describe('createRenderer — text mode regression', () => {
  it('streams onText to stdout without newlines', async () => {
    chalk.level = 0
    const hooks = createRenderer()
    const { stdout } = await captureStdio(() => {
      hooks.onText?.('Hello')
      hooks.onText?.(' world')
    })
    expect(stdout).toBe('Hello world')
  })

  it('prints tool call / result boxes (accepts object-shaped hooks)', async () => {
    chalk.level = 0
    const hooks = createRenderer()
    const { stdout } = await captureStdio(() => {
      // New signature: object with id (ignored by text renderer)
      ;(hooks.onToolCall as (call: {
        id: string
        name: string
        args: Record<string, unknown>
      }) => void)?.({
        id: 'call_1',
        name: 'read_file',
        args: { path: 'src/cli.ts' },
      })
      ;(hooks.onToolResult as (call: {
        id: string
        name: string
        result: string
      }) => void)?.({
        id: 'call_1',
        name: 'read_file',
        result: 'line1\nline2',
      })
    })

    expect(stdout).toContain('read_file')
    expect(stdout).toContain('src/cli.ts')
    expect(stdout).toContain('line1')
    expect(stdout).toContain('line2')
    expect(stdout).toContain('done')
  })

  it('truncates long tool output to 20 lines in text mode only', async () => {
    chalk.level = 0
    const hooks = createRenderer()
    const many = Array.from({ length: 25 }, (_, i) => `L${i}`).join('\n')
    const { stdout } = await captureStdio(() => {
      ;(hooks.onToolCall as (call: {
        id: string
        name: string
        args: Record<string, unknown>
      }) => void)?.({
        id: 'c',
        name: 'shell',
        args: { command: 'echo' },
      })
      ;(hooks.onToolResult as (call: {
        id: string
        name: string
        result: string
      }) => void)?.({
        id: 'c',
        name: 'shell',
        result: many,
      })
    })
    expect(stdout).toContain('L0')
    expect(stdout).toContain('L19')
    expect(stdout).toContain('more lines')
    expect(stdout).not.toContain('L24')
  })
})
