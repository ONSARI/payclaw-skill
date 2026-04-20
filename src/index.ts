/**
 * PayClaw · Agent Payments — OpenClaw skill entry point.
 *
 * Public API:
 *   pay({ to, amount, currency?, memo?, agentId? }) → PaymentReceipt
 *   balance({ agentId? }) → WalletBalance
 *   history({ agentId?, limit?, since?, direction? }) → PayClawTx[]
 *
 * Design goals (v0.1):
 *   - Zero SDK boilerplate: single import, three functions
 *   - Auto-provision wallet on first pay() (no setup step)
 *   - 1% flat take rate, no fixed fees — optimal for agent micropayments
 *   - USDC on Base mainnet by default (native Circle issuance, CCTP-portable)
 *   - On-chain settlement only: no custody, no chargebacks, final and audit-able
 *
 * Future (v0.2+):
 *   - ERC-4337 paymaster integration so agents don't need ETH for gas
 *   - Spending-limit policies + revocation (requires Grip identity layer)
 *   - Yield-bearing idle balances (USDe/sUSDS opt-in)
 *   - Multi-chain (CCTP to Arbitrum / Optimism / Polygon)
 */

import { JsonRpcProvider, Contract, formatUnits, parseUnits, isAddress } from 'ethers'
import { resolveConfig, USDC_ABI, type PayClawConfig } from './config.js'
import { loadOrCreateWallet, resolvePassphrase } from './wallet.js'
import { checkDailyCap, recordSpend } from './ledger.js'

// Re-export config helpers for advanced users
export { resolveConfig, DEFAULTS } from './config.js'
export type { PayClawConfig } from './config.js'

// ────────────────────────────────────────────────────────────────────────────
// Types

export interface PayArgs {
  to: string
  amount: string          // decimal string in asset units (e.g. "1.50")
  currency?: 'USDC'       // v0.1 supports USDC only
  memo?: string
  agentId?: string        // override agent id; defaults to env OPENCLAW_AGENT_ID
  config?: Partial<PayClawConfig>
}

export interface PaymentReceipt {
  txHash: string
  status: 'confirmed' | 'failed'
  amountSent: string
  feeCharged: string
  blockNumber: number
  explorer: string
}

export interface WalletBalance {
  address: string
  usdc: string
  usdcRaw: string
  eth: string
  chain: string
  explorer: string
}

export interface HistoryArgs {
  agentId?: string
  limit?: number
  since?: string
  direction?: 'out' | 'in' | 'all'
  config?: Partial<PayClawConfig>
}

export interface PayClawTx {
  txHash: string
  timestamp: string
  direction: 'out' | 'in'
  counterparty: string
  amount: string
  fee: string
  memo: string | null
  blockNumber: number
  explorer: string
}

// Error codes surfaced to the caller
export class PayClawError extends Error {
  constructor(public code: PayClawErrorCode, message: string) {
    super(message)
    this.name = 'PayClawError'
  }
}
export type PayClawErrorCode =
  | 'WALLET_NEEDS_FUNDING'
  | 'INSUFFICIENT_GAS'
  | 'INVALID_RECIPIENT'
  | 'AMOUNT_BELOW_DUST'
  | 'RPC_ERROR'
  | 'MISSING_AGENT_ID'
  | 'RECIPIENT_NOT_WHITELISTED'
  | 'DAILY_CAP_EXCEEDED'
  | 'INVALID_FEE_RECIPIENT'

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers

function resolveAgentId(override?: string): string {
  const id = override ?? process.env.OPENCLAW_AGENT_ID ?? process.env.AGENT_ID
  if (!id) {
    throw new PayClawError(
      'MISSING_AGENT_ID',
      'Could not resolve agent id. Pass `agentId` explicitly or set OPENCLAW_AGENT_ID in env.',
    )
  }
  return id
}

function explorerTx(hash: string): string {
  return `https://basescan.org/tx/${hash}`
}

function explorerAddr(addr: string): string {
  return `https://basescan.org/address/${addr}`
}

// ────────────────────────────────────────────────────────────────────────────
// Public: pay()

