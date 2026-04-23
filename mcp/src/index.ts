#!/usr/bin/env node
/**
 * PayClaw MCP Server
 *
 * Exposes the @grip-labs/payclaw SDK as an MCP server so any MCP-compatible
 * client (Claude Desktop, Cursor, Cline, ...) can give an agent its own wallet
 * and let it move value on Base mainnet — without npm install or boilerplate.
 *
 * Tools exposed:
 *   payclaw_pay       — send USDC to a 0x address (1% take rate, on-chain)
 *   payclaw_balance   — read the agent wallet's USDC balance + address
 *   payclaw_history   — list recent USDC transfers in/out of the agent wallet
 *
 * Each MCP "agent" gets its own wallet keyed by the PAYCLAW_AGENT_ID env var
 * (or `agentId` arg passed at call time). Wallets are auto-provisioned on
 * first call, encrypted on disk under ~/.openclaw/agents/{agentId}/.
 *
 * Transport: stdio. The client (Claude Desktop, Cursor, etc.) spawns this
 * process and speaks JSON-RPC over stdin/stdout. Logs go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  pay,
  balance,
  history,
  PayClawError,
  type PaymentReceipt,
  type WalletBalance,
  type PayClawTx,
} from '@grip-labs/payclaw'

const SERVER_NAME = '@grip-labs/payclaw-mcp'
const SERVER_VERSION = '0.2.5'

// Resolve the default agent id from MCP-server-scoped env vars. Each MCP
// client (Claude Desktop, Cursor, etc.) sets PAYCLAW_AGENT_ID in its config
// to namespace its wallet. The SDK itself reads OPENCLAW_AGENT_ID / AGENT_ID,
// so we translate here and pass the resolved id explicitly per tool call.
const DEFAULT_AGENT_ID =
  process.env.PAYCLAW_AGENT_ID ??
  process.env.OPENCLAW_AGENT_ID ??
  process.env.AGENT_ID ??
  undefined

const SERVER_INSTRUCTIONS = `
PayClaw gives an AI agent its own on-chain wallet (USDC on Base mainnet) and
three operations: pay, balance, history. The wallet is auto-provisioned on
first use; the address is returned by payclaw_balance.

Funding (important): the agent's wallet starts at $0. A human funds it by
sending USDC on Base to the address returned by payclaw_balance. There is no
on-ramp inside this MCP server today — surface the wallet address to the user
and ask them to fund it externally before attempting a payment.

Take rate: 1% flat per settled transaction, no fixed fee. Settles on-chain
with finality in ~2 seconds. Receipts include the tx hash and a Basescan URL.

Safety: a default $100/UTC-day spending cap and EOA-only fee recipient are
enforced by the SDK. An optional recipient whitelist is available via the
PAYCLAW_WHITELIST env var to harden against prompt-injection redirects.
`.trim()

const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { instructions: SERVER_INSTRUCTIONS },
)

// Helper: convert SDK errors to MCP-friendly tool error responses
function toolError(err: unknown) {
  if (err instanceof PayClawError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `PayClaw error [${err.code}]: ${err.message}`,
        },
      ],
      isError: true,
    }
  }
  const msg = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: `Unexpected error: ${msg}` }],
    isError: true,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Tool: payclaw_pay

server.registerTool(
  'payclaw_pay',
  {
    title: 'Send USDC payment',
    description:
      'Send USDC from the agent wallet to a 0x address on Base mainnet. ' +
      'Returns a receipt with tx hash + explorer URL. Charges 1% take rate. ' +
      'Auto-provisions the agent wallet on first call. Subject to a default ' +
      '$100/UTC-day spending cap.',
    inputSchema: {
      to: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid 0x address')
        .describe('Recipient address (0x...) on Base mainnet'),
      amount: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'Decimal string, e.g. "1.50"')
        .describe('Amount in USDC as decimal string (min 0.01)'),
      memo: z
        .string()
        .max(280)
        .optional()
        .describe('Optional human-readable memo (off-chain only, not stored on-chain in v0.1)'),
      agentId: z
        .string()
        .optional()
        .describe('Override agent id (defaults to PAYCLAW_AGENT_ID / OPENCLAW_AGENT_ID env)'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ to, amount, memo, agentId }) => {
    try {
      const receipt: PaymentReceipt = await pay({
        to,
        amount,
        memo,
        agentId: agentId ?? DEFAULT_AGENT_ID,
      })
      return {
        content: [
          {
            type: 'text' as const,
            text:
              receipt.status === 'confirmed'
                ? `Payment confirmed.\n` +
                  `  Sent: ${receipt.amountSent} USDC\n` +
                  `  Fee:  ${receipt.feeCharged} USDC (1%)\n` +
                  `  Tx:   ${receipt.txHash}\n` +
                  `  See:  ${receipt.explorer}`
                : `Payment failed (tx ${receipt.txHash}). See: ${receipt.explorer}`,
          },
        ],
        structuredContent: receipt as unknown as Record<string, unknown>,
        isError: receipt.status !== 'confirmed',
      }
    } catch (err) {
      return toolError(err)
    }
  },
)

// ────────────────────────────────────────────────────────────────────────────
// Tool: payclaw_balance

server.registerTool(
  'payclaw_balance',
  {
    title: 'Read agent wallet balance',
    description:
      'Returns the agent wallet address, current USDC balance, and a Basescan ' +
      'link. Auto-provisions the wallet on first call — useful to obtain the ' +
      'funding address for a freshly-installed agent. Gas is paid in USDC via ' +
      'Circle Paymaster, so the agent never needs ETH.',
    inputSchema: {
      agentId: z
        .string()
        .optional()
        .describe('Override agent id (defaults to PAYCLAW_AGENT_ID / OPENCLAW_AGENT_ID env)'),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ agentId }) => {
    try {
      const bal: WalletBalance = await balance({ agentId: agentId ?? DEFAULT_AGENT_ID })
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Agent wallet: ${bal.address}\n` +
              `  USDC: ${bal.usdc}\n` +
              `  Chain: ${bal.chain} — gasless: USDC pays its own gas via Circle Paymaster\n` +
              `  See:  ${bal.explorer}`,
          },
        ],
        structuredContent: bal as unknown as Record<string, unknown>,
      }
    } catch (err) {
      return toolError(err)
    }
  },
)

// ────────────────────────────────────────────────────────────────────────────
// Tool: payclaw_history

server.registerTool(
  'payclaw_history',
  {
    title: 'List recent agent wallet transactions',
    description:
      'Returns the most recent USDC Transfer events touching the agent wallet ' +
      '(in, out, or both) over the last ~55 hours of Base history. Each entry ' +
      'has tx hash, timestamp, direction, counterparty, amount, and explorer URL.',
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max number of transactions to return (1-100, default 20)'),
      direction: z
        .enum(['out', 'in', 'all'])
        .optional()
        .describe('Filter by direction (default: all)'),
      agentId: z
        .string()
        .optional()
        .describe('Override agent id (defaults to PAYCLAW_AGENT_ID / OPENCLAW_AGENT_ID env)'),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ limit, direction, agentId }) => {
    try {
      const txs: PayClawTx[] = await history({
        limit,
        direction,
        agentId: agentId ?? DEFAULT_AGENT_ID,
      })
      if (txs.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No transactions found in the last ~55 hours.' }],
          structuredContent: { transactions: [] },
        }
      }
      const lines = txs.map(
        (t) =>
          `  ${t.direction === 'out' ? '→' : '←'} ${t.amount} USDC ` +
          `${t.direction === 'out' ? 'to' : 'from'} ${t.counterparty} ` +
          `(${t.timestamp}) — ${t.explorer}`,
      )
      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${txs.length} transaction(s):\n${lines.join('\n')}`,
          },
        ],
        structuredContent: { transactions: txs as unknown as Record<string, unknown>[] },
      }
    } catch (err) {
      return toolError(err)
    }
  },
)

// ────────────────────────────────────────────────────────────────────────────
// Boot

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only — stdout is reserved for JSON-RPC
  console.error(`${SERVER_NAME}@${SERVER_VERSION} listening on stdio`)
}

main().catch((err) => {
  console.error('Fatal error in PayClaw MCP server:', err)
  process.exit(1)
})
