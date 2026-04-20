---
name: balance
description: Check the current USDC balance of the agent's PayClaw wallet on Base. No transaction, pure read.
---

# PayClaw · balance

Check how much USDC (and ETH for gas) the agent currently holds.

## Usage

```js
import { balance } from 'payclaw'

const b = await balance()
console.log(b)
// {
//   address: '0xAgentWallet...',
//   usdc:    '42.50',          // human-readable decimal
//   usdcRaw: '42500000',       // 6-decimal raw units
//   eth:     '0.0008',         // for gas (null if paymaster configured)
//   chain:   'base-mainnet',
//   explorer: 'https://basescan.org/address/0xAgentWallet...'
// }
```

## Notes

- Returns `{ usdc: '0.00', eth: '0.00' }` if the wallet hasn't been provisioned yet (first `pay()` call creates it)
- No network fee for this call — it's a pure RPC read
- Useful right before a `pay()` to avoid `WALLET_NEEDS_FUNDING` errors
