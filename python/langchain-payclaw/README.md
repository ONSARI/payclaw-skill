# langchain-payclaw

> **Give your LangChain / LangGraph agent a USDC wallet on Base it can actually spend.**
> Gasless via Circle Paymaster. No ETH required. 1% flat fee. No KYC.

`langchain-payclaw` ships three production-grade [LangChain](https://python.langchain.com)
tools that let your agent read its USDC balance, send USDC to any address on
Base mainnet, and inspect on-chain transaction history — all through a single
Bearer-authenticated REST API.

Designed for use inside LangGraph workflows, ReAct agents, AgentExecutor
pipelines, custom Runnables, or anywhere a `BaseTool` is accepted.

---

## Install

```bash
pip install langchain-payclaw
```

For LangGraph examples:

```bash
pip install "langchain-payclaw[langgraph]"
```

## Auth

Set your PayClaw API token in the environment:

```bash
export PAYCLAW_API_TOKEN="..."
```

Or pass it explicitly to each tool: `PayClawBalanceTool(api_token="...")`.

> Need a token? Each PayClaw wallet ships with its own Bearer token.
> The current public POC uses a single shared demo token — production replaces
> this with per-user OAuth. See [payclaw.me](https://payclaw.me).

---

## Quickstart — three tools, any LLM

```python
from langchain_payclaw import (
    PayClawBalanceTool,
    PayClawPayTool,
    PayClawHistoryTool,
)

tools = [PayClawBalanceTool(), PayClawPayTool(), PayClawHistoryTool()]
```

That's it. Bind these to any LangChain model that supports tool-calling.

### With LangGraph (`create_react_agent`)

```python
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from langchain_payclaw import (
    PayClawBalanceTool,
    PayClawPayTool,
    PayClawHistoryTool,
)

agent = create_react_agent(
    model=ChatAnthropic(model="claude-sonnet-4-5"),
    tools=[PayClawBalanceTool(), PayClawPayTool(), PayClawHistoryTool()],
)

result = agent.invoke({
    "messages": [
        ("user", "Check my balance, then send 0.05 USDC to 0x000000000000000000000000000000000000dEaD."),
    ]
})
print(result["messages"][-1].content)
```

### With a plain LangChain agent

```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from langchain_payclaw import PayClawBalanceTool, PayClawPayTool

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a payments agent. Confirm amounts before paying."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(
    llm=ChatOpenAI(model="gpt-4o-mini"),
    tools=[PayClawBalanceTool(), PayClawPayTool()],
    prompt=prompt,
)
executor = AgentExecutor(agent=agent, tools=agent.tools, verbose=True)
executor.invoke({"input": "What's my balance?"})
```

### Async

All tools support async natively:

```python
import asyncio
from langchain_payclaw import PayClawBalanceTool

async def main():
    tool = PayClawBalanceTool()
    print(await tool.ainvoke({}))

asyncio.run(main())
```

### Direct client (no LangChain)

Use `PayClawClient` if you want the raw HTTP interface:

```python
from langchain_payclaw import PayClawClient

client = PayClawClient()  # reads PAYCLAW_API_TOKEN
print(client.get_balance())
receipt = client.pay(to="0x...", amount="0.05")
print(receipt["txHash"])
```

---

## The tools

### `PayClawBalanceTool`

Read-only. Returns:

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

### `PayClawPayTool`

Sends USDC. Required args: `to` (0x address), `amount` (decimal string, min `"0.01"`).

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

### `PayClawHistoryTool`

Read-only. Optional arg: `limit` (1-50, default 10). Returns the last
~28 hours of in/out USDC transfers touching the wallet.

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

All tools catch `PayClawError` and return a string the LLM can reason about
(rather than crashing the agent loop). Status codes:

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
- `langchain-core >= 0.3, < 1.0`
- `pydantic >= 2.7`
- `httpx >= 0.27`

Works with any LangChain agent constructor, LangGraph `ToolNode`,
LangGraph's `create_react_agent`, and the OpenAI/Anthropic/Google
function-calling APIs that LangChain wraps.

## License

MIT — see [LICENSE](../../LICENSE).

## Links

- Website: <https://payclaw.me>
- SDK + MCP: <https://github.com/ONSARI/payclaw-skill>
- Issues: <https://github.com/ONSARI/payclaw-skill/issues>
