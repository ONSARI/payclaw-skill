"""End-to-end AutoGen AssistantAgent that can move USDC on Base via natural language.

Run:

    pip install "autogen-payclaw[agentchat]"
    export PAYCLAW_API_TOKEN=...
    export OPENAI_API_KEY=...
    python examples/assistant_agent.py
"""

from __future__ import annotations

import asyncio

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.ui import Console
from autogen_ext.models.openai import OpenAIChatCompletionClient

from autogen_payclaw import (
    payclaw_get_balance,
    payclaw_get_history,
    payclaw_pay,
)

SYSTEM_PROMPT = (
    "You are PayClaw, a payments agent operating on Base mainnet. "
    "You have a USDC wallet you can read from and spend from. "
    "Before any transfer, restate the recipient address and amount to the user. "
    "After any transfer, surface the Basescan explorer URL as proof. "
    "Never invent addresses. If unsure, ask."
)


async def main() -> None:
    model_client = OpenAIChatCompletionClient(model="gpt-4o-mini")

    agent = AssistantAgent(
        name="treasurer",
        model_client=model_client,
        tools=[payclaw_get_balance, payclaw_pay, payclaw_get_history],
        system_message=SYSTEM_PROMPT,
        reflect_on_tool_use=True,
    )

    task = (
        "What's my current PayClaw balance? "
        "If it's at least 0.10 USDC, send 0.05 USDC to "
        "0x000000000000000000000000000000000000dEaD and show me the tx hash."
    )

    await Console(agent.run_stream(task=task))
    await model_client.close()


if __name__ == "__main__":
    asyncio.run(main())
