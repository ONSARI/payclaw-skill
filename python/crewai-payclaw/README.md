# crewai-payclaw

> **Give your CrewAI crew a USDC wallet on Base it can actually spend.**
> Gasless via Circle Paymaster. No ETH required. 1% flat fee. No KYC.

`crewai-payclaw` ships three production-grade [CrewAI](https://docs.crewai.com)
tools that let any agent in your crew read its USDC balance, send USDC to any
address on Base mainnet, and inspect on-chain transaction history.

Designed for use inside `Crew`, `Agent`, and `Task` definitions, with full
Pydantic input validation that catches bad addresses or malformed amounts
before they ever reach the chain.

---

## Install

```bash
pip install crewai-payclaw
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

## Quickstart — give your crew a treasurer

```python
import os
from crewai import Agent, Crew, Task
from crewai_payclaw import (
    PayClawBalanceTool,
    PayClawPayTool,
    PayClawHistoryTool,
)

os.environ["PAYCLAW_API_TOKEN"] = "..."  # get one at https://payclaw.me
os.environ["OPENAI_API_KEY"] = "..."

treasurer = Agent(
    role="Crew Treasurer",
    goal="Pay vendors on time, in full, on-chain — and never overspend.",
    backstory=(
        "A diligent treasurer that manages the crew's USDC wallet on Base. "
        "Always checks the balance before paying and surfaces the Basescan "
        "explorer URL after each transfer."
    ),
    tools=[PayClawBalanceTool(), PayClawPayTool(), PayClawHistoryTool()],
    verbose=True,
)

settle_invoice = Task(
    description=(
        "Check the crew's wallet. If we have at least 0.10 USDC, send "
        "0.05 USDC to 0x000000000000000000000000000000000000dEaD as a "
        "test payment. Confirm the transaction on Basescan."
    ),
    expected_output="The transaction hash and Basescan URL of the payment.",
    agent=treasurer,
)

crew = Crew(agents=[treasurer], tasks=[settle_invoice], verbose=True)
result = crew.kickoff()
print(result)
```

### Multi-agent example: research + pay

```python
from crewai import Agent, Crew, Task
from crewai_payclaw import PayClawBalanceTool, PayClawPayTool

researcher = Agent(
    role="Vendor Researcher",
    goal="Identify the right Base address to pay for a given vendor name.",
    backstory="Knows the on-chain registry inside out.",
    tools=[],  # could add web-search tools here
)

treasurer = Agent(
    role="Treasurer",
    goal="Settle approved payments only.",
    backstory="Pays only what the researcher confirms.",
    tools=[PayClawBalanceTool(), PayClawPayTool()],
)

research_task = Task(
    description="Find the Base mainnet address for vendor 'Vitalik'.",
    expected_output="A 0x... address.",
    agent=researcher,
)

pay_task = Task(
    description="Send 0.05 USDC to the address the researcher provides.",
    expected_output="Transaction hash + Basescan URL.",
    agent=treasurer,
    context=[research_task],
)

Crew(agents=[researcher, treasurer], tasks=[research_task, pay_task]).kickoff()
```

### Direct client (no CrewAI)

Use `PayClawClient` if you want the raw HTTP interface without the agent
machinery — useful for hooks, observability, or unit tests:

```python
from crewai_payclaw import PayClawClient

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

Every existing way to give a crew a wallet has the same defect: it needs
ETH for gas. So you end up running an ETH-funding cron, or you bail and use
a custodial API and lose the whole point of agent-owned funds.

PayClaw uses ERC-4337 v0.7 + Circle Paymaster: the agent's smart account
spends USDC and the paymaster pays the bundler in USDC on its behalf. Your
crew only ever holds and spends one asset.

| | Crew wallet (vanilla) | Custodial API | **PayClaw** |
|---|---|---|---|
| Holds its own funds | ✅ | ❌ | ✅ |
| Needs ETH for gas | ❌ | n/a | ✅ |
| KYC required | ❌ | ✅ | ❌ |
| 1 line to integrate | ❌ | ❌ | ✅ |

---

## Errors

All tools catch `PayClawError` and return a string the LLM can reason about
(rather than crashing the crew loop). Status codes:

- `400` — bad input (invalid address, amount below dust threshold)
- `401` — invalid bearer token
- `429` — rate-limited (only on first deploy from an empty wallet — fund the
  wallet to bypass)
- `502` — paymaster or RPC failure

If you want to handle errors yourself, drop down to `PayClawClient` and
catch `PayClawError` directly.

---

## Compatibility

- Python ≥ 3.10
- `crewai >= 0.70`
- `pydantic >= 2.7`
- `httpx >= 0.27`

## License

MIT — see [LICENSE](../../LICENSE).

## Links

- Website: <https://payclaw.me>
- LangChain version: [`langchain-payclaw`](https://pypi.org/project/langchain-payclaw/)
- SDK + MCP: <https://github.com/ONSARI/payclaw-skill>
- Issues: <https://github.com/ONSARI/payclaw-skill/issues>
