# @grip-labs/payclaw-ai

> **Give your Vercel AI SDK agent a USDC wallet on Base it can actually spend.**
> Gasless via Circle Paymaster. No ETH required. 1% flat fee. No KYC.

`@grip-labs/payclaw-ai` ships three production-grade tools for the
[Vercel AI SDK](https://ai-sdk.dev) (v5 and v6) that let any agent — in a
Next.js Server Action, API route, edge function, or plain Node script — read
its USDC balance, send USDC to any address on Base mainnet, and inspect
on-chain transaction history.

Zero runtime dependencies beyond `ai` and `zod` (both peer deps). Uses the
runtime's native `fetch`, so it works in **Node ≥18, Edge runtime, Bun, Deno,
Cloudflare Workers**, and anywhere `fetch` exists.

---

## Install

```bash
pnpm add @grip-labs/payclaw-ai ai zod
# or
npm i @grip-labs/payclaw-ai ai zod
```

## Auth

Set your PayClaw API token in the environment:

```bash
export PAYCLAW_API_TOKEN="..."
```

Or pass it explicitly to a tool factory: `payclawBalanceTool({ apiToken: "..." })`.

> Need a token? Each PayClaw wallet ships with its own Bearer token.
> The current public POC uses a single shared demo token — production replaces
> this with per-user OAuth. See [payclaw.me](https://payclaw.me).

---

## Quickstart — three lines into `generateText`

```ts
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createPayClawTools } from '@grip-labs/payclaw-ai'

const payclaw = createPayClawTools()

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  system: 'You are a payments agent on Base mainnet. Always include the Basescan URL in the answer.',
  prompt: "What's my USDC balance?",
  tools: { ...payclaw },
})

console.log(text)
// → "Your USDC balance is 2.01 USDC at 0x5678…8740. View it here: https://basescan.org/address/0x5678…8740"
```

### Streaming (server-sent events)

Works with `streamText` exactly the same way:

```ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createPayClawTools } from '@grip-labs/payclaw-ai'

const payclaw = createPayClawTools()

const result = streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Send 0.05 USDC to 0x000000000000000000000000000000000000dEaD and show me the tx hash.',
  tools: { ...payclaw },
  stopWhen: stepCountIs(3),
})

for await (const chunk of result.textStream) process.stdout.write(chunk)
```

### Next.js App Router — chat route handler

```ts
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, streamText, stepCountIs } from 'ai'
import { createPayClawTools } from '@grip-labs/payclaw-ai'

export const runtime = 'edge'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const payclaw = createPayClawTools()

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: 'You manage a USDC wallet on Base. Always confirm before paying.',
    messages: convertToModelMessages(messages),
    tools: { ...payclaw },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
```

### Individual tool factories

Use the named factories if you want a custom subset, custom keys, or
per-tool config:

```ts
import { tool } from 'ai'
import {
  payclawBalanceTool,
  payclawPayTool,
  payclawHistoryTool,
} from '@grip-labs/payclaw-ai'

const tools = {
  myBalance: payclawBalanceTool({ apiToken: process.env.MY_TOKEN }),
  sendUsdc: payclawPayTool({ apiToken: process.env.MY_TOKEN }),
  // omit history for read-only-write agent
}
```

### Direct client (no AI SDK)

`PayClawClient` is exported for hooks, observability, or unit tests:

```ts
import { PayClawClient } from '@grip-labs/payclaw-ai'

const client = new PayClawClient() // reads PAYCLAW_API_TOKEN
console.log(await client.getBalance())
const receipt = await client.pay({ to: '0x…', amount: '0.05' })
console.log(receipt.txHash)
```

---

## The tools

### `payclawBalanceTool()`

Read-only. Returns `PayClawBalance`:

```json
{
  "address": "0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740",
  "signerAddress": "0x7371d193516BAb191fE99d7149Ed47f8bCBd42f7",
  "usdc": "2.01",
  "usdcRaw": "2010000",
  "chain": "base-mainnet",
  "explorer": "https://basescan.org/address/0x567849..."
}
```

### `payclawPayTool()`

Sends USDC. Required input: `{ to: string, amount: string }`. Returns `PayClawReceipt`:

```json
{
  "txHash": "0xa36a...4528",
  "status": "confirmed",
  "amountSent": "0.05",
  "feeCharged": "0.0005",
  "gasPaidInUsdc": "0.0123",
  "smartAccountAddress": "0x567849...",
  "explorer": "https://basescan.org/tx/0xa36a...4528"
}
```

The first send from a new wallet auto-deploys the smart account on-chain
(adds ~20-30 s to the first call). All gas is paid in USDC via
[Circle Paymaster](https://developers.circle.com/stablecoins/paymaster-overview).
**No ETH is ever required.**

### `payclawHistoryTool()`

Read-only. Optional input: `{ limit?: number }` (1-50, default 10). Returns
`PayClawHistory` (the last ~28 hours of in/out transfers).

---

## Why PayClaw

Every existing way to give an agent a wallet has the same defect: it needs
ETH for gas. So you end up running an ETH-funding cron, or you bail and use
a custodial API and lose the whole point of agent-owned funds.

PayClaw uses ERC-4337 v0.7 + Circle Paymaster: the agent's smart account
spends USDC and the paymaster pays the bundler in USDC on its behalf. Your
agent only ever holds and spends one asset.

| | Agent wallet (vanilla) | Custodial API | **PayClaw** |
|---|---|---|---|
| Holds its own funds | ✅ | ❌ | ✅ |
| Needs ETH for gas | ❌ | n/a | ✅ |
| KYC required | ❌ | ✅ | ❌ |
| 1 line to integrate | ❌ | ❌ | ✅ |

---

## Errors

Tool `execute` functions catch `PayClawError` and return a string the LLM can
reason about — input-validation errors are caught by Zod before `execute`
runs and are surfaced to the model as standard AI SDK validation errors.
HTTP status codes:

- `400` — bad input (invalid address, amount below dust threshold)
- `401` — invalid bearer token
- `429` — rate-limited (only on first deploy from an empty wallet — fund the
  wallet to bypass)
- `502` — paymaster or RPC failure

If you want to handle errors yourself, drop down to `PayClawClient` and
catch `PayClawError` directly.

---

## Compatibility

- Node ≥ 18 (native `fetch`), Edge runtime, Bun, Deno, Cloudflare Workers
- `ai >= 5.0` or `ai >= 6.0` (peer)
- `zod >= 3.23` or `zod >= 4.0` (peer)
- TypeScript types shipped (full `.d.ts`)

## License

MIT — see [LICENSE](../LICENSE).

## Links

- Website: <https://payclaw.me>
- LangChain version: [`langchain-payclaw`](https://pypi.org/project/langchain-payclaw/) (Python)
- CrewAI version: [`crewai-payclaw`](https://pypi.org/project/crewai-payclaw/) (Python)
- AutoGen version: [`autogen-payclaw`](https://pypi.org/project/autogen-payclaw/) (Python)
- SDK + MCP: <https://github.com/ONSARI/payclaw-skill>
- Issues: <https://github.com/ONSARI/payclaw-skill/issues>
