"""PayClaw tools for CrewAI.

Give your CrewAI crew a USDC wallet on Base it can actually spend.
Gasless via Circle Paymaster — no ETH required, 1% flat fee.

Quickstart:

    from crewai import Agent, Crew, Task
    from crewai_payclaw import PayClawBalanceTool, PayClawPayTool, PayClawHistoryTool

    treasurer = Agent(
        role="Treasurer",
        goal="Pay vendors on time, in full, on-chain.",
        backstory="A diligent agent that manages the crew's USDC wallet on Base.",
        tools=[PayClawBalanceTool(), PayClawPayTool(), PayClawHistoryTool()],
    )

Auth: set ``PAYCLAW_API_TOKEN`` in the environment, or pass ``api_token`` to
each tool's constructor.
"""

from crewai_payclaw.client import PayClawClient
from crewai_payclaw.tools import (
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
