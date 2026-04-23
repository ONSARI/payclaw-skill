"""LlamaIndex tool factories for the PayClaw API.

Three tools are exposed as factory functions returning ``FunctionTool``:

- :func:`payclaw_balance_tool` — read USDC balance + wallet address.
- :func:`payclaw_pay_tool` — send USDC to an address on Base mainnet.
- :func:`payclaw_history_tool` — list recent on-chain USDC transfers.

For convenience, :class:`PayClawToolSpec` returns all three at once via
``to_tool_list()``, so you can spread them straight into an agent:

    spec = PayClawToolSpec()
    agent = FunctionAgent(tools=spec.to_tool_list(), llm=...)
"""

from __future__ import annotations

import json
import re
from typing import Optional

from llama_index.core.tools import FunctionTool

from llama_index.tools.payclaw.client import PayClawClient, PayClawError

_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_AMOUNT_RE = re.compile(r"^\d+(\.\d+)?$")


def _format_error(exc: PayClawError) -> str:
    base = f"PayClaw API error ({exc.status}): {exc.error}"
    if exc.detail:
        base += f". Detail: {exc.detail}"
    if exc.status == 401:
        base += " Hint: check that PAYCLAW_API_TOKEN is set correctly."
    if exc.status == 429:
        base += " Hint: you're rate-limited. Fund the wallet with USDC to bypass the empty-wallet rate limit, or wait."
    return base


def _client(api_token: Optional[str], base_url: Optional[str], timeout: float) -> PayClawClient:
    return PayClawClient(api_token=api_token, base_url=base_url, timeout=timeout)


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


def payclaw_balance_tool(
    api_token: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 60.0,
) -> FunctionTool:
    """Build a ``FunctionTool`` that reads the agent wallet's USDC balance.

    Read-only — no on-chain side effects, no signing, no fee. The wrapped
    function returns a JSON string with ``address``, ``signerAddress``,
    ``usdc`` (human decimal), ``usdcRaw``, ``chain``, and ``explorer``
    (Basescan URL).
    """

    async def payclaw_get_balance() -> str:
        """Read the agent's PayClaw wallet USDC balance and address on Base mainnet.

        Returns a JSON string with address, USDC balance (human decimal),
        chain, and a Basescan explorer URL. Read-only — no signing, no fee.
        Use before any transfer to confirm the wallet is funded, or whenever
        the user asks 'how much do I have'.
        """
        try:
            return json.dumps(await _client(api_token, base_url, timeout).get_balance())
        except PayClawError as e:
            return _format_error(e)

    return FunctionTool.from_defaults(
        async_fn=payclaw_get_balance,
        name="payclaw_get_balance",
        description=(
            "Read the agent's PayClaw wallet USDC balance and address on Base mainnet. "
            "Returns address, USDC balance (decimal), chain, and a Basescan explorer URL. "
            "Read-only, no signing, no fee. Use before any transfer to confirm the wallet is funded."
        ),
    )


def payclaw_pay_tool(
    api_token: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 120.0,
) -> FunctionTool:
    """Build a ``FunctionTool`` that sends USDC on Base mainnet.

    The transfer settles atomically in a single ERC-4337 v0.7 UserOp. Gas is
    paid in USDC via Circle Paymaster — no ETH needed. Charges 1% fee.

    WARNING: this moves real on-chain USDC and is irreversible. Always have
    the agent confirm the recipient and amount with the user before invoking.
    """

    async def payclaw_pay(to: str, amount: str) -> str:
        """Send USDC from the agent's wallet to a Base mainnet address.

        Args:
            to: Recipient address on Base mainnet. Must be a valid 0x-prefixed
                40-character hex address.
            amount: USDC amount as a decimal string (e.g. '0.05', '10').
                Minimum 0.01 USDC. PayClaw charges 1% on top.

        Returns a JSON string with txHash, amountSent, feeCharged,
        gasPaidInUsdc, smartAccountAddress, and explorer (Basescan URL).
        Always surface the explorer URL to the user as proof of payment.

        WARNING: this moves real on-chain USDC and is irreversible. Confirm
        recipient and amount with the user before invoking.
        """
        if not _ADDRESS_RE.match(to):
            return "PayClaw input error: `to` must be a 0x-prefixed 40-character hex address (Base mainnet)."
        if not _AMOUNT_RE.match(amount):
            return "PayClaw input error: `amount` must be a decimal string in USDC (e.g. '0.05'). Do not include currency symbols."
        try:
            return json.dumps(await _client(api_token, base_url, timeout).pay(to=to, amount=amount))
        except PayClawError as e:
            return _format_error(e)

    return FunctionTool.from_defaults(
        async_fn=payclaw_pay,
        name="payclaw_pay",
        description=(
            "Send USDC from the agent's wallet to a Base mainnet address. "
            "Args: to (0x address, required), amount (USDC decimal string, required, min 0.01). "
            "Pays gas in USDC via Circle Paymaster — no ETH needed. Charges 1% fee. "
            "Returns txHash and a Basescan explorer URL on success. "
            "WARNING: moves real on-chain USDC and is irreversible. Confirm recipient and amount before calling."
        ),
    )


def payclaw_history_tool(
    api_token: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 60.0,
) -> FunctionTool:
    """Build a ``FunctionTool`` that lists recent USDC transfers."""

    async def payclaw_get_history(limit: int = 10) -> str:
        """List recent USDC transfers (in + out) for the agent's PayClaw wallet.

        Args:
            limit: Max number of transactions to return (1-50, default 10).

        Returns a JSON string with recent transactions including direction,
        counterparty, amount, txHash, blockNumber, and Basescan explorer URL.
        Read-only. Covers the last ~28h of Base mainnet history.
        """
        if not isinstance(limit, int) or limit < 1 or limit > 50:
            return "PayClaw input error: `limit` must be an integer between 1 and 50."
        try:
            return json.dumps(await _client(api_token, base_url, timeout).get_history(limit=limit))
        except PayClawError as e:
            return _format_error(e)

    return FunctionTool.from_defaults(
        async_fn=payclaw_get_history,
        name="payclaw_get_history",
        description=(
            "List recent USDC transfers (in + out) for the agent's PayClaw wallet on Base. "
            "Args: limit (int 1-50, default 10). "
            "Returns recent transactions with direction, counterparty, amount, txHash, "
            "blockNumber, and Basescan explorer URL. Read-only. Covers the last ~28h."
        ),
    )


# --------------------------------------------------------------------------- #
# ToolSpec convenience                                                        #
# --------------------------------------------------------------------------- #


class PayClawToolSpec:
    """Bundle the three PayClaw tools so an agent can grab them all at once.

    Example:

        from llama_index.core.agent.workflow import FunctionAgent
        from llama_index.llms.openai import OpenAI
        from llama_index.tools.payclaw import PayClawToolSpec

        spec = PayClawToolSpec()
        agent = FunctionAgent(tools=spec.to_tool_list(), llm=OpenAI(model="gpt-4o-mini"))
    """

    def __init__(
        self,
        api_token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        pay_timeout: float = 120.0,
    ) -> None:
        self._api_token = api_token
        self._base_url = base_url
        self._timeout = timeout
        self._pay_timeout = pay_timeout

    def to_tool_list(self) -> list[FunctionTool]:
        return [
            payclaw_balance_tool(self._api_token, self._base_url, self._timeout),
            payclaw_pay_tool(self._api_token, self._base_url, self._pay_timeout),
            payclaw_history_tool(self._api_token, self._base_url, self._timeout),
        ]
