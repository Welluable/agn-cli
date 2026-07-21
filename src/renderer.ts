import chalk from 'chalk'
import type { AgentHooks } from './agent.js'

const MAX_TOOL_OUTPUT_LINES = 20

function truncateOutput(output: string): string {
  const lines = output.split('\n')
  if (lines.length <= MAX_TOOL_OUTPUT_LINES) return output
  return (
    lines.slice(0, MAX_TOOL_OUTPUT_LINES).join('\n') +
    `\n... (${lines.length - MAX_TOOL_OUTPUT_LINES} more lines)`
  )
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  if (name === 'shell') return String(args.command ?? '')
  if (name === 'read_file') return String(args.path ?? '')
  if (name === 'write_file') return String(args.path ?? '')
  if (name === 'patch') return String(args.path ?? '')
  return JSON.stringify(args)
}

export function createRenderer(): AgentHooks {
  return {
    onText(delta: string) {
      process.stdout.write(delta)
    },

    onToolCall({ name, args }) {
      const summary = formatToolArgs(name, args)
      console.log(`\n${chalk.cyan('┌─')} ${chalk.bold(name)}: ${summary}`)
    },

    onToolResult({ result }) {
      const truncated = truncateOutput(result)
      for (const line of truncated.split('\n')) {
        console.log(`${chalk.cyan('│')}  ${line}`)
      }
      console.log(`${chalk.cyan('└─')} ${chalk.dim('done')}`)
    },
  }
}
