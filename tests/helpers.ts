import { vi } from 'vitest'
import type { ChatResponse, Provider } from '../src/types.js'

/** Capture writes to stdout (and optionally stderr) for the duration of `fn`. */
export async function captureStdio<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; stdout: string; stderr: string }> {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const stdoutWrite = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stdout.write)
  const stderrWrite = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stderr.write)
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutChunks.push(args.map(String).join(' ') + '\n')
  })
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrChunks.push(args.map(String).join(' ') + '\n')
  })
  try {
    const result = await fn()
    return {
      result,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
    }
  } finally {
    stdoutWrite.mockRestore()
    stderrWrite.mockRestore()
    log.mockRestore()
    error.mockRestore()
  }
}

/** Parse NDJSON stdout into objects; empty lines ignored. */
export function parseNdjson(stdout: string): Record<string, unknown>[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

/**
 * Scripted provider: each chat() call returns the next response.
 * Optionally invokes onText with per-token deltas from `deltas[i]` (or content chars).
 */
export function scriptedProvider(
  responses: ChatResponse[],
  opts?: { deltas?: (string[] | undefined)[] },
): Provider {
  let i = 0
  return {
    async chat(_messages, _tools, options) {
      if (i >= responses.length) {
        throw new Error(`scriptedProvider: no response for call ${i}`)
      }
      const response = responses[i]
      const deltas = opts?.deltas?.[i]
      if (options?.onText) {
        if (deltas) {
          for (const d of deltas) options.onText(d)
        }
      }
      i++
      return response
    },
  }
}

/** Run parseArgs while turning process.exit into a throw (matches CLI error style). */
export function parseArgsOrExit(
  parseArgs: (argv: string[]) => unknown,
  argv: string[],
): unknown {
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`)
  }) as never)
  try {
    return parseArgs(argv)
  } finally {
    exit.mockRestore()
  }
}
