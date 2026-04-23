"""Minimal smoke test — exercises the three PayClaw tools without any LLM.

Run:

    export PAYCLAW_API_TOKEN=...
    python examples/quickstart.py
"""

from __future__ import annotations

import json

from langchain_payclaw import (
    PayClawBalanceTool,
    PayClawHistoryTool,
    PayClawPayTool,
)


def main() -> None:
    balance_tool = PayClawBalanceTool()
    history_tool = PayClawHistoryTool()
    pay_tool = PayClawPayTool()

    print("--- balance ---")
    balance = json.loads(balance_tool.invoke({}))
    print(json.dumps(balance, indent=2))

    print("\n--- history (last 5) ---")
    history = json.loads(history_tool.invoke({"limit": 5}))
    print(json.dumps(history, indent=2))

    # Uncomment to fire a real on-chain transfer (uses real USDC + 1% fee):
    # print("\n--- pay 0.01 USDC to burn address ---")
    # receipt = json.loads(pay_tool.invoke({
    #     "to": "0x000000000000000000000000000000000000dEaD",
    #     "amount": "0.01",
    # }))
    # print(json.dumps(receipt, indent=2))
    _ = pay_tool  # silence unused warning


if __name__ == "__main__":
    main()
