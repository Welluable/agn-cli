import { describe, expect, it } from 'vitest'
import { HELP_TEXT, parseArgs } from '../src/cli.js'
import { parseArgsOrExit } from './helpers.js'

function runFlags(argv: string[]) {
  const parsed = parseArgsOrExit(parseArgs, argv) as {
    command: string
    prompt?: string
    flags?: {
      print?: boolean
      outputFormat?: string
      streamPartial?: boolean
      model?: string
      trace?: boolean
    }
  }
  return parsed
}

describe('parseArgs — structured output flags', () => {
  it('parses -p as print mode', () => {
    const parsed = runFlags(['node', 'agn', '-p', 'hello'])
    expect(parsed.command).toBe('run')
    expect(parsed.prompt).toBe('hello')
    expect(parsed.flags?.print).toBe(true)
  })

  it('parses --print as print mode', () => {
    const parsed = runFlags(['node', 'agn', '--print', 'hello'])
    expect(parsed.flags?.print).toBe(true)
    expect(parsed.prompt).toBe('hello')
  })

  it('parses --output-format stream-json', () => {
    const parsed = runFlags([
      'node',
      'agn',
      '-p',
      '--output-format',
      'stream-json',
      'list files',
    ])
    expect(parsed.flags?.outputFormat).toBe('stream-json')
    expect(parsed.flags?.print).toBe(true)
    expect(parsed.prompt).toBe('list files')
  })

  it('parses --output-format json and text', () => {
    expect(
      runFlags(['node', 'agn', '-p', '--output-format', 'json', 'q']).flags
        ?.outputFormat,
    ).toBe('json')
    expect(
      runFlags(['node', 'agn', '--output-format', 'text', 'q']).flags
        ?.outputFormat,
    ).toBe('text')
  })

  it('defaults outputFormat to text when omitted', () => {
    const parsed = runFlags(['node', 'agn', 'plain prompt'])
    expect(parsed.flags?.outputFormat ?? 'text').toBe('text')
    expect(parsed.flags?.print).toBeFalsy()
  })

  it('parses --stream-partial-output', () => {
    const parsed = runFlags([
      'node',
      'agn',
      '-p',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      'haiku',
    ])
    expect(parsed.flags?.streamPartial).toBe(true)
    expect(parsed.flags?.outputFormat).toBe('stream-json')
  })

  it('errors on invalid --output-format value', () => {
    expect(() =>
      parseArgsOrExit(parseArgs, [
        'node',
        'agn',
        '-p',
        '--output-format',
        'yaml',
        'hi',
      ]),
    ).toThrow()
  })

  it('errors when --output-format is missing its value', () => {
    expect(() =>
      parseArgsOrExit(parseArgs, ['node', 'agn', '--output-format']),
    ).toThrow()
  })

  it('keeps -p out of the prompt text', () => {
    const parsed = runFlags(['node', 'agn', '-p', 'do', 'something'])
    expect(parsed.prompt).toBe('do something')
    expect(parsed.prompt).not.toMatch(/^-p$/)
  })

  it('still parses --model and --trace alongside new flags', () => {
    const parsed = runFlags([
      'node',
      'agn',
      '--model',
      'gpt-4.1-mini',
      '--trace',
      '-p',
      '--output-format',
      'json',
      '2+2?',
    ])
    expect(parsed.flags?.model).toBe('gpt-4.1-mini')
    expect(parsed.flags?.trace).toBe(true)
    expect(parsed.flags?.print).toBe(true)
    expect(parsed.flags?.outputFormat).toBe('json')
    expect(parsed.prompt).toBe('2+2?')
  })
})

describe('parseArgs — help', () => {
  it.each(['-h', '--help'])('recognizes %s', (flag) => {
    expect(runFlags(['node', 'agn', flag])).toEqual({ command: 'help' })
  })

  it('recognizes help after a command', () => {
    expect(runFlags(['node', 'agn', 'skill', 'new', 'testing', '--help'])).toEqual({
      command: 'help',
    })
  })

  it('documents commands, options, and runnable examples', () => {
    expect(HELP_TEXT).toContain('Commands:')
    expect(HELP_TEXT).toContain('-h, --help')
    expect(HELP_TEXT).toContain('Examples:')
    expect(HELP_TEXT).toContain('agn -p --output-format json "2+2?"')
    expect(HELP_TEXT).toContain('agn skill new testing')
  })
})
