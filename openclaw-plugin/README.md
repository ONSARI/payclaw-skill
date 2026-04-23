# @grip-labs/payclaw-openclaw

PayClaw as a native [OpenClaw](https://openclaw.ai) plugin. Gives every
OpenClaw agent its own wallet on Base mainnet, invocable via three tools:
`payclaw_pay`, `payclaw_balance`, `payclaw_history`.

Wraps [`@grip-labs/payclaw`](https://www.npmjs.com/package/@grip-labs/payclaw).
Same auto-provisioned wallet, same 1% flat take rate, same on-chain settlement,
now first-class inside the OpenClaw runtime.

## Install

```bash
openclaw plugins install @grip-labs/payclaw-openclaw
```

Then restart the gateway:

```bash
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
```

Verify it loaded:

```bash
openclaw plugins inspect payclaw
```

You should see `Status: loaded` and three tools registered.

## Configure

In `~/.openclaw/openclaw.json`, add or edit the `payclaw` entry under
`plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "payclaw": {
        "enabled": true,
        "config": {
          "dailyCapUsdc": 100,
          "recipientWhitelist": [
            "0xYourAllowedRecipient..."
          ],
          "feeRecipient": "0xba14744FfD57FA7d03b20D4c8BeDAaC301E865d1"
        }
      }
    }
  }
}
```

All fields are optional — defaults apply if omitted. Full schema:

| Field | Default | Notes |
|---|---|---|
| `rpcUrl` | `https://base.publicnode.com` | Override with Alchemy/Infura/QuickNode for production |
| `usdcAddress` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base mainnet native USDC (Circle-issued) |
| `feeRecipient` | PayClaw treasury EOA | 1% take rate destination. MUST be EOA, validated at runtime |
| `feeBps` | `100` (1.00%) | Take rate in basis points |
| `dailyCapUsdc` | `100` | Per-agent per-UTC-day spending cap. Trip-wire against keystore compromise. Set to `0` to disable (not recommended) |
| `recipientWhitelist` | (none) | Array of 0x addresses. If set non-empty, `payclaw_pay` rejects any recipient not on the list. Hardens against prompt-injection redirects |

## Per-agent wallets

Each OpenClaw agent gets its own wallet keyed by `agentId`. Wallets are
auto-provisioned on first call, encrypted with the agent's passphrase, and
persisted to `~/.openclaw/agents/{agentId}/payclaw-wallet.json` with `chmod 600`.
The keystore never leaves the device.

Agents find their address by calling `payclaw_balance` — which doubles as
"create or return my wallet".

## Tools

### `payclaw_balance`
Returns the agent wallet's USDC balance, address, and a Basescan URL. Safe to
call at any time — read-only. (v0.2 is gasless via Circle Paymaster, so the
wallet never needs ETH.)

### `payclaw_pay`
Sends USDC from the agent wallet to a 0x address on Base mainnet.

Parameters:
- `to` — recipient 0x address (required)
- `amount` — decimal string in USDC, min 0.01 (required)
- `memo` — optional off-chain memo (not stored on-chain)
- `agentId` — override agent id (defaults to `OPENCLAW_AGENT_ID` env)

Charges 1% take rate. Settles on-chain in ~2 seconds. Returns receipt with
tx hash + Basescan URL.

### `payclaw_history`
Lists the agent wallet's recent USDC Transfer events (in, out, or both) over
the last ~55 hours.

## Security

- Wallets encrypted at rest with per-agent passphrase (scrypt)
- Never sent off-device
- Default $100/UTC-day spending cap per agent
- EOA-only fee recipient (rejects sending to contracts — defense against
  config-injection / reentrancy)
- Optional recipient whitelist for prompt-injection hardening
- Dust threshold: rejects payments under 0.01 USDC

## Related

- [`@grip-labs/payclaw`](https://www.npmjs.com/package/@grip-labs/payclaw) — the
  underlying SDK (also usable standalone, non-OpenClaw)
- [`@grip-labs/payclaw-mcp`](https://www.npmjs.com/package/@grip-labs/payclaw-mcp) —
  MCP server for Claude Desktop, Cursor, Cline, OpenAI Agents SDK
- [payclaw.me](https://payclaw.me) — landing page
- [Grip Protocol](https://grip.lat) — identity + payments primitives for the
  agent layer

## License

MIT
