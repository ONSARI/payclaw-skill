# @grip-labs/payclaw-mcp

PayClaw as an MCP server. Adds `pay`, `balance`, and `history` tools to any
MCP-compatible client — Claude Desktop, Cursor, Cline, Zed — so an agent can
move USDC on Base mainnet without you wiring up an SDK.

Wraps [`@grip-labs/payclaw`](https://www.npmjs.com/package/@grip-labs/payclaw).
Same wallet, same 1% take rate, same on-chain settlement, now invocable from
your AI client over stdio.

## Prerequisites

You need **Node.js 18+** installed (the MCP server runs on Node and is fetched
on demand via `npx`). On a fresh Mac that's the only system dependency:

- macOS: download the LTS installer from [nodejs.org/en/download](https://nodejs.org/en/download)
  and double-click the `.pkg`. Verify with `which npx` in Terminal — you should
  see `/usr/local/bin/npx`.
- Windows: same download page, run the `.msi`.
- Linux: use your distro's `nodejs` package or [nvm](https://github.com/nvm-sh/nvm).

No install required for the MCP package itself — your client launches it via
`npx` from the config below. (For a global install: `npm install -g @grip-labs/payclaw-mcp`.)

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "payclaw": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@grip-labs/payclaw-mcp"],
      "env": {
        "PAYCLAW_AGENT_ID": "claude-desktop-default"
      }
    }
  }
}
```

Then:

1. **Quit Claude Desktop completely** — menu bar → Claude → Quit Claude (or
   Cmd+Q). Closing the window with the red ✕ does **not** unload the old
   config; you have to fully quit.
2. Reopen Claude Desktop.
3. Open a **new chat** (don't continue a previous one — the tools list is
   cached per chat).
4. Ask: "What tools do you have available?" — you should see `payclaw_pay`,
   `payclaw_balance`, `payclaw_history`.

The first invocation downloads the package via `npx` and takes ~30 seconds.
Subsequent calls are instant.

> **Why `/usr/local/bin/npx` and not just `npx`?** Claude Desktop on macOS
> launches with a minimal `PATH` that does not include the user's npm bin
> directory, so the bare command `npx` resolves to nothing and the server
> fails to start with `Could not attach to MCP server`. Using the absolute
> path bypasses the issue. If `which npx` shows a different path on your
> machine (e.g. `/opt/homebrew/bin/npx` on Apple Silicon, or an `nvm`
> path), use that instead.

## Add to Codex Desktop

Codex Desktop has a built-in UI for MCP servers — easier than editing config files.

1. Open Codex Desktop → click the gear icon (top right) → **Settings**.
2. In the left sidebar, click **MCP servers** (or "Servidores MCP" in Spanish).
3. Click **+ Add server** (top right of the panel).
4. Fill the form:
   - **Name:** `payclaw`
   - Tab: **STDIO** (default)
   - **Command to launch:** `/usr/local/bin/npx` (or whatever `which npx` returns)
   - **Arguments:** click "+ Add argument" twice
     - first: `-y`
     - second: `@grip-labs/payclaw-mcp`
   - **Environment variables:** click "+ Add environment variable"
     - Key: `PAYCLAW_AGENT_ID`
     - Value: pick anything unique to this client, e.g. `codex-default`
   - **Working directory:** leave default (~/code)
5. **Save** → quit Codex Desktop completely (Cmd+Q) → reopen.
6. In a new chat, ask: "Use the payclaw_balance tool to show my agent wallet."

Alternatively, edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.payclaw]
command = "/usr/local/bin/npx"
args = ["-y", "@grip-labs/payclaw-mcp"]

[mcp_servers.payclaw.env]
PAYCLAW_AGENT_ID = "codex-default"
```

## Add to Cursor (IDE + CLI)

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "payclaw": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@grip-labs/payclaw-mcp"],
      "env": { "PAYCLAW_AGENT_ID": "cursor-default" }
    }
  }
}
```

The same file is read by both **Cursor IDE** and **Cursor CLI**
(`cursor-agent`) — one config covers both.

## Add to Cline (VS Code)

In Cline settings → MCP Servers → Edit MCP Settings:

```json
{
  "mcpServers": {
    "payclaw": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@grip-labs/payclaw-mcp"],
      "env": { "PAYCLAW_AGENT_ID": "cline-default" }
    }
  }
}
```

## Add to Zed

Zed reads MCP servers from your settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "payclaw": {
      "command": {
        "path": "/usr/local/bin/npx",
        "args": ["-y", "@grip-labs/payclaw-mcp"],
        "env": { "PAYCLAW_AGENT_ID": "zed-default" }
      }
    }
  }
}
```

