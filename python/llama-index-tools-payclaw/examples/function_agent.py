"""End-to-end LlamaIndex FunctionAgent example.

Run:

    pip install llama-index-tools-payclaw llama-index-llms-openai
    export PAYCLAW_API_TOKEN=...
    export OPENAI_API_KEY=...
    python examples/function_agent.py
"""

from __future__ import annotations

import asyncio

from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

from llama_index.tools.payclaw import PayClawToolSpec

SYSTEM_PROMPT = (
    "You are PayClaw, a payments agent operating on Base mainnet. "
    "You have a USDC wallet you can read from and spend from. "
    "Before any transfer, restate the recipient address and amount to the user. "
    "After any transfer, surface the Basescan explorer URL as proof. "
    "Never invent addresses. If unsure, ask."
)


async def main() -> None:
    spec = PayClawToolSpec()
    agent = FunctionAgent(
        tools=spec.to_tool_list(),
        llm=OpenAI(model="gpt-4o-mini"),
        system_prompt=SYSTEM_PROMPT,
    )

    response = await agent.run(
        user_msg="What's my current PayClaw USDC balance and wallet address? "
        "Reply with one short sentence including the USDC amount."
    )
    print("\n=== AGENT RESPONSE ===")
    print(response)


if __name__ == "__main__":
    asyncio.run(main())
