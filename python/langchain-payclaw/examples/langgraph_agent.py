"""End-to-end LangGraph agent that can move USDC on Base via natural language.

Uses LangGraph's prebuilt ReAct agent — the LLM plans a sequence of tool
calls (check balance → confirm → pay) and surfaces the on-chain receipt.

Run:

    pip install "langchain-payclaw[langgraph]" langchain-anthropic
    export PAYCLAW_API_TOKEN=...
    export ANTHROPIC_API_KEY=...
    python examples/langgraph_agent.py

You can swap ``ChatAnthropic`` for ``ChatOpenAI`` (``langchain-openai``) or
any other LangChain chat model that supports tool-calling.
"""

from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from langchain_payclaw import (
    PayClawBalanceTool,
    PayClawHistoryTool,
    PayClawPayTool,
)

SYSTEM_PROMPT = (
    "You are PayClaw, a payments agent operating on Base mainnet. "
    "You have a USDC wallet you can read from and spend from. "
    "Before any transfer, restate the recipient address and amount to the user. "
    "After any transfer, surface the Basescan explorer URL as proof. "
    "Never invent addresses. If unsure, ask."
)


def build_agent():
    tools = [
        PayClawBalanceTool(),
        PayClawPayTool(),
        PayClawHistoryTool(),
    ]
    model = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
    return create_react_agent(model=model, tools=tools, prompt=SYSTEM_PROMPT)


def main() -> None:
    agent = build_agent()

    user_msg = (
        "What's my current PayClaw balance? "
        "If it's at least 0.10 USDC, send 0.05 USDC to "
        "0x000000000000000000000000000000000000dEaD and show me the tx hash."
    )

    result = agent.invoke({"messages": [("user", user_msg)]})

    for message in result["messages"]:
        role = type(message).__name__
        content = getattr(message, "content", "")
        print(f"\n--- {role} ---")
        print(content)


if __name__ == "__main__":
    main()