export async function pay(args: PayArgs): Promise<PaymentReceipt> {
  const cfg = resolveConfig(args.config)
  const agentId = resolveAgentId(args.agentId)

  // ── Input validation ───────────────────────────────────────────────────
  if (!isAddress(args.to)) {
    throw new PayClawError('INVALID_RECIPIENT', `Not a valid 0x address: ${args.to}`)
  }

  // Optional recipient whitelist — defends against prompt-injection attacks
  // that try to redirect a payment to an adversarial address. Opt-in via
  // config.recipientWhitelist or PAYCLAW_WHITELIST env var.
  if (cfg.recipientWhitelist) {
    const toLower = args.to.toLowerCase()
    const allowed = cfg.recipientWhitelist.some((a) => a.toLowerCase() === toLower)
    if (!allowed) {
      throw new PayClawError(
        'RECIPIENT_NOT_WHITELISTED',
        `Recipient ${args.to} is not in the configured whitelist. Add it to recipientWhitelist or disable the whitelist by removing the config.`,
      )
    }
  }

  const provider = new JsonRpcProvider(cfg.rpcUrl)

  // Security check: feeRecipient must be an EOA, never a contract. Defends
  // against a configuration-injection attack where someone sets feeRecipient
  // to a malicious contract that reenters on ERC-20 transfer hooks (USDC
  // doesn't have transfer hooks today, but future assets might — belt and
  // braces). This also blocks a class of honest mistakes.
  try {
    const code = await provider.getCode(cfg.feeRecipient)
    if (code && code !== '0x') {
      throw new PayClawError(
        'INVALID_FEE_RECIPIENT',
        `feeRecipient ${cfg.feeRecipient} is a contract, not an EOA. Refusing to proceed.`,
      )
    }
  } catch (e) {
    if (e instanceof PayClawError) throw e
    // If we can't read code (RPC issue), fall through — don't block payments.
  }

  const passphrase = await resolvePassphrase(agentId)
  const signer = (await loadOrCreateWallet({
    agentId,
    storeTemplate: cfg.walletStore,
    passphrase,
  })).connect(provider)

  const usdc = new Contract(cfg.usdcAddress, USDC_ABI, signer)
  const decimals: number = Number(await usdc.decimals())

  // Dust protection: reject absurdly small payments
  const amountNum = Number(args.amount)
  if (!(amountNum >= 0.01)) {
    throw new PayClawError(
      'AMOUNT_BELOW_DUST',
      `Amount ${args.amount} is below the 0.01 USDC dust threshold.`,
    )
  }

  const amountRaw = parseUnits(args.amount, decimals)
  const feeRaw = (amountRaw * BigInt(cfg.feeBps)) / 10_000n
  const totalDebit = amountRaw + feeRaw
  const totalDebitUsdc = Number(formatUnits(totalDebit, decimals))

  // Daily spending cap — trip-wire in case the keystore is compromised.
  // Prevents an attacker from draining the full balance in a single day.
  const capCheck = await checkDailyCap({
    agentId,
    storeTemplate: cfg.spendLedgerStore,
    amountUsdc: totalDebitUsdc,
    capUsdc: cfg.dailyCapUsdc,
  })
  if (!capCheck.allowed) {
    throw new PayClawError('DAILY_CAP_EXCEEDED', capCheck.reason ?? 'Daily cap exceeded.')
  }

  // Check balance upfront for a clean error
  const balanceRaw: bigint = await usdc.balanceOf(await signer.getAddress())
  if (balanceRaw < totalDebit) {
    throw new PayClawError(
      'WALLET_NEEDS_FUNDING',
      `Agent wallet ${await signer.getAddress()} needs at least ${formatUnits(totalDebit, decimals)} USDC; has ${formatUnits(balanceRaw, decimals)}.`,
    )
  }

  // ETH-for-gas check (skip if paymaster is configured — v0.2)
  if (!cfg.paymasterUrl) {
    const ethBal = await provider.getBalance(await signer.getAddress())
    if (ethBal < parseUnits('0.00005', 'ether')) {
      throw new PayClawError(
        'INSUFFICIENT_GAS',
        `Wallet ${await signer.getAddress()} has no ETH for gas. Fund with ~0.0005 ETH or configure a paymaster.`,
      )
    }
  }

  // Settle: transfer to recipient, then fee to treasury. Two sequential txs
  // sharing the same session but different nonces so failures are isolated.
  // (v0.2 will batch these via an ERC-4337 UserOp or a wrapping contract.)
  const txRecipient = await usdc.transfer(args.to, amountRaw)
  const recRecipient = await txRecipient.wait()
  if (recRecipient?.status !== 1) {
    return {
      txHash: txRecipient.hash,
      status: 'failed',
      amountSent: args.amount,
      feeCharged: '0',
      blockNumber: recRecipient?.blockNumber ?? 0,
      explorer: explorerTx(txRecipient.hash),
    }
  }

  // Best-effort fee settlement. If it fails, the recipient already got paid.
  try {
    const txFee = await usdc.transfer(cfg.feeRecipient, feeRaw)
    await txFee.wait()
  } catch {
    // Intentional: don't fail the whole pay() call if the fee transfer
    // couldn't land. The recipient is made whole; we reconcile off-chain.
  }

  // Record in the daily spend ledger AFTER on-chain settlement, so a failed
  // tx never inflates the cap.
  await recordSpend({
    agentId,
    storeTemplate: cfg.spendLedgerStore,
    amountUsdc: totalDebitUsdc,
  })

  return {
    txHash: txRecipient.hash,
    status: 'confirmed',
    amountSent: formatUnits(amountRaw, decimals),
    feeCharged: formatUnits(feeRaw, decimals),
    blockNumber: recRecipient.blockNumber,
    explorer: explorerTx(txRecipient.hash),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public: balance()

export async function balance(args: { agentId?: string; config?: Partial<PayClawConfig> } = {}): Promise<WalletBalance> {
  const cfg = resolveConfig(args.config)
  const agentId = resolveAgentId(args.agentId)
  const provider = new JsonRpcProvider(cfg.rpcUrl)
  const passphrase = await resolvePassphrase(agentId)
  const signer = await loadOrCreateWallet({
    agentId,
    storeTemplate: cfg.walletStore,
    passphrase,
  })
  const address = await signer.getAddress()
  const usdc = new Contract(cfg.usdcAddress, USDC_ABI, provider)
  const decimals: number = Number(await usdc.decimals())
  const usdcRaw: bigint = await usdc.balanceOf(address)
  const ethBal = await provider.getBalance(address)
  return {
    address,
    usdc: formatUnits(usdcRaw, decimals),
    usdcRaw: usdcRaw.toString(),
    eth: formatUnits(ethBal, 'ether'),
    chain: 'base-mainnet',
    explorer: explorerAddr(address),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public: history()

export async function history(args: HistoryArgs = {}): Promise<PayClawTx[]> {
  const cfg = resolveConfig(args.config)
  const agentId = resolveAgentId(args.agentId)
  const limit = Math.max(1, Math.min(100, args.limit ?? 20))
  const provider = new JsonRpcProvider(cfg.rpcUrl)
  const passphrase = await resolvePassphrase(agentId)
  const signer = await loadOrCreateWallet({
    agentId,
    storeTemplate: cfg.walletStore,
    passphrase,
  })
  const address = (await signer.getAddress()).toLowerCase()
  const usdc = new Contract(cfg.usdcAddress, USDC_ABI, provider)
  const decimals: number = Number(await usdc.decimals())

  // Query last 100k blocks of Transfer events (Base ≈ 2s blocks → ~55h of history)
  const currentBlock = await provider.getBlockNumber()
  const fromBlock = Math.max(0, currentBlock - 100_000)

  const outFilter = usdc.filters.Transfer(address, null)
  const inFilter = usdc.filters.Transfer(null, address)
  const [outEvents, inEvents] = await Promise.all([
    args.direction === 'in' ? [] : usdc.queryFilter(outFilter, fromBlock, currentBlock),
    args.direction === 'out' ? [] : usdc.queryFilter(inFilter, fromBlock, currentBlock),
  ])

  const all = [...outEvents, ...inEvents]
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, limit)

  // Hydrate timestamps
  const blocks = new Map<number, number>()
  await Promise.all(
    [...new Set(all.map((e) => e.blockNumber))].map(async (bn) => {
      const b = await provider.getBlock(bn)
      if (b) blocks.set(bn, b.timestamp)
    }),
  )

  const feeRecipientLower = cfg.feeRecipient.toLowerCase()

  return all.map((e): PayClawTx => {
    const args = (e as any).args as { from: string; to: string; value: bigint }
    const direction: 'out' | 'in' = args.from.toLowerCase() === address ? 'out' : 'in'
    const counterparty = direction === 'out' ? args.to : args.from
    const isFee = direction === 'out' && counterparty.toLowerCase() === feeRecipientLower
    const ts = blocks.get(e.blockNumber) ?? 0
    return {
      txHash: e.transactionHash,
      timestamp: new Date(ts * 1000).toISOString(),
      direction,
      counterparty,
      amount: formatUnits(args.value, decimals),
      fee: isFee ? formatUnits(args.value, decimals) : '0',
      memo: null,
      blockNumber: e.blockNumber,
      explorer: explorerTx(e.transactionHash),
    }
  })
}
