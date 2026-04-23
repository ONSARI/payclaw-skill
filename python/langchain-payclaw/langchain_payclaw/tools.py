"""LangChain ``BaseTool`` implementations for the PayClaw API.

Three tools are exposed:

- :class:`PayClawBalanceTool` — read USDC balance + wallet address.
- :class:`PayClawPayTool` — send USDC to an address on Base mainnet.
- :class:`PayClawHistoryTool` — list recent on-chain USDC transfers.

All tools support sync and async execution and play well with LangChain
agents (``create_react_agent``, ``AgentExecutor``) and LangGraph (``ToolNode``,
``create_react_agent`` from ``langgraph.prebuilt``).
"""

from __future__ import annotations

import json
import re
from typing import Any, ClassVar

from langchain_core.callbacks import (
    AsyncCallbackManagerForToolRun,
    CallbackManagerForToolRun,
)
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field, field_validator

from langchain_payclaw.client import PayClawClient, PayClawError

_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_AMOUNT_RE = re.compile(r"^\d+(\.\d+)?$")


def _format_error(exc: PayClawError) -> str:
    """Render a PayClawError as a string the LLM can reason about and retry."""
    base = f"PayClaw API error ({exc.status}): {exc.error}"
    if exc.detail:
        base += f". Detail: {exc.detail}"
    if exc.status == 401:
        base += " Hint: check that PAYCLAW_API_TOKEN is set correctly."
    if exc.status == 429:
        base += " Hint: you're rate-limited. Fund the wallet with USDC to bypass the empty-wallet rate limit, or wait."
    return base


# --------------------------------------------------------------------------- #
# Balance                                                                     #
# --------------------------------------------------------------------------- #


class _BalanceInput(BaseModel):
    """Input schema for :class:`PayClawBalanceTool` (no arguments)."""


