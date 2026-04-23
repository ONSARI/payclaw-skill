"""PayClaw tools for LangChain and LangGraph.

Give your agent a USDC wallet on Base it can actually spend.
Gasless via Circle Paymaster — no ETH required, 1% flat fee.

Quickstart:

    from langchain_payclaw import PayClawBalanceTool, PayClawPayTool, PayClawHistoryTool

    tools = [PayClawBalanceTool(), PayClawPayTool(), PayClawHistoryTool()]
    # Pass to any LangChain agent or LangGraph node.

Auth: set ``PAYCLAW_API_TOKEN`` in the environment, or pass ``api_token`` to
each tool's constructor.
"""

from langchain_payclaw.client import PayClawClient
from langchain_payclaw.tools import (
    PayClawBalanceTool,
    PayClawHistoryTool,
    PayClawPayTool,
)

__all__ = [
    "PayClawBalanceTool",
    "PayClawPayTool",
    "PayClawHistoryTool",
    "PayClawClient",
]

__version__ = "0.1.0"
