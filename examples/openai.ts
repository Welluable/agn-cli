import { Agent, OpenAIProvider } from '../src/index.js'

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY before running this example.')
    process.exit(1)
  }

  const agent = new Agent({
    provider: new OpenAIProvider({
      apiKey,
      model: 'gpt-4o-mini',
    }),
    hooks: {
      onText: (delta) => process.stdout.write(delta),
    },
  })

  console.log('--- Running agent with OpenAI ---\n')
  const result = await agent.run('list all the files in current directory')

  console.log(`\nDone in ${result.iterations} iterations (${result.status})`)
}

main().catch(console.error)
