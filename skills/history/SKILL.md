---
name: history
description: List the agent's recent PayClaw transactions (sends + fees) on Base. Returns last N txs with timestamps, amounts, counterparties, and explorer links.
---

# PayClaw · history

See what the agent has been spending.

## Usage

```js
import { history } from 'payclaw'

const txs = await history({ limit: 10 })

txs.forEach(t => {
  console.log(`${t.timestamp}  →  ${t.to}  ${t.amount} USDC  (fee ${t.fee})`)
})
// 2026-04-20T14:33Z  →  0xMerchant...  1.50 USDC  (fee 0.015)
// 2026-04-20T14:29Z  →  0xAgentX...    0.31 USDC  (fee 0.003)
// ...
```

Returned shape:

```ts
interface PayClawTx {
  txHash:       string
  timestamp:    string   // ISO 8601
  direction:    'out' | 'in'
  counterparty: string   // 0x address
  amount:       string   // human-readable USDC
  fee:          string   // 1% we charged (only on 'out')
  memo:         string | null
  blockNumber:  number
  explorer:     string   // basescan.org link
}
```

## Options

| Option  | Type    | Default | Description                                                  |
|---------|---------|---------|--------------------------------------------------------------|
| `limit` | number  | 20      | Max number of transactions to return (1..100)                |
| `since` | ISO str | null    | Only return txs after this timestamp                         |
| `direction` | 'out' \| 'in' \| 'all' | 'all' | Filter by direction                                |

## Notes

- Source of truth: on-chain logs on Base. The skill queries the ERC-20 `Transfer` events of the USDC contract filtered by the agent's address.
- No off-chain database — this is fully derivable from chain state.
- Counterparty address may be an EOA or another contract (agents, merchants, smart wallets)
