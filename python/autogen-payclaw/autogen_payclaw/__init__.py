"""PayClaw tools for Microsoft AutoGen.

Give your AutoGen ``AssistantAgent`` a USDC wallet on Base it can actually
spend. Gasless via Circle Paymaster — no ETH required, 1% flat fee.

Quickstart (AutoGen 0.4+):

    from autogen_agentchat.agents import AssistantAgent
    from autogen_ext.models.openai import OpenAIChatCompletionClient
    from autogen_payclaw import payclaw_get_balance, payclaw_pay, payclaw_get_history

    agent = AssistantAgent(
        name="treasurer",
        model_client=OpenAIChatCompletionClient(model="gpt-4o-mini"),
        tools=[payclaw_get_balance, payclaw_pay, payclaw_get_history],
        system_message="You manage a USDC wallet on Base.",
        reflect_on_tool_use=True,
    )

Auth: set ``PAYCLAW_API_TOKEN`` in the environment before invoking the tools,
or use ``PayClawClient`` directly with an explicit token.

Pre-wrapped FunctionTool instances are also exposed (``balance_tool``,
``pay_tool``, ``history_tool``) for users who want explicit tool registration.
"""

from autogen_payclaw.client import PayClawClient
from autogen_payclaw.tools import (
    balance_tool,
    history_tool,
    pay_tool,
    payclaw_get_balance,
    payclaw_get_history,
    payclaw_pay,
)

__all__ = [
    # Plain async functions (idiomatic AutoGen 0.4+)
    "payclaw_get_balance",
    "payclaw_pay",
    "payclaw_get_history",
    # Pre-wrapped FunctionTool instances
    "balance_tool",
    "pay_tool",
    "history_tool",
    # Direct HTTP client
    "PayClawClient",
]

__version__ = "0.1.0"
