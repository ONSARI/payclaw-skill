/**
 * Per-agent daily spend ledger.
 *
 * Tracks USDC amount spent per UTC day. Persisted to disk (chmod 600).
 * pay() reads the day's total + rejects if the new payment would exceed
 * the configured daily cap.
 *
 * Threat model: mitigates partial damage from a compromised agent / stolen
 * keystore — an attacker cannot drain the whole balance in a single day.
 * The cap is a trip-wire, not a hard lock — users under the cap are not
 * inconvenienced.
 *
 * NOT a substitute for hardware-backed keys or on-chain spending policies.
 * Just a local soft-guard that raises the cost of an exploited private key.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

export interface SpendLedger {
  agentId: string
  /** UTC day -> cumulative USDC spent that day (human-readable decimal string). */
  days: Record<string, string>
  version: 1
}

function expandPath(template: string, agentId: string): string {
  return resolve(
    template.replace(/^~(?=$|\/|\\)/, homedir()).replace('{agentId}', agentId),
  )
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p, FS.F_OK); return true } catch { return false }
}

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

async function load(agentId: string, storeTemplate: string): Promise<SpendLedger> {
  const path = expandPath(storeTemplate, agentId)
  if (!(await fileExists(path))) {
    return { agentId, days: {}, version: 1 }
  }
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as SpendLedger
}

async function save(ledger: SpendLedger, storeTemplate: string): Promise<void> {
  const path = expandPath(storeTemplate, ledger.agentId)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(ledger, null, 2), { mode: 0o600 })
}

export interface CapCheckResult {
  allowed: boolean
  todaySpent: number
  cap: number
  wouldBe: number
  reason?: string
}

/**
 * Check whether `amountUsdc` can be added to today's spend without breaching
 * the cap. Does NOT mutate the ledger — call `recordSpend` after the on-chain
 * settlement succeeds.
 */
export async function checkDailyCap(opts: {
  agentId: string
  storeTemplate: string
  amountUsdc: number
  capUsdc: number
  now?: Date
}): Promise<CapCheckResult> {
  if (opts.capUsdc <= 0) {
    // Cap disabled
    return { allowed: true, todaySpent: 0, cap: 0, wouldBe: opts.amountUsdc }
  }
  const ledger = await load(opts.agentId, opts.storeTemplate)
  const day = utcDayKey(opts.now)
  const todaySpent = Number(ledger.days[day] ?? '0')
  const wouldBe = todaySpent + opts.amountUsdc
  if (wouldBe > opts.capUsdc) {
    return {
      allowed: false,
      todaySpent,
      cap: opts.capUsdc,
      wouldBe,
      reason: `Daily cap exceeded: today=${todaySpent.toFixed(2)} USDC, attempted=${opts.amountUsdc.toFixed(2)} USDC, cap=${opts.capUsdc.toFixed(2)} USDC. Reset at 00:00 UTC.`,
    }
  }
  return { allowed: true, todaySpent, cap: opts.capUsdc, wouldBe }
}

/**
 * Record a successful spend in the ledger (call after on-chain settlement).
 * Amount includes the base amount + fee (both debited from the agent wallet).
 */
export async function recordSpend(opts: {
  agentId: string
  storeTemplate: string
  amountUsdc: number
  now?: Date
}): Promise<void> {
  const ledger = await load(opts.agentId, opts.storeTemplate)
  const day = utcDayKey(opts.now)
  const prev = Number(ledger.days[day] ?? '0')
  ledger.days[day] = (prev + opts.amountUsdc).toFixed(6)
  // Garbage-collect entries older than 30 days to keep the file small
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  for (const k of Object.keys(ledger.days)) {
    if (k < cutoff) delete ledger.days[k]
  }
  await save(ledger, opts.storeTemplate)
}
