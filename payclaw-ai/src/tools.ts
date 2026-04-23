/**
 * Vercel AI SDK tool factories for the PayClaw API.
 *
 * Three tools are exposed (factories — call them to get a configured tool):
 *
 * - {@link payclawBalanceTool} — read USDC balance + wallet address.
 * - {@link payclawPayTool} — send USDC to an address on Base mainnet.
 * - {@link payclawHistoryTool} — list recent on-chain USDC transfers.
 *
 * For convenience, {@link createPayClawTools} returns all three pre-keyed
 * for direct spread into ``generateText({ tools: { ...payclaw } })``.
 */

import { tool } from 'ai'
import { z } from 'zod'

import {
  PayClawClient,
  PayClawError,
  type PayClawBalance,
  type PayClawConfig,
  type PayClawHistory,
  type PayClawReceipt,
} from './client.js'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const AMOUNT_RE = /^\d+(\.\d+)?$/

function formatError(err: unknown): string {
  if (err instanceof PayClawError) {
    let msg = `PayClaw API error (${err.status}): ${err.errorCode}`
    if (err.detail) msg += `. Detail: ${err.detail}`
    if (err.status === 401) msg += ' Hint: check that PAYCLAW_API_TOKEN is set correctly.'
    if (err.status === 429)
      msg +=
        " Hint: you're rate-limited. Fund the wallet with USDC to bypass the empty-wallet rate limit, or wait."
    return msg
  }
  if (err instanceof Error) return `PayClaw client error: ${err.message}`
  return `PayClaw unknown error: ${String(err)}`
}

// --------------------------------------------------------------------------- //
// Balance                                                                     //
// --------------------------------------------------------------------------- //

const BalanceInput = z.object({}).describe(
  "Read the agent's PayClaw wallet USDC balance and address on Base mainnet. No arguments required.",
)

export function payclawBalanceTool(config: PayClawConfig = {}) {
  return tool({
    description:
      "Read the agent's PayClaw wallet USDC balance and address on Base mainnet. " +
      'Returns address, USDC balance (decimal), chain, and a Basescan explorer URL. ' +
      'Read-only, no signing, no fee. Use before any transfer to confirm the wallet ' +
      "is funded, or whenever the user asks 'how much do I have'.",
    inputSchema: BalanceInput,
    execute: async (): Promise<PayClawBalance | string> => {
      try {
        return await new PayClawClient(config).getBalance()
      } catch (err) {
        return formatError(err)
      }
    },
  })
}

// --------------------------------------------------------------------------- //
// Pay                                                                         //
// --------------------------------------------------------------------------- //

const PayInput = z.object({
  to: z
    .string()
    .regex(ADDRESS_RE, '`to` must be a 0x-prefixed 40-character hex address (Base mainnet).')
    .describe('Recipient address on Base mainnet. Must be a valid 0x-prefixed 40-character hex address.'),
  amount: z
    .string()
    .regex(
      AMOUNT_RE,
      "`amount` must be a decimal string in USDC (e.g. '0.05'). Do not include currency symbols.",
    )
    .describe(
      "USDC amount as a decimal string (e.g. '0.05', '10', '1.234567'). " +
        'Minimum 0.01 USDC. PayClaw charges a 1% fee on top.',
    ),
})

export function payclawPayTool(config: PayClawConfig = {}) {
  return tool({
    description:
      "Send USDC from the agent's wallet to a Base mainnet address. " +
      'Pays gas in USDC via Circle Paymaster — no ETH needed. Charges 1% fee. ' +
      'Returns txHash and a Basescan explorer URL on success. ' +
      'WARNING: this moves real on-chain USDC and is irreversible. ' +
      'Confirm recipient and amount with the user before calling.',
    inputSchema: PayInput,
    execute: async ({ to, amount }): Promise<PayClawReceipt | string> => {
      try {
        return await new PayClawClient(config).pay({ to, amount })
      } catch (err) {
        return formatError(err)
      }
    },
  })
}

// --------------------------------------------------------------------------- //
// History                                                                     //
// --------------------------------------------------------------------------- //

const HistoryInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Max number of transactions to return (1-50, default 10).'),
})

export function payclawHistoryTool(config: PayClawConfig = {}) {
  return tool({
    description:
      "List recent USDC transfers (in + out) for the agent's PayClaw wallet on Base. " +
      'Returns recent transactions with direction, counterparty, amount, txHash, ' +
      'blockNumber, and Basescan explorer URL. Read-only. Covers the last ~28h.',
    inputSchema: HistoryInput,
    execute: async ({ limit }): Promise<PayClawHistory | string> => {
      try {
        return await new PayClawClient(config).getHistory(limit)
      } catch (err) {
        return formatError(err)
      }
    },
  })
}

// --------------------------------------------------------------------------- //
// Convenience factory                                                         //
// --------------------------------------------------------------------------- //

/**
 * Returns all three PayClaw tools pre-keyed with conventional names. Spread
 * directly into the ``tools`` argument of ``generateText`` / ``streamText``:
 *
 * ```ts
 * import { createPayClawTools } from '@grip-labs/payclaw-ai'
 *
 * const payclaw = createPayClawTools()
 * await generateText({
 *   model: openai('gpt-4o-mini'),
 *   prompt: 'Check my balance.',
 *   tools: { ...payclaw },
 * })
 * ```
 */
export function createPayClawTools(config: PayClawConfig = {}) {
  return {
    payclaw_get_balance: payclawBalanceTool(config),
    payclaw_pay: payclawPayTool(config),
    payclaw_get_history: payclawHistoryTool(config),
  }
}
