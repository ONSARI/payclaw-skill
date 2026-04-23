"""PayClaw tools for LlamaIndex.

Give your LlamaIndex ``FunctionAgent`` / ``ReActAgent`` a USDC wallet on Base
it can actually spend. Gasless via Circle Paymaster — no ETH required, 1%
flat fee.

Quickstart (LlamaIndex 0.12+):

    from llama_index.core.agent.workflow import FunctionAgent
    from llama_index.llms.openai import OpenAI
    from llama_index.tools.payclaw import payclaw_balance_tool, payclaw_pay_tool, payclaw_history_tool

    agent = FunctionAgent(
        tools=[payclaw_balance_tool(), payclaw_pay_tool(), payclaw_history_tool()],
        llm=OpenAI(model="gpt-4o-mini"),
        system_prompt="You manage a USDC wallet on Base.",
    )
    result = await agent.run(input="What's my balance?")

For convenience, ``PayClawToolSpec`` exposes all three tools as a list, ready
to spread into ``FunctionAgent(tools=spec.to_tool_list(), ...)``.

Auth: set ``PAYCLAW_API_TOKEN`` in the environment, or pass ``api_token`` to
each tool factory.
"""

from llama_index.tools.payclaw.client import PayClawClient
from llama_index.tools.payclaw.tools import (
    PayClawToolSpec,
    payclaw_balance_tool,
    payclaw_history_tool,
    payclaw_pay_tool,
)

__all__ = [
    "payclaw_balance_tool",
    "payclaw_pay_tool",
    "payclaw_history_tool",
    "PayClawToolSpec",
    "PayClawClient",
]

__version__ = "0.1.0"
