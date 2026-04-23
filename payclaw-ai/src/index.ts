/**
 * PayClaw tools for the Vercel AI SDK.
 *
 * Give your agent a USDC wallet on Base it can actually spend.
 * Gasless via Circle Paymaster — no ETH required, 1% flat fee.
 *
 * Quickstart:
 *
 * ```ts
 * import { generateText } from 'ai'
 * import { openai } from '@ai-sdk/openai'
 * import { createPayClawTools } from '@grip-labs/payclaw-ai'
 *
 * const payclaw = createPayClawTools()
 *
 * const { text } = await generateText({
 *   model: openai('gpt-4o-mini'),
 *   prompt: "What's my USDC balance?",
 *   tools: { ...payclaw },
 * })
 * ```
 *
 * Auth: set ``PAYCLAW_API_TOKEN`` in the environment, or pass ``apiToken``
 * to the tool factory.
 */

export {
  payclawBalanceTool,
  payclawPayTool,
  payclawHistoryTool,
  createPayClawTools,
} from './tools.js'

export {
  PayClawClient,
  PayClawError,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  type PayClawConfig,
  type PayClawBalance,
  type PayClawReceipt,
  type PayClawTransaction,
  type PayClawHistory,
} from './client.js'
