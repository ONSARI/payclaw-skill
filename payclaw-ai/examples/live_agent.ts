/**
 * End-to-end Vercel AI SDK example — natural-language → tool call → on-chain proof.
 *
 *     export PAYCLAW_API_TOKEN=...
 *     export OPENAI_API_KEY=...
 *     npx tsx examples/live_agent.ts
 */

import { openai } from '@ai-sdk/openai'
import { generateText, stepCountIs } from 'ai'

import { createPayClawTools } from '../src/index.js'

async function main() {
  const payclaw = createPayClawTools()

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system:
      'You are PayClaw, a payments agent on Base mainnet. ' +
      'Use the payclaw tools to check balance and pay. ' +
      'Always include the Basescan explorer URL in the answer.',
    prompt: "What's my USDC balance and wallet address? Reply in one sentence.",
    tools: { ...payclaw },
    stopWhen: stepCountIs(3),
  })

  console.log('=== TEXT ===')
  console.log(result.text)
  console.log('\n=== TOOL CALLS ===')
  for (const step of result.steps) {
    for (const call of step.toolCalls ?? []) {
      console.log(`  -> ${call.toolName}(${JSON.stringify(call.input)})`)
    }
  }
}

main().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})
