"""Minimal smoke test — exercises the three PayClaw tools without an LLM.

Run:

    export PAYCLAW_API_TOKEN=...
    python examples/quickstart.py
"""

from __future__ import annotations

import asyncio
import json

from llama_index.tools.payclaw import (
    payclaw_balance_tool,
    payclaw_history_tool,
    payclaw_pay_tool,
)


async def main() -> None:
    balance = payclaw_balance_tool()
    history = payclaw_history_tool()
    pay = payclaw_pay_tool()

    print("--- balance ---")
    out = json.loads(await balance.async_fn())
    print(json.dumps(out, indent=2))

    print("\n--- history (last 5) ---")
    out = json.loads(await history.async_fn(limit=5))
    print(json.dumps(out, indent=2))

    # Uncomment to fire a real on-chain transfer (uses real USDC + 1% fee):
    # print("\n--- pay 0.01 USDC to burn address ---")
    # out = json.loads(await pay.async_fn(
    #     to="0x000000000000000000000000000000000000dEaD",
    #     amount="0.01",
    # ))
    # print(json.dumps(out, indent=2))
    _ = pay


if __name__ == "__main__":
    asyncio.run(main())
