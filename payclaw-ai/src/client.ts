/**
 * Async fetch-based HTTP client for the PayClaw REST API.
 *
 * Uses native ``fetch`` so it works in Node ≥18, Edge runtime, Next.js
 * Server Actions, Bun, Deno, and any other modern JS runtime — no external
 * HTTP library required.
 */

export const DEFAULT_BASE_URL = 'https://www.payclaw.me'
export const DEFAULT_TIMEOUT_MS = 60_000 // /pay can take 20-40s on first deploy

export interface PayClawConfig {
  /**
   * Bearer token. If omitted, reads ``PAYCLAW_API_TOKEN`` from
   * ``process.env`` (Node / Edge runtime).
   */
  apiToken?: string
  /** Override the API host. Defaults to ``https://www.payclaw.me``. */
  baseUrl?: string
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number
}

export interface PayClawBalance {
  address: string
  signerAddress: string
  usdc: string
  usdcRaw: string
  chain: string
  explorer: string
}

export interface PayClawReceipt {
  txHash: string
  status: string
  amountSent: string
  feeCharged: string
  gasPaidInUsdc: string
  smartAccountAddress: string
  explorer: string
}

export interface PayClawTransaction {
  direction: 'in' | 'out'
  counterparty: string
  amount: string
  txHash: string
  blockNumber: number
  explorer: string
}

export interface PayClawHistory {
  transactions: PayClawTransaction[]
}

export class PayClawError extends Error {
  readonly status: number
  readonly errorCode: string
  readonly detail?: string

  constructor(status: number, errorCode: string, detail?: string) {
    super(detail ? `[${status}] ${errorCode} — ${detail}` : `[${status}] ${errorCode}`)
    this.name = 'PayClawError'
    this.status = status
    this.errorCode = errorCode
    this.detail = detail
  }
}

function resolveToken(explicit?: string): string {
  const token = explicit ?? (typeof process !== 'undefined' ? process.env.PAYCLAW_API_TOKEN : undefined)
  if (!token) {
    throw new Error(
      'PayClaw API token missing. Pass `apiToken` in the config or set ' +
        'PAYCLAW_API_TOKEN in the environment.',
    )
  }
  return token
}

export class PayClawClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(config: PayClawConfig = {}) {
    this.token = resolveToken(config.apiToken)
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...((init.headers as Record<string, string>) ?? {}) },
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    let payload: unknown
    try {
      payload = await res.json()
    } catch {
      payload = { error: (await res.text().catch(() => '')) || 'Non-JSON response' }
    }

    if (!res.ok) {
      const p = payload as { error?: string; detail?: string }
      throw new PayClawError(res.status, p.error ?? 'Unknown error', p.detail)
    }
    return payload as T
  }

  async getBalance(): Promise<PayClawBalance> {
    return this.request<PayClawBalance>('/api/gpt/balance', { method: 'GET' })
  }

  async pay(args: { to: string; amount: string }): Promise<PayClawReceipt> {
    return this.request<PayClawReceipt>('/api/gpt/pay', {
      method: 'POST',
      body: JSON.stringify(args),
    })
  }

  async getHistory(limit = 10): Promise<PayClawHistory> {
    return this.request<PayClawHistory>(`/api/gpt/history?limit=${limit}`, { method: 'GET' })
  }
}
