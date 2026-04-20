/**
 * PayClaw skill configuration.
 * Values can be overridden via `configSchema` in payclaw.plugin.json,
 * via environment variables, or at runtime by passing to `pay(...)` as options.
 *
 * Precedence: call-site options > env vars > plugin config > defaults.
 */

export interface PayClawConfig {
  rpcUrl: string
  usdcAddress: string
  feeRecipient: string
  feeBps: number
  walletStore: string
  paymasterUrl?: string
  /**
   * Optional opt-in recipient whitelist. If set (non-empty), pay() will reject
   * any `to` address not present in the list. Useful to protect agents against
   * prompt-injection attacks that try to redirect payments to an adversarial
   * address. Addresses are compared case-insensitively.
   */
  recipientWhitelist?: string[]
  /**
   * Daily spending cap in USDC (human-readable decimal, e.g. "100" = $100/day).
   * Accumulates per-agent per-UTC-day. pay() rejects the call if the new
   * payment would push today's total above this cap.
   * Default: 100 (USDC). Set to 0 to disable the cap (NOT recommended).
   */
  dailyCapUsdc: number
  /**
   * Directory where the per-agent daily-spend ledger is persisted.
   * {agentId} is substituted at runtime. chmod 600 on write.
   */
  spendLedgerStore: string
}

/**
 * Defaults resolve to Base mainnet with native Circle USDC + the PayClaw v1
 * treasury contract (0x0833...) as fee recipient. Match the values declared
 * in `payclaw.plugin.json` configSchema.
 */
export const DEFAULTS: PayClawConfig = {
  rpcUrl: 'https://mainnet.base.org',
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC native on Base mainnet
  // Default treasury = dedicated PayClaw fee-recipient EOA on Base, held in a
  // hardware wallet (Ledger), isolated from any other Grip Labs address and
  // without prior on-chain history. Rotating here affects only where the 1%
  // take rate is sent; override freely via config for forks.
  feeRecipient: '0xba14744FfD57FA7d03b20D4c8BeDAaC301E865d1',
  feeBps: 100, // 1.00%
  walletStore: '~/.openclaw/agents/{agentId}/payclaw-wallet.json',
  dailyCapUsdc: 100, // $100/day default. Disable with 0.
  spendLedgerStore: '~/.openclaw/agents/{agentId}/payclaw-spend-ledger.json',
}

export function resolveConfig(overrides: Partial<PayClawConfig> = {}): PayClawConfig {
  const env = (k: string) => process.env[k]
  const parseList = (s: string | undefined): string[] | undefined =>
    s ? s.split(',').map((a) => a.trim()).filter(Boolean) : undefined
  const whitelist = overrides.recipientWhitelist ?? parseList(env('PAYCLAW_WHITELIST'))
  return {
    rpcUrl: overrides.rpcUrl ?? env('PAYCLAW_RPC_URL') ?? DEFAULTS.rpcUrl,
    usdcAddress: overrides.usdcAddress ?? env('PAYCLAW_USDC_ADDRESS') ?? DEFAULTS.usdcAddress,
    feeRecipient: overrides.feeRecipient ?? env('PAYCLAW_FEE_RECIPIENT') ?? DEFAULTS.feeRecipient,
    feeBps: overrides.feeBps ?? Number(env('PAYCLAW_FEE_BPS') ?? DEFAULTS.feeBps),
    walletStore: overrides.walletStore ?? env('PAYCLAW_WALLET_STORE') ?? DEFAULTS.walletStore,
    paymasterUrl: overrides.paymasterUrl ?? env('PAYCLAW_PAYMASTER_URL'),
    recipientWhitelist: whitelist && whitelist.length > 0 ? whitelist : undefined,
    dailyCapUsdc: overrides.dailyCapUsdc ?? Number(env('PAYCLAW_DAILY_CAP_USDC') ?? DEFAULTS.dailyCapUsdc),
    spendLedgerStore: overrides.spendLedgerStore ?? env('PAYCLAW_SPEND_LEDGER_STORE') ?? DEFAULTS.spendLedgerStore,
  }
}

// ERC-20 minimal ABI — Transfer(address,address,uint256) event + balanceOf + transfer
export const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
] as const
