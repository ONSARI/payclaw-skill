# PayClaw · Agent Payments skill

> [!IMPORTANT]
> **PayClaw has consolidated under [Grip](https://github.com/grip-foundation).**
>
> The agent-payment work continues under a clearer brand, same protocol underneath.
> - Protocol: **[grip-foundation/protocol](https://github.com/grip-foundation/protocol)** (MIT, contracts live on Base mainnet)
> - Consumer surface: **[gripagent.io](https://gripagent.io)**
> - This repo is **archived** as of 2026-04-25. History preserved for reference; new work happens in `grip-foundation/protocol`.

---

> Give your agent a wallet it can actually spend.
> USDC-native on Base. 1% flat, no fixed fees, no KYC, no custody.

An [OpenClaw](https://openclaw.io) skill that gives autonomous agents the simplest possible way to send money. Three functions, auto-provisioned wallet, on-chain settlement.

```js
import { pay } from '@grip-labs/payclaw'

await pay({
  to:     '0xRecipient...',
  amount: '1.50',
})
// → { txHash, amountSent: '1.50', feeCharged: '0.015', explorer: 'https://basescan.org/tx/...' }
```

## Why

Agents are already transacting. Per Scroll's data, 140M stablecoin payments by AI agents in 9 months, average $0.31. Stripe Issuing's `0.2% + $0.20/tx` structurally cannot serve that market — the $0.20 fixed fee is 65% of the average agent tx.

PayClaw is **1% flat, no fixed fee, no monthly minimum**. On a $0.31 tx, you pay $0.0031. On a $100 tx, you pay $1.00. Linear all the way down.

## What it does

| Function   | Purpose                                                                  |
|------------|--------------------------------------------------------------------------|
| `pay()`    | Send USDC from the agent's auto-provisioned wallet to any Base address  |
| `balance()`| Check the agent's USDC + ETH balance                                     |
| `history()`| List the agent's recent transactions (from on-chain logs)                |

## What it does NOT do (yet)

- KYC / identity verification — use [Grip Pay](https://grip.lat) for sovereign-anchored identity (RENAPER, TSE, etc)
- Fiat on/off-ramp — USDC only
- Multi-sig / spending-policy enforcement — use [wad](https://grip.lat/wad.html) SDK
- Yield-bearing idle balances — coming in v0.2 with opt-in USDe/sUSDS
- Agent-to-agent escrow with challenge — use `wad` SDK

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenClaw agent                                                 │
│  ───────────────                                                │
│    calls:  pay({ to, amount })                                  │
│    wallet: auto-provisioned EOA, private key encrypted locally  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ signs USDC transfer
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Base L2 · USDC native (Circle-issued, Coinbase ecosystem)      │
│  ─────────                                                       │
│    tx #1:  agent → recipient     (amount)                       │
│    tx #2:  agent → PayClaw fee   (amount × 1%)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Install

```bash
# In your OpenClaw workspace
openclaw plugin add @grip-labs/payclaw

# Or via npm for standalone use
npm install @grip-labs/payclaw

# Python — LangChain / LangGraph
pip install langchain-payclaw

# Python — CrewAI
pip install crewai-payclaw

# Python — Microsoft AutoGen (0.4+)
pip install autogen-payclaw

# Python — LlamaIndex (0.12+)
pip install llama-index-tools-payclaw

# TypeScript — Vercel AI SDK (v5 / v6)
npm i @grip-labs/payclaw-ai
```

Official integration packages live under [`python/`](./python) (LangChain,
CrewAI, AutoGen, LlamaIndex) and [`payclaw-ai/`](./payclaw-ai) (Vercel AI SDK).

## Configure

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "payclaw": {
        "enabled": true,
        "config": {
          "rpcUrl": "https://mainnet.base.org"
        }
      }
    }
  }
}
```

Or set environment variables: `PAYCLAW_RPC_URL`, `PAYCLAW_USDC_ADDRESS`, `PAYCLAW_FEE_BPS`, etc.

## First-run flow

1. Agent calls `pay({ to, amount })` for the first time
2. Skill generates a fresh secp256k1 EOA for that agent
3. Encrypted keystore is persisted on disk (path configurable via `walletStore`; defaults to an OpenClaw-managed location under the agent's private directory, chmod 600)
4. First call throws `WALLET_NEEDS_FUNDING` with the new address
5. Fund the agent's address with USDC — that's it. Gas is paid in USDC via Circle Paymaster, no ETH required.
6. All subsequent `pay()` calls settle in ~2 seconds on Base

## Cost

**1.00% flat take rate on the transferred USDC amount.** Zero subscription, zero monthly minimum, zero fixed per-tx fee. The fee is *additional* — the recipient gets the full amount, the agent's wallet is debited `amount × 1.01`.

Gas: paid in USDC by the agent's smart account via Circle Paymaster (~$0.001/payment surcharge). The agent never holds or needs ETH.

## Security notes

### What we protect against

- **Agent private keys** generated locally, encrypted at rest, persisted with restrictive filesystem permissions, never transmitted off-host
- **Recipient validation** — malformed addresses rejected before any RPC call
- **Optional whitelist** — agents can be locked to a pre-approved set of payees (mitigates prompt-injection attacks that try to redirect a payment)
- **Daily spending cap** — per-agent per-UTC-day limit (default $100), bounding worst-case loss if a keystore is ever compromised
- **Fee-recipient EOA check** — the skill verifies the configured `feeRecipient` is an EOA (not a contract) at runtime and refuses to proceed if it isn't. Defends against reentrancy + config-injection attacks.
- **Dust guard** — payments below 0.01 USDC rejected to prevent griefing / state bloat
- **All settlement on Base (public chain)** — every transaction is verifiable on BaseScan
- **No custody** — PayClaw operators never hold agent funds. If we're hacked, the blast radius is *the treasury wallet only*, not user funds. Compare with centralized payment processors where a single breach drains every customer.
- **No chargebacks / disputes / reversals** — on-chain finality

### Defense in depth

PayClaw layers protections across the SDK, the hosted deployer endpoint, and the on-chain settlement path:

- **SDK layer** — encrypted local keystore, daily spending cap, optional recipient whitelist, EOA-only fee recipient validation, dust-payment rejection, recipient-address validation
- **Hosted deployer endpoint** — kill switch, body shape + timestamp freshness validation, ECDSA signature verification (caller proves EOA ownership), idempotency on already-deployed accounts, USDC-funded-wallet bypass for legitimate customers, persistent rate limiting on empty-wallet creation, factory simulation pre-flight (refuses to spend gas unless the factory deploys at the claimed address)
- **On-chain layer** — atomic ERC-4337 v0.7 UserOps via Pimlico bundler, Circle Paymaster v0.7 for USDC-denominated gas, Kernel v0.3.1 smart accounts with ERC-1271 signature verification, Base mainnet finality (~2s)
- **Distribution layer** — npm provenance attestation on every published version, GitHub OIDC signing, public release pipeline auditable in `.github/workflows/`

For production flows that need KYC, sovereign identity anchors, or compliance reporting, pair PayClaw with [Grip Pay](https://grip.lat) — the regulated layer of the Grip stack.

## Roadmap

- **v0.1** (shipped): USDC on Base, flat 1%, local keystore, daily cap, whitelist opt-in, EOA-only fee recipient
- **v0.2** (shipped, current): True gasless via Circle Paymaster + Kernel smart accounts (ERC-4337 v0.7) — agents never need ETH. Hosted deployer endpoint with multi-layer defenses (sig verification, factory simulation, USDC-funded bypass, anti-spam rate limit).
- **v0.3** (planned): Cross-chain via CCTP (Arbitrum, Optimism, Polygon), hardware-wallet support (Ledger/HSM), USDe/sUSDS opt-in yield
- **v0.4**: Integration with [Grip identity layer](https://grip.lat) for sovereign-anchored KYC

## Publishing discipline

This package publishes only from the `onsari/payclaw-skill` GitHub repo via the release workflow in `.github/workflows/publish.yml`, using npm provenance attestation. Verification:

```bash
npm view @grip-labs/payclaw --json | jq .signatures
```

If the published version does not have a provenance signature from the GitHub Actions OIDC issuer pointing at this exact repo, **do not install it** — it wasn't us.

## Context

PayClaw is built by [Grip Labs](https://grip.lat) — the agent-payments primitive that pairs with the broader Grip stack:

- **wad** — developer SDK for any EVM-native agent runtime
- **Grip Pay** — consumer wallet with KYC + sovereign identity
- **Grip** — the open MIT protocol underneath

See [grip.lat](https://grip.lat) (passphrase-gated preview).

## License

MIT. Do what you want.

---

*Built for the ["ChatGPT Moment for Autonomous Agents"](https://www.youtube.com/watch?v=nvidia-openclaw-gtc-2026). Jensen Huang announced [OpenClaw + NemoClaw](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-NemoClaw-for-the-OpenClaw-Community/default.aspx) at GTC 2026. PayClaw is the payments primitive on that stack.*