class PayClawBalanceTool(BaseTool):
    """Read the agent wallet's USDC balance and address on Base mainnet.

    The tool returns a JSON string with ``address``, ``usdc`` (human-readable),
    ``chain``, and a Basescan ``explorer`` link. Read-only — no on-chain side
    effects, no signing, no fee.

    Use this whenever you need to know how much USDC the agent currently holds,
    confirm the wallet address before a transfer, or surface a Basescan link.
    """

    name: str = "payclaw_get_balance"
    description: str = (
        "Read the agent wallet's USDC balance and address on Base mainnet. "
        "Returns address, USDC balance (decimal), chain, and a Basescan explorer URL. "
        "Read-only, no signing, no fee. Use before any transfer to confirm the wallet "
        "is funded, or whenever the user asks 'how much do I have'."
    )
    args_schema: ClassVar[type[BaseModel]] = _BalanceInput

    api_token: str | None = Field(default=None, exclude=True)
    base_url: str | None = Field(default=None, exclude=True)
    timeout: float = Field(default=60.0, exclude=True)

    def _client(self) -> PayClawClient:
        return PayClawClient(
            api_token=self.api_token, base_url=self.base_url, timeout=self.timeout
        )

    def _run(
        self,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(self._client().get_balance())
        except PayClawError as e:
            return _format_error(e)

    async def _arun(
        self,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(await self._client().aget_balance())
        except PayClawError as e:
            return _format_error(e)


# --------------------------------------------------------------------------- #
# Pay                                                                         #
# --------------------------------------------------------------------------- #


class _PayInput(BaseModel):
    """Input schema for :class:`PayClawPayTool`."""

    to: str = Field(
        ...,
        description=(
            "Recipient address on Base mainnet. Must be a valid 0x-prefixed "
            "40-character hex address."
        ),
    )
    amount: str = Field(
        ...,
        description=(
            "USDC amount as a decimal string (e.g. '0.05', '10', '1.234567'). "
            "Minimum 0.01 USDC. PayClaw charges a 1% fee on top."
        ),
    )

    @field_validator("to")
    @classmethod
    def _validate_to(cls, v: str) -> str:
        if not _ADDRESS_RE.match(v):
            raise ValueError(
                "`to` must be a 0x-prefixed 40-character hex address (Base mainnet)."
            )
        return v

    @field_validator("amount")
    @classmethod
    def _validate_amount(cls, v: str) -> str:
        if not _AMOUNT_RE.match(v):
            raise ValueError(
                "`amount` must be a decimal string in USDC (e.g. '0.05'). "
                "Do not include currency symbols."
            )
        return v


class PayClawPayTool(BaseTool):
    """Send USDC from the agent wallet to a Base mainnet address.

    The transfer settles atomically in a single ERC-4337 v0.7 UserOp. Gas is
    paid in USDC via Circle Paymaster — the wallet does **not** need ETH.
    PayClaw charges a flat 1% fee. The first send from a brand-new wallet
    triggers an on-chain smart-account deployment (~20-40 seconds end-to-end).

    Returns a JSON string with ``txHash``, ``amountSent``, ``feeCharged``,
    ``gasPaidInUsdc``, and a Basescan ``explorer`` URL. Always surface the
    ``explorer`` URL to the user as proof of payment.

    **This tool moves real money on-chain. Confirm the recipient and amount
    with the user before invoking.**
    """

    name: str = "payclaw_pay"
    description: str = (
        "Send USDC from the agent's wallet to a Base mainnet address. "
        "Args: to (0x address, required), amount (USDC decimal string, required, min 0.01). "
        "Pays gas in USDC via Circle Paymaster — no ETH needed. Charges 1% fee. "
        "Returns txHash and a Basescan explorer URL on success. "
        "WARNING: this moves real on-chain USDC and is irreversible. "
        "Confirm recipient and amount with the user before calling."
    )
    args_schema: ClassVar[type[BaseModel]] = _PayInput

    api_token: str | None = Field(default=None, exclude=True)
    base_url: str | None = Field(default=None, exclude=True)
    timeout: float = Field(default=120.0, exclude=True)

    def _client(self) -> PayClawClient:
        return PayClawClient(
            api_token=self.api_token, base_url=self.base_url, timeout=self.timeout
        )

    def _run(
        self,
        to: str,
        amount: str,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(self._client().pay(to=to, amount=amount))
        except PayClawError as e:
            return _format_error(e)

    async def _arun(
        self,
        to: str,
        amount: str,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(await self._client().apay(to=to, amount=amount))
        except PayClawError as e:
            return _format_error(e)


# --------------------------------------------------------------------------- #
# History                                                                     #
# --------------------------------------------------------------------------- #


class _HistoryInput(BaseModel):
    """Input schema for :class:`PayClawHistoryTool`."""

    limit: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Max number of transactions to return (1-50, default 10).",
    )


class PayClawHistoryTool(BaseTool):
    """List recent USDC transfers (in + out) for the agent wallet.

    Queries Base mainnet logs over the last ~28 hours of history. Each entry
    includes ``direction`` (``in``/``out``), ``counterparty``, ``amount``,
    ``txHash``, ``blockNumber``, and a Basescan ``explorer`` URL. Read-only.

    Use whenever the user asks 'what did I send/receive recently', 'show my
    last N transactions', or to confirm a specific payment landed on-chain.
    """

    name: str = "payclaw_get_history"
    description: str = (
        "List recent USDC transfers (in + out) for the agent wallet on Base mainnet. "
        "Args: limit (int 1-50, default 10). "
        "Returns recent transactions with direction, counterparty, amount, txHash, "
        "blockNumber, and Basescan explorer URL. Read-only. Covers the last ~28h."
    )
    args_schema: ClassVar[type[BaseModel]] = _HistoryInput

    api_token: str | None = Field(default=None, exclude=True)
    base_url: str | None = Field(default=None, exclude=True)
    timeout: float = Field(default=60.0, exclude=True)

    def _client(self) -> PayClawClient:
        return PayClawClient(
            api_token=self.api_token, base_url=self.base_url, timeout=self.timeout
        )

    def _run(
        self,
        limit: int = 10,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(self._client().get_history(limit=limit))
        except PayClawError as e:
            return _format_error(e)

    async def _arun(
        self,
        limit: int = 10,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
    ) -> str:
        try:
            return json.dumps(await self._client().aget_history(limit=limit))
        except PayClawError as e:
            return _format_error(e)
