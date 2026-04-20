/**
 * Per-agent wallet storage.
 *
 * First time an agent calls pay(), a fresh secp256k1 EOA is generated
 * and persisted under ~/.openclaw/agents/{agentId}/payclaw-wallet.json
 * encrypted with the agent's OpenClaw identity key (or a local passphrase
 * when OpenClaw identity is unavailable).
 *
 * Wallet files are chmod 600. They are NEVER sent off-device.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { Wallet, HDNodeWallet } from 'ethers'

export interface StoredWallet {
  agentId: string
  address: string
  /** JSON-encoded ethers encrypted keystore (scrypt). */
  keystore: string
  createdAt: string
  version: 1
}

function expandPath(template: string, agentId: string): string {
  const home = homedir()
  return resolve(
    template
      .replace(/^~(?=$|\/|\\)/, home)
      .replace('{agentId}', agentId),
  )
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, FS.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Load the wallet for a given agentId, or create + persist a fresh one.
 * The passphrase used to encrypt the keystore defaults to the agent's
 * OpenClaw identity key if available, or a local per-machine secret
 * (NOT safe for production — replace with OpenClaw identity integration).
 */
export async function loadOrCreateWallet(opts: {
  agentId: string
  storeTemplate: string
  passphrase: string
}): Promise<Wallet> {
  const path = expandPath(opts.storeTemplate, opts.agentId)

  if (await fileExists(path)) {
    const stored = JSON.parse(await readFile(path, 'utf8')) as StoredWallet
    const decrypted = await Wallet.fromEncryptedJson(stored.keystore, opts.passphrase)
    // ethers returns HDNodeWallet | Wallet — normalize
    return decrypted instanceof HDNodeWallet
      ? new Wallet(decrypted.privateKey)
      : (decrypted as Wallet)
  }

  // Fresh wallet
  const w = Wallet.createRandom()
  const keystore = await w.encrypt(opts.passphrase)
  const stored: StoredWallet = {
    agentId: opts.agentId,
    address: w.address,
    keystore,
    createdAt: new Date().toISOString(),
    version: 1,
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(stored, null, 2), { mode: 0o600 })

  // Return a plain Wallet (no HD path) for signing
  return new Wallet(w.privateKey)
}

/**
 * Resolve the passphrase used to encrypt/decrypt an agent's keystore.
 * Preference order:
 *   1. `PAYCLAW_AGENT_PASSPHRASE` env (escape hatch for ops)
 *   2. OpenClaw identity key exposed via env (future integration)
 *   3. Derive from a per-machine secret at ~/.openclaw/keystore-passphrase
 *
 * IMPORTANT: option 3 is local-only and NOT sufficient for multi-host setups.
 * The real integration (v0.2) will use OpenClaw's identity subsystem so
 * keystore passphrases are tied to the agent's authenticated OpenClaw identity.
 */
export async function resolvePassphrase(agentId: string): Promise<string> {
  if (process.env.PAYCLAW_AGENT_PASSPHRASE) return process.env.PAYCLAW_AGENT_PASSPHRASE
  if (process.env.OPENCLAW_IDENTITY_KEY) return process.env.OPENCLAW_IDENTITY_KEY + ':' + agentId

  // Fallback: per-machine secret, created once, chmod 600
  const path = expandPath('~/.openclaw/keystore-passphrase', agentId)
  if (await fileExists(path)) {
    return (await readFile(path, 'utf8')).trim()
  }

  // Create a fresh one (32 random bytes hex)
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, secret + '\n', { mode: 0o600 })
  return secret
}