## First-run flow

1. Ask your agent: "What's my PayClaw wallet address?" → invokes `payclaw_balance`,
   auto-provisions a fresh wallet under `~/.openclaw/agents/{agentId}/`, returns
   the 0x address.
2. Send USDC on Base mainnet to that address from any wallet or exchange.
3. Ask the agent to pay someone: "Send 0.50 USDC to 0xabcd...". The agent calls
   `payclaw_pay`, you get a tx hash and a Basescan URL.

## Configuration

All env vars are optional. Sensible defaults are set for solo dev use.

| Env var | Default | What it does |
|---|---|---|
| `PAYCLAW_AGENT_ID` | required (or pass `agentId` per call) | Identifies which wallet to use. Each id gets its own wallet. |
| `PAYCLAW_RPC_URL` | `https://mainnet.base.org` | Base RPC URL. Override for Sepolia testnet. |
| `PAYCLAW_DAILY_CAP_USDC` | `100` | Per-agent per-UTC-day spending cap in USDC. Set to `0` to disable (not recommended). |
| `PAYCLAW_WHITELIST` | (none) | Comma-separated list of allowed recipient addresses. Hardens against prompt-injection redirects. |
| `PAYCLAW_FEE_RECIPIENT` | PayClaw treasury EOA | Where the 1% take rate goes. Override for forks. |
| `PAYCLAW_FEE_BPS` | `100` (1.00%) | Take rate in basis points. |
| `PAYCLAW_AGENT_PASSPHRASE` | derived per-machine | Override the keystore encryption passphrase. |

## Troubleshooting

### "npx not found" in your terminal

Node isn't installed. Get it from [nodejs.org/en/download](https://nodejs.org/en/download)
(LTS installer). After install, **close and reopen Terminal** so the new `PATH`
takes effect, then re-run `which npx` to confirm.

### "Could not attach to MCP server payclaw" (Claude Desktop)

The `npx` command in your config can't be resolved. Almost always because the
client launched without your shell's `PATH`. Fix:

```bash
which npx
```

Use the absolute path it returns (e.g. `/usr/local/bin/npx` on Intel Macs,
`/opt/homebrew/bin/npx` on Apple Silicon, `/Users/you/.nvm/versions/node/...`
under nvm) as the `command` in your client config. Save, fully quit the client
(Cmd+Q on macOS — not just close the window), and reopen.

### Agent doesn't see `payclaw_*` tools after restart

- Open a **new chat**, not a previous one. Most clients cache the tool list per
  conversation.
- If asking "what tools do you have?" doesn't list PayClaw, try invoking it
  directly: "use the payclaw_balance tool to show my agent wallet". Some
  clients only summarize tool *categories* in the high-level enumeration but
  will happily call the tool when asked.
- In Codex Desktop, check Settings → MCP servers → confirm the toggle for
  `payclaw` is on (blue).

### First call hangs for ~30 seconds

Normal — `npx -y @grip-labs/payclaw-mcp` downloads the package on first launch.
Subsequent calls reuse the cached install.

### Agent says "wallet has no funds"

The auto-provisioned wallet starts at $0 USDC. Send USDC on Base mainnet to
the address `payclaw_balance` returns from any wallet/exchange that supports
Base (Coinbase, Binance, MetaMask, Rabby, etc.). No ETH is required — gas is
paid in USDC via Circle Paymaster.

### "Hosted deploy failed" on first `pay()`

The hosted deploy endpoint at `payclaw.me/api/deploy` is rate-limited to 1 call
per 5 minutes per IP and 5 per day per IP. If you're sharing an IP with other
PayClaw users (NAT / VPN / corporate network) you may hit the limit. Either
wait, switch network, or self-host: set `PAYCLAW_DEPLOYER_PRIVATE_KEY` to a
funded EOA private key in the env block to deploy from your own deployer.

## Security notes

- Wallets are stored encrypted on disk under `~/.openclaw/agents/{agentId}/payclaw-wallet.json`
  with `chmod 600`. They never leave the device.
- The default daily cap is a trip-wire against keystore compromise — an attacker
  with your keystore cannot drain the wallet in a single day.
- `payclaw_pay` rejects sending to a contract feeRecipient (defense against
  config-injection that points the take rate at a malicious contract).
- For agents you don't fully trust, set `PAYCLAW_WHITELIST` to a small set of
  approved recipient addresses.

## License

MIT — see [the main repo](https://github.com/ONSARI/payclaw-skill).
