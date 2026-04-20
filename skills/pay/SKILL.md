---
name: pay
description: Send a USDC payment from the agent's wallet to any Ethereum address on Base. Auto-provisions a per-agent EOA wallet on first use. Charges a flat 1% fee on the settled amount (paid to the PayClaw treasury). No custody of agent funds. No KYC.
---

# PayClaw · pay

Send money.

## When to use

Use this skill whenever the agent needs to send USDC to an on-chain address on Base. Typical cases:

- Paying an API provider that accepts USDC
- Settling a task with another agent (agent-to-agent)
- Paying a merchant / content paywall / subscription
- Reimbursing a refund

## Usage

```js
import { pay } from 'payclaw'

const receipt = await pay({
  to:       '0xRecipient...',     // required: 0x address on Base
  amount:   '1.50',               // required: string decimal in the asset's units (USDC = 6 decimals)
  currency: 'USDC',               // optional, default 'USDC'
  memo:     'invoice #1234'       // optional, off-chain note attached to the tx
})

console.log(receipt)
// {
//   txHash:    '0xabc...',
//   status:    'confirmed',
//   amountSent: '1.50',
//   feeCharged: '0.015',   // 1% flat
//   blockNumber: 12345678,
//   explorer:   'https://basescan.org/tx/0xabc...'
// }
```

## First-call provisioning

The first time the agent calls `pay()`, the skill:

1. Generates a fresh EOA (secp256k1 keypair) for this agent
2. Persists the encrypted private key on disk at the path configured via `walletStore` (chmod 600, agent-scoped directory)
3. Returns an error indicating the wallet needs funding, with the agent's new USDC address
4. The human (or orchestrator) funds that address with USDC + a tiny amount of ETH for gas (unless a paymaster is configured)
5. Subsequent `pay()` calls settle immediately

## Error modes

| Error code                | Meaning                                                                             | Resolution                                                               |
|---------------------------|-------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `WALLET_NEEDS_FUNDING`    | No USDC balance in the agent's wallet yet                                           | Fund the returned address with USDC                                      |
| `INSUFFICIENT_GAS`        | Wallet has USDC but no ETH for gas and no paymaster configured                      | Send ~0.0005 ETH to the wallet, or configure `paymasterUrl`              |
| `INVALID_RECIPIENT`       | `to` is not a valid 0x-prefixed address                                             | Verify the recipient string                                              |
| `AMOUNT_BELOW_DUST`       | `amount < 0.01 USDC` — rejected to avoid griefing                                   | Raise the amount                                                         |
| `RPC_ERROR`               | Base RPC not responding                                                             | Retry; if persistent, switch `rpcUrl` to an alternate Base provider      |

## Fee policy

- **1.00% flat take rate** on the `amount` (computed as `amount * 100 / 10000`)
- Fee is paid to `feeRecipient` (PayClaw treasury) *in the same transaction batch* as the recipient transfer — two USDC transfers from the agent's wallet signed with the same nonce
- Zero subscription, zero monthly minimum, zero fixed per-tx fee
- The fee is **additional** to the `amount` — the recipient receives the full `amount`; the agent's wallet is debited `amount * 1.01`
- On-chain settlement only: there are no chargebacks, disputes, or reversals. All payments are final.

## What this skill does NOT do (yet)

- KYC / identity verification (use `grip-pay` for that — coming soon with RENAPER + sovereign anchor)
- Fiat on/off-ramp (USDC only; no USD/EUR/ARS/BRL bridges in this skill)
- Multi-sig / multi-approver flows (one agent, one wallet, one signature)
- Escrow / challenge mechanisms (use `wad` SDK for advanced agent-to-agent escrow)
- Yield-bearing balances (idle USDC does not earn; expected in a future release)
