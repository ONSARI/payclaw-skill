# llama-index-tools-payclaw

> **Give your LlamaIndex `FunctionAgent` / `ReActAgent` a USDC wallet on Base it can actually spend.**
> Gasless via Circle Paymaster. No ETH required. 1% flat fee. No KYC.

`llama-index-tools-payclaw` ships three production-grade
[LlamaIndex](https://docs.llamaindex.ai) tools that let any agent read its
USDC balance, send USDC to any address on Base mainnet, and inspect on-chain
transaction history.

Async-native, follows the official `llama-index-tools-*` namespace
convention, plays cleanly with `FunctionAgent`, `ReActAgent`, `AgentWorkflow`,
and any tool-calling LlamaIndex agent.

---

## Install

```bash
pip install llama-index-tools-payclaw

# Plus an LLM provider for the quickstart below
pip install llama-index-llms-openai
```

## Auth

Set your PayClaw API token in the environment:

```bash
export PAYCLAW_API_TOKEN="..."
```

Or pass it explicitly to each tool factory:
`payclaw_balance_tool(api_token="...")`.

> Need a token? Each PayClaw wallet ships with its own Bearer token.
> The current public POC uses a single shared demo token — production replaces
> this with per-user OAuth. See [payclaw.me](https://payclaw.me).

---

## Quickstart — `FunctionAgent` with all three tools

```python
import asyncio
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI
from llama_index.tools.payclaw import PayClawToolSpec


async def main():
    spec = PayClawToolSpec()
    agent = FunctionAgent(
        tools=spec.to_tool_list(),
        llm=OpenAI(model="gpt-4o-mini"),
        system_prompt=(
            "You are a payments agent on Base mainnet. "
            "You manage a USDC wallet you can read from and spend from. "
            "Before any transfer, restate the recipient and amount. "
            "After any transfer, surface the Basescan explorer URL as proof. "
            "Never invent addresses. If unsure, ask."
        ),
    )

    result = await agent.run(
        user_msg="What's my balance? If at least 0.10 USDC, send 0.05 USDC "
        "to 0x000000000000000000000000000000000000dEaD."
    )
    print(result)


asyncio.run(main())
```

### `ReActAgent` (chain-of-thought style)

```python
from llama_index.core.agent.workflow import ReActAgent
from llama_index.llms.openai import OpenAI
from llama_index.tools.payclaw import (
    payclaw_balance_tool,
    payclaw_pay_tool,
    payclaw_history_tool,
)

agent = ReActAgent(
    tools=[payclaw_balance_tool(), payclaw_pay_tool(), payclaw_history_tool()],
    llm=OpenAI(model="gpt-4o"),
    verbose=True,
)
```

### Pick a subset of tools

If you want a read-only agent (no spending), just include `balance_tool` and
`history_tool`. If you want a write-only agent that delegates funding checks
to humans, include only `pay_tool`. Mix and match per your security posture.

```python
from llama_index.tools.payclaw import payclaw_balance_tool, payclaw_history_tool

read_only_tools = [payclaw_balance_tool(), payclaw_history_tool()]
```

### Direct client (no LlamaIndex)

`PayClawClient` is exported for hooks, observability, or unit tests:

```python
import asyncio
from llama_index.tools.payclaw import PayClawClient

async def main():
    client = PayClawClient()  # reads PAYCLAW_API_TOKEN
    print(await client.get_balance())
    receipt = await client.pay(to="0x...", amount="0.05")
    print(receipt["txHash"])

asyncio.run(main())
```

---

## The tools

### `payclaw_balance_tool() -> FunctionTool`

Wraps an async `payclaw_get_balance()` function. Read-only. Returns a JSON
string:

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

### `payclaw_pay_tool() -> FunctionTool`

Wraps an async `payclaw_pay(to, amount)`. Required args. Returns:

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

### `payclaw_history_tool() -> FunctionTool`

Wraps an async `payclaw_get_history(limit=10)`. Read-only. Returns recent
in/out USDC transfers over the last ~28 hours.

### `PayClawToolSpec`

Convenience class — call `.to_tool_list()` to get all three tools at once
sharing the same config (api_token, base_url, timeouts).

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

Tool functions catch `PayClawError` and return a string the LLM can reason
about — input-validation errors are also returned as strings prefixed with
`PayClaw input error:` so the agent can correct itself rather than crash.
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

- Python ≥ 3.9
- `llama-index-core >= 0.12, < 1.0`
- `pydantic >= 2.7`
- `httpx >= 0.27`

## License

MIT — see [LICENSE](../../LICENSE).

## Links

- Website: <https://payclaw.me>
- LangChain version: [`langchain-payclaw`](https://pypi.org/project/langchain-payclaw/)
- CrewAI version: [`crewai-payclaw`](https://pypi.org/project/crewai-payclaw/)
- AutoGen version: [`autogen-payclaw`](https://pypi.org/project/autogen-payclaw/)
- Vercel AI SDK (TypeScript): [`@grip-labs/payclaw-ai`](https://www.npmjs.com/package/@grip-labs/payclaw-ai)
- SDK + MCP: <https://github.com/ONSARI/payclaw-skill>
- Issues: <https://github.com/ONSARI/payclaw-skill/issues>
