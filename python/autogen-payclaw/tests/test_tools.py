"""Unit tests for autogen-payclaw.

Uses ``respx`` to mock the PayClaw HTTP API so tests run offline and don't
spend USDC. Run with:

    pip install "autogen-payclaw[test]"
    pytest
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from autogen_payclaw import (
    PayClawClient,
    balance_tool,
    history_tool,
    pay_tool,
    payclaw_get_balance,
    payclaw_get_history,
    payclaw_pay,
)
from autogen_payclaw.client import DEFAULT_BASE_URL, PayClawError

SAMPLE_BALANCE = {
    "address": "0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740",
    "signerAddress": "0x7371d193516BAb191fE99d7149Ed47f8bCBd42f7",
    "usdc": "2.01",
    "usdcRaw": "2010000",
    "chain": "base-mainnet",
    "explorer": "https://basescan.org/address/0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740",
}

SAMPLE_RECEIPT = {
    "txHash": "0xa36a000000000000000000000000000000000000000000000000000000004528",
    "status": "confirmed",
    "amountSent": "0.05",
    "feeCharged": "0.0005",
    "gasPaidInUsdc": "0.0123",
    "smartAccountAddress": "0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740",
    "explorer": "https://basescan.org/tx/0xa36a",
}

SAMPLE_HISTORY = {
    "transactions": [
        {
            "direction": "in",
            "counterparty": "0x0000000000000000000000000000000000000001",
            "amount": "1.0",
            "txHash": "0xabc",
            "blockNumber": 1,
            "explorer": "https://basescan.org/tx/0xabc",
        }
    ]
}


@pytest.fixture(autouse=True)
def _set_token(monkeypatch):
    monkeypatch.setenv("PAYCLAW_API_TOKEN", "test-token")


# --- client ---------------------------------------------------------------- #


async def test_client_requires_token(monkeypatch):
    monkeypatch.delenv("PAYCLAW_API_TOKEN", raising=False)
    with pytest.raises(ValueError, match="PAYCLAW_API_TOKEN"):
        PayClawClient()


@respx.mock
async def test_client_get_balance_sends_bearer():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    client = PayClawClient(api_token="abc")
    out = await client.get_balance()
    assert out == SAMPLE_BALANCE
    assert route.called
    assert route.calls[0].request.headers["Authorization"] == "Bearer abc"


@respx.mock
async def test_client_pay_posts_json():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    client = PayClawClient(api_token="abc")
    out = await client.pay(to="0x" + "1" * 40, amount="0.05")
    assert out == SAMPLE_RECEIPT
    body = json.loads(route.calls[0].request.content)
    assert body == {"to": "0x" + "1" * 40, "amount": "0.05"}


@respx.mock
async def test_client_raises_payclaw_error_on_4xx():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    client = PayClawClient(api_token="bad")
    with pytest.raises(PayClawError) as exc_info:
        await client.get_balance()
    assert exc_info.value.status == 401
    assert "Invalid bearer token" in exc_info.value.error


# --- tool functions -------------------------------------------------------- #


@respx.mock
async def test_payclaw_get_balance_returns_json_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    result = await payclaw_get_balance()
    assert isinstance(result, str)
    assert json.loads(result) == SAMPLE_BALANCE


@respx.mock
async def test_payclaw_get_balance_swallows_api_error_into_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    result = await payclaw_get_balance()
    assert "401" in result
    assert "Invalid bearer token" in result


@respx.mock
async def test_payclaw_pay_happy_path():
    respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    out = await payclaw_pay(to="0x" + "1" * 40, amount="0.05")
    assert json.loads(out)["txHash"] == SAMPLE_RECEIPT["txHash"]


async def test_payclaw_pay_rejects_bad_address_as_string():
    out = await payclaw_pay(to="not-an-address", amount="0.05")
    assert "PayClaw input error" in out
    assert "0x-prefixed" in out


async def test_payclaw_pay_rejects_bad_amount_as_string():
    out = await payclaw_pay(to="0x" + "1" * 40, amount="five dollars")
    assert "PayClaw input error" in out
    assert "decimal string" in out


@respx.mock
async def test_payclaw_get_history_passes_limit():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/gpt/history").mock(
        return_value=httpx.Response(200, json=SAMPLE_HISTORY)
    )
    out = await payclaw_get_history(limit=5)
    assert json.loads(out) == SAMPLE_HISTORY
    assert route.calls[0].request.url.params["limit"] == "5"


async def test_payclaw_get_history_rejects_bad_limit():
    out = await payclaw_get_history(limit=999)
    assert "PayClaw input error" in out


# --- pre-wrapped FunctionTool instances ------------------------------------ #


def test_function_tool_instances_have_correct_names():
    assert balance_tool.name == "payclaw_get_balance"
    assert pay_tool.name == "payclaw_pay"
    assert history_tool.name == "payclaw_get_history"


def test_function_tool_schemas_expose_args():
    pay_schema = pay_tool.schema
    assert "parameters" in pay_schema
    properties = pay_schema["parameters"]["properties"]
    assert "to" in properties
    assert "amount" in properties
