"""Minimal smoke test — exercises the three PayClaw tool functions.

Run:

    export PAYCLAW_API_TOKEN=...
    python examples/quickstart.py
"""

from __future__ import annotations

import asyncio
import json

from autogen_payclaw import (
    payclaw_get_balance,
    payclaw_get_history,
    payclaw_pay,
)


async def main() -> None:
    print("--- balance ---")
    balance = json.loads(await payclaw_get_balance())
    print(json.dumps(balance, indent=2))

    print("\n--- history (last 5) ---")
    history = json.loads(await payclaw_get_history(limit=5))
    print(json.dumps(history, indent=2))

    # Uncomment to fire a real on-chain transfer (uses real USDC + 1% fee):
    # print("\n--- pay 0.01 USDC to burn address ---")
    # receipt = json.loads(await payclaw_pay(
    #     to="0x000000000000000000000000000000000000dEaD",
    #     amount="0.01",
    # ))
    # print(json.dumps(receipt, indent=2))
    _ = payclaw_pay  # silence unused warning


if __name__ == "__main__":
    asyncio.run(main())
