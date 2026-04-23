"""End-to-end CrewAI agent that reads its own USDC balance via natural language.

The crew has a single agent (Treasurer) that knows how to use the PayClaw
tools. We give it a Task to check the wallet balance and surface the address.

Run:

    pip install crewai-payclaw "crewai" openai
    export PAYCLAW_API_TOKEN=...
    export OPENAI_API_KEY=...
    python examples/crew_treasurer.py

Note: this example only exercises read-only tools (balance + history) so it
does not spend real USDC. Uncomment the second task to fire a paid transfer.
"""

from __future__ import annotations

from crewai import Agent, Crew, Task

from crewai_payclaw import (
    PayClawBalanceTool,
    PayClawHistoryTool,
    PayClawPayTool,
)


def main() -> None:
    treasurer = Agent(
        role="Crew Treasurer",
        goal="Know the crew's USDC position and pay vendors when authorized.",
        backstory=(
            "A diligent treasurer that manages the crew's USDC wallet on Base. "
            "Always confirms balance before any transfer, surfaces Basescan "
            "URLs as proof of payment, and never invents addresses."
        ),
        tools=[
            PayClawBalanceTool(),
            PayClawPayTool(),
            PayClawHistoryTool(),
        ],
        verbose=True,
        allow_delegation=False,
    )

    check_balance = Task(
        description=(
            "What is the crew's current USDC balance and wallet address on Base? "
            "Also list the last 3 transactions if any. Return a clean summary "
            "with the Basescan link."
        ),
        expected_output=(
            "A short report with USDC balance, wallet address, Basescan URL, "
            "and a list of recent transactions."
        ),
        agent=treasurer,
    )

    crew = Crew(
        agents=[treasurer],
        tasks=[check_balance],
        verbose=True,
    )

    result = crew.kickoff()
    print("\n=== FINAL OUTPUT ===")
    print(result)


if __name__ == "__main__":
    main()
