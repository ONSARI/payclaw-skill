"""AutoGen tool functions for the PayClaw API.

AutoGen 0.4+ accepts plain async Python functions as tools — type hints and
docstrings are auto-converted to LLM-callable schemas. We expose three:

- :func:`payclaw_get_balance` — read USDC balance + wallet address.
- :func:`payclaw_pay` — send USDC to an address on Base mainnet.
- :func:`payclaw_get_history` — list recent on-chain USDC transfers.

For users who prefer explicit ``FunctionTool`` registration, pre-wrapped
instances are also exposed: ``balance_tool``, ``pay_tool``, ``history_tool``.

Auth: each call constructs a :class:`PayClawClient` from the
``PAYCLAW_API_TOKEN`` env var. To use a non-default token or base URL,
construct ``PayClawClient`` directly and call its async methods.
"""

from __future__ import annotations

import json
import re

from autogen_core.tools import FunctionTool
from typing_extensions import Annotated

from autogen_payclaw.client import PayClawClient, PayClawError

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


# --------------------------------------------------------------------------- #
# Tool functions (plain async — idiomatic AutoGen 0.4+)                       #
# --------------------------------------------------------------------------- #


async def payclaw_get_balance() -> str:
    """Read the agent's PayClaw wallet USDC balance and address on Base mainnet.

    Returns a JSON string with ``address``, ``signerAddress``, ``usdc`` (human
    decimal), ``usdcRaw``, ``chain``, and ``explorer`` (Basescan URL).
    Read-only — no on-chain side effects, no signing, no fee. Use before any
    transfer to confirm the wallet is funded, or whenever the user asks
    'how much do I have'.
    """
    try:
        return json.dumps(await PayClawClient().get_balance())
    except PayClawError as e:
        return _format_error(e)


async def payclaw_pay(
    to: Annotated[str, "Recipient address on Base mainnet. Must be a valid 0x-prefixed 40-character hex address."],
    amount: Annotated[str, "USDC amount as a decimal string (e.g. '0.05', '10', '1.234567'). Minimum 0.01 USDC. PayClaw charges a 1% fee on top."],
) -> str:
    """Send USDC from the agent's wallet to a Base mainnet address.

    The transfer settles atomically in a single ERC-4337 v0.7 UserOp. Gas is
    paid in USDC via Circle Paymaster — no ETH needed. Charges a flat 1% fee.
    The first send from a brand-new wallet triggers an on-chain smart-account
    deployment (~20-40 seconds end-to-end).

    Returns a JSON string with ``txHash``, ``amountSent``, ``feeCharged``,
    ``gasPaidInUsdc``, and ``explorer`` (Basescan URL). Always surface the
    explorer URL to the user as proof of payment.

    WARNING: this moves real on-chain USDC and is irreversible. Confirm the
    recipient and amount with the user before invoking.
    """
    if not _ADDRESS_RE.match(to):
        return "PayClaw input error: `to` must be a 0x-prefixed 40-character hex address (Base mainnet)."
    if not _AMOUNT_RE.match(amount):
        return "PayClaw input error: `amount` must be a decimal string in USDC (e.g. '0.05'). Do not include currency symbols."
    try:
        return json.dumps(await PayClawClient().pay(to=to, amount=amount))
    except PayClawError as e:
        return _format_error(e)


async def payclaw_get_history(
    limit: Annotated[int, "Max number of transactions to return (1-50, default 10)."] = 10,
) -> str:
    """List recent USDC transfers (in + out) for the agent's PayClaw wallet.

    Queries Base mainnet logs over the last ~28 hours. Each entry includes
    ``direction`` (``in``/``out``), ``counterparty``, ``amount``, ``txHash``,
    ``blockNumber``, and an ``explorer`` (Basescan URL). Read-only.

    Use whenever the user asks 'what did I send/receive recently', 'show my
    last N transactions', or to confirm a specific payment landed on-chain.
    """
    if not isinstance(limit, int) or limit < 1 or limit > 50:
        return "PayClaw input error: `limit` must be an integer between 1 and 50."
    try:
        return json.dumps(await PayClawClient().get_history(limit=limit))
    except PayClawError as e:
        return _format_error(e)


# --------------------------------------------------------------------------- #
# Pre-wrapped FunctionTool instances                                          #
# --------------------------------------------------------------------------- #

balance_tool = FunctionTool(
    payclaw_get_balance,
    description="Read the agent's PayClaw wallet USDC balance and address on Base mainnet.",
    name="payclaw_get_balance",
)

pay_tool = FunctionTool(
    payclaw_pay,
    description="Send USDC from the agent's wallet to a Base mainnet address. Pays gas in USDC via Circle Paymaster.",
    name="payclaw_pay",
)

history_tool = FunctionTool(
    payclaw_get_history,
    description="List recent USDC transfers (in + out) for the agent's PayClaw wallet.",
    name="payclaw_get_history",
)
