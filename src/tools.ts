import type { ToolDefinition, ToolHandler } from './types.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { exec } from 'node:child_process'

export const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the given path. Creates the file if it does not exist, overwrites if it does.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
        content: { type: 'string', description: 'The full content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'patch',
    description: 'Apply a targeted edit to an existing file. Replaces old_string with new_string.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to edit' },
        old_string: { type: 'string', description: 'The exact text to find and replace' },
        new_string: { type: 'string', description: 'The replacement text' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'shell',
    description: 'Run a shell command and return its stdout/stderr.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
      },
      required: ['command'],
    },
  },
]

async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string
  try {
    return await readFile(path, 'utf-8')
  } catch (err) {
    return `Error reading file: ${(err as Error).message}`
  }
}

async function handleWriteFile(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string
  const content = args.content as string
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
    return `Wrote ${Buffer.byteLength(content, 'utf-8')} bytes to ${path}`
  } catch (err) {
    return `Error writing file: ${(err as Error).message}`
  }
}

async function handlePatch(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string
  const oldString = args.old_string as string
  const newString = args.new_string as string
  try {
    const content = await readFile(path, 'utf-8')
    if (!content.includes(oldString)) {
      return `Error: old_string not found in ${path}`
    }
    const updated = content.replace(oldString, newString)
    await writeFile(path, updated, 'utf-8')
    return `Patched ${path}`
  } catch (err) {
    return `Error patching file: ${(err as Error).message}`
  }
}

async function handleShell(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '')
      resolve(output || (error ? error.message : ''))
    })
  })
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  read_file: handleReadFile,
  write_file: handleWriteFile,
  patch: handlePatch,
  shell: handleShell,
}
