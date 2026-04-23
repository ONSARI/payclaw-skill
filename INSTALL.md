# Installing PayClaw — Step by Step

This guide walks you through installing PayClaw on your computer so an AI
assistant (Claude or Codex) can move USDC for you on the Base blockchain.

**You don't need to be a developer.** If you can copy-paste, follow a Mac
menu, and download a `.pkg` file, you have everything you need.

> **What is PayClaw?** It gives an AI assistant its own crypto wallet on Base
> (USDC stablecoin). You ask the assistant in plain English to send money,
> check its balance, or list past payments — and it does it. The assistant
> never touches your bank, never asks for your card. It only spends from a
> wallet you fund. 1% fee per transfer. No subscription, no monthly minimum.

---

## Table of contents

1. [Before you start (5 minutes, do this once)](#1-before-you-start)
2. [Install on Claude Desktop](#2-install-on-claude-desktop)
3. [Install on Codex Desktop](#3-install-on-codex-desktop)
4. [Test that it works](#4-test-that-it-works)
5. [Add money to your wallet (fund it)](#5-add-money-to-your-wallet)
6. [Make your first payment](#6-make-your-first-payment)
7. [Things that can go wrong](#7-things-that-can-go-wrong)

---

## 1. Before you start

**You need to install one piece of software first**: Node.js. It's free,
made by the same foundation that runs JavaScript on the web, and trusted
by every dev tool in the world. Without it, no AI client can run PayClaw.

### Install Node.js

1. Open this link in any browser: <https://nodejs.org/en/download>
2. Click on **macOS Installer** (the `.pkg` file). On Windows, click
   **Windows Installer** (`.msi`).
3. Open the downloaded file. Click **Continue → Continue → Install**. It
   will ask for your computer's password (the one you use to log in).
4. When it finishes, **close the installer**.

### Verify Node is installed (1 line)

1. On Mac, open the **Terminal** app (press `Cmd + Space`, type "terminal",
   press Enter). On Windows, open **PowerShell** (Start menu → type
   "PowerShell", press Enter).
2. Type this and press Enter:

   ```
   which npx
   ```

3. You should see something like `/usr/local/bin/npx`. **Copy this whole
   path** — you'll need it in 2 minutes.

   - On Apple Silicon Macs you may see `/opt/homebrew/bin/npx` instead.
     That's also fine; copy whatever you see.
   - If you see "npx not found", Node didn't install correctly. Restart
     your computer and run `which npx` again. If still nothing, redo
     step 2.

You're done with the one-time setup. Pick the AI client you use:

- I use **Claude Desktop** → [go to step 2](#2-install-on-claude-desktop)
- I use **Claude Code (CLI)** → [go to step 2b](#2b-install-on-claude-code-cli)
- I use **Codex Desktop** → [go to step 3](#3-install-on-codex-desktop)
- I use **OpenClaw** (Bia's runtime) → [go to step 3b](#3b-install-on-openclaw)

---

## 2. Install on Claude Desktop

Claude Desktop reads its plugin list from a small text file. We add PayClaw
to that file once, restart the app, and we're done.

### Open the config file

1. Open the **Terminal** again.
2. Type this command exactly (one line) and press Enter. It creates the
   file if it doesn't exist and opens it in TextEdit:

   ```
   mkdir -p "$HOME/Library/Application Support/Claude" && touch "$HOME/Library/Application Support/Claude/claude_desktop_config.json" && open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
   ```

### Add PayClaw to the file

The TextEdit window now shows the config file. It might be empty, or it
might already contain settings (don't delete those!). Two cases:

**Case A — the file is completely empty**: paste this and save (`Cmd+S`):

```json
{
  "mcpServers": {
    "payclaw": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@grip-labs/payclaw-mcp"],
      "env": {
        "PAYCLAW_AGENT_ID": "claude-desktop"
      }
    }
  }
}
```

If `which npx` showed a different path (like `/opt/homebrew/bin/npx`),
replace `/usr/local/bin/npx` above with what you saw.

**Case B — the file already has stuff in it**: do NOT delete the existing
content. You need to merge. The simplest way: select everything in the
file (`Cmd+A`), copy it somewhere safe (a Notes window), then paste this
template and rebuild:

```json
{
  "preferences": { ...keep your old preferences here... },
  "mcpServers": {
    "payclaw": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "@grip-labs/payclaw-mcp"],
      "env": {
        "PAYCLAW_AGENT_ID": "claude-desktop"
      }
    }
  }
}
```

Then save (`Cmd+S`).

### Restart Claude Desktop

This step is critical. Don't skip.

1. In Claude Desktop, go to the menu bar (top of the screen) → **Claude →
   Quit Claude**. Or press `Cmd+Q`.
2. **Important**: closing the window with the red ✕ does NOT actually
   quit the app. Use Cmd+Q.
3. Reopen Claude Desktop from the Dock or Applications folder.
4. Click **New chat** (don't continue an old one — old chats don't see
   the new tools).

[Skip to step 4 to test it](#4-test-that-it-works).

---

## 2b. Install on Claude Code (CLI)

[Claude Code](https://docs.claude.com/en/docs/claude-code) is Anthropic's
command-line agent. One command installs PayClaw permanently across all
your sessions.

1. Open the **Terminal**.
2. Run:

   ```
   claude mcp add -s user payclaw -e PAYCLAW_AGENT_ID=claude-code-default -- /opt/homebrew/bin/npx -y @grip-labs/payclaw-mcp
   ```

   On Intel Macs, replace `/opt/homebrew/bin/npx` with `/usr/local/bin/npx`
   (use whatever `which npx` returned in [step 1](#1-before-you-start)).

3. Verify:

   ```
   claude mcp list | grep payclaw
   ```

   You should see `payclaw: ... - ✓ Connected`.

The `-s user` flag scopes the install **globally** — every Claude Code
session you start (in any directory, after any restart) will have PayClaw
loaded automatically. No per-project config needed.

[Skip to step 4 to test it](#4-test-that-it-works).

---

## 3. Install on Codex Desktop

Codex Desktop has a built-in panel for adding plugins (called "MCP
servers"). No file editing needed.

1. Open Codex Desktop.
2. Click the **gear icon** at the top right corner.
3. In the left sidebar of Settings, click **MCP servers** (or "Servidores
   MCP" in Spanish).
4. Click **+ Add server** (top right of the panel).
5. Fill the form like this:

   | Field | Value |
   |---|---|
   | **Name** | `payclaw` |
   | **Type** | STDIO (this is the default; don't change) |
   | **Command to launch** | `/usr/local/bin/npx` (or whatever `which npx` showed you) |
   | **Arguments** | Click "+ Add argument" twice. First: `-y`. Second: `@grip-labs/payclaw-mcp` |
   | **Environment variables** | Click "+ Add environment variable". Key: `PAYCLAW_AGENT_ID`, Value: `codex-desktop` |
   | **Environment variable passthrough** | leave empty |
   | **Working directory** | `~/code` (Codex requires this; if it doesn't exist, run `mkdir -p ~/code` in Terminal first) |

6. Click **Save**.
7. **Quit Codex completely** (Cmd+Q, not the red ✕). Reopen.
8. Click **New chat**. Old chats don't see the new tool.

[Skip to step 4 to test it](#4-test-that-it-works).

---

## 3b. Install on OpenClaw

If you run an OpenClaw agent (the runtime that powers Bia and similar
custom agents), PayClaw installs as a first-class plugin. No config file
to edit by hand.

1. Open the **Terminal**.
2. Install the plugin:

   ```
   openclaw plugins install @grip-labs/payclaw-openclaw
   ```

3. Restart the OpenClaw gateway so it picks up the new plugin:

   ```
   launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
   ```

4. Verify it loaded:

   ```
   openclaw plugins inspect payclaw
   ```

   You should see `Status: loaded` and three tools registered:
   `payclaw_pay`, `payclaw_balance`, `payclaw_history`.

5. (Optional) Set per-agent limits in `~/.openclaw/openclaw.json`:

   ```json
   {
     "plugins": {
       "entries": {
         "payclaw": {
           "enabled": true,
           "config": {
             "dailyCapUsdc": 100,
             "recipientWhitelist": ["0xAddressYouAlwaysPay"]
           }
         }
       }
     }
   }
   ```

   All fields are optional — defaults apply if you skip this step.

[Skip to step 4 to test it](#4-test-that-it-works).

---

## 4. Test that it works

In a brand-new chat with your AI assistant, type:

```
What's my PayClaw wallet address?
```

**The first time**, it will take ~30 seconds (the assistant downloads the
PayClaw plugin in the background). You should see something like:

```
Wallet: 0x123abc…
USDC: 0.0
Chain: base-mainnet
```

That `0x...` is **your AI's personal wallet address**. It was created the
moment you asked. Nobody else has its private key — it lives encrypted on
your computer under `~/.openclaw/agents/`.

If you see the address, you're done. Move to step 5.

If the assistant says **"I don't have a payclaw_balance tool"** or
something similar, see [things that can go wrong](#7-things-that-can-go-wrong).

---

## 5. Add money to your wallet

Your AI's wallet starts at $0. To use it, you need to send USDC to it.

### Where to get USDC

Any of these work:

- **Coinbase / Binance / Kraken**: log in, go to "Withdraw" or "Send",
  pick **USDC**, pick the **Base network** (very important — not Ethereum,
  not Polygon, **Base**), paste the wallet address from step 4, send.
- **MetaMask / Rabby / any web3 wallet** on the Base network: open it,
  click Send, USDC, paste the address.
- **A friend who already has USDC on Base**: ask them to send some.

You can start with as little as **$0.50** to test. The wallet works the
same with $0.50 or $5,000.

### Wait for confirmation

Sending takes 5-30 seconds on Base. Once it lands, ask your assistant
again "What's my balance?" and you'll see the USDC amount.

---

## 6. Make your first payment

Once your wallet has USDC, ask your assistant in plain English:

```
Send 0.10 USDC to 0xRecipientAddress
```

Replace `0xRecipientAddress` with whoever you want to pay (a friend's
address, an exchange deposit, anything starting with `0x`).

The assistant will:
1. Confirm the action with you.
2. Execute the payment (~5 seconds).
3. Show you a receipt with a Basescan link to the actual on-chain transaction.

**Behind the scenes**, the first payment also creates the smart account
contract on the blockchain. This is one-time and is paid for by us
(PayClaw) — you don't need any ETH. From the second payment onward, gas
is paid in USDC at ~$0.001 per transaction.

**Fees:** PayClaw takes 1% per payment. Sending 0.10 USDC charges 0.10
to the recipient and 0.001 USDC fee from your wallet. No fixed fee, no
monthly subscription, no minimum.

---

## 7. Things that can go wrong

### "I don't have a payclaw_balance tool" / "tool not found"

The plugin didn't load. Almost always one of:

1. **You didn't fully quit the app.** Closing the window isn't enough on
   Mac. Use **Cmd+Q** explicitly, then reopen.

2. **You're in an old chat.** The tool list is loaded once per chat at
   chat-creation time. Click **New chat**.

3. **Wrong client.** PayClaw works on **Claude Desktop**, **Codex Desktop**,
   **Cursor**, **Cline**, and **Zed** — anything that supports the MCP
   protocol. It does **NOT** work in:
   - **ChatGPT** (the web app or the regular ChatGPT desktop) — uses a
     different system called "Connectors"
   - **Gemini** — different system
   - **Browser-based agents** that run on someone else's server

4. **The `npx` path in your config is wrong.** Run `which npx` again,
   make sure the path you see is exactly what's in your config (Claude
   Desktop) or Codex form. Apple Silicon Macs commonly use
   `/opt/homebrew/bin/npx` instead of `/usr/local/bin/npx`.

### "Could not attach to MCP server payclaw"

Almost always: **the path to `npx` is wrong** (see point 4 above), or
**Node isn't installed** (run `which npx` — if it returns nothing, redo
[step 1](#1-before-you-start)).

### "Daily limit exceeded (21 empty wallets per IP)"

Your network (your house, your office, your phone hotspot) tried to
create more than 21 brand-new empty PayClaw wallets in the last 24
hours. This protects against spam.

**Workaround**: if you fund your wallet with even $0.01 of USDC first
(see step 5), the limit doesn't apply to you anymore — funded wallets
are real users and bypass the cap.

### Codex says "Your access token could not be refreshed"

This is a Codex login error, not PayClaw. It usually happens when the
same Codex account is logged in on two computers — they invalidate each
other's session. **Log out and log back in** in Codex.

### The first payment took 1-2 minutes instead of 5 seconds

This is the on-chain wallet creation step. It happens **once** the first
time you pay from a new wallet. From the second payment onward, every
payment takes 3-7 seconds.

### My wallet shows USDC but the payment fails with "transfer exceeds allowance"

Update to the latest version. Quit your AI client completely, reopen, and
the next launch will pull the fix automatically (we publish updates via
npm; clients refetch on restart).

If it persists, [open an issue](https://github.com/ONSARI/payclaw-skill/issues)
with the error message — we'll respond.

---

## What's next

You now have an AI assistant with its own wallet that can move USDC on Base
mainnet. Some ideas:

- Have it pay for an API call ("send 0.05 USDC to 0xMyAPIService")
- Use it to settle informal IOUs with friends (pay back $5 by saying
  "send 5 USDC to Anna's wallet")
- Let an automation pay you per task delivered (your agent receives, you
  withdraw)
- Build a service that gets paid by other agents

PayClaw is the rail. What runs on top is up to you.

---

## Get help

- Open an issue: <https://github.com/ONSARI/payclaw-skill/issues>
- Read the technical README: [`mcp/README.md`](mcp/README.md)
- See the live deployer status: <https://www.payclaw.me>
