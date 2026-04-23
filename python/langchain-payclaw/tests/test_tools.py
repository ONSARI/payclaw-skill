"""Unit tests for langchain-payclaw.

Uses ``respx`` to mock the PayClaw HTTP API so tests run offline and don't
spend USDC. Run with:

    pip install "langchain-payclaw[test]"
    pytest
"""

from __future__ import annotations

import json
import os

import httpx
import pytest
import respx

from langchain_payclaw import (
    PayClawBalanceTool,
    PayClawClient,
    PayClawHistoryTool,
    PayClawPayTool,
)
from langchain_payclaw.client import DEFAULT_BASE_URL, PayClawError

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


def test_client_requires_token(monkeypatch):
    monkeypatch.delenv("PAYCLAW_API_TOKEN", raising=False)
    with pytest.raises(ValueError, match="PAYCLAW_API_TOKEN"):
        PayClawClient()


@respx.mock
def test_client_get_balance_sends_bearer():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    client = PayClawClient(api_token="abc")
    out = client.get_balance()
    assert out == SAMPLE_BALANCE
    assert route.called
    assert route.calls[0].request.headers["Authorization"] == "Bearer abc"


@respx.mock
def test_client_pay_posts_json():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    client = PayClawClient(api_token="abc")
    out = client.pay(to="0x" + "1" * 40, amount="0.05")
    assert out == SAMPLE_RECEIPT
    body = json.loads(route.calls[0].request.content)
    assert body == {"to": "0x" + "1" * 40, "amount": "0.05"}


@respx.mock
def test_client_raises_payclaw_error_on_4xx():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    client = PayClawClient(api_token="bad")
    with pytest.raises(PayClawError) as exc_info:
        client.get_balance()
    assert exc_info.value.status == 401
    assert "Invalid bearer token" in exc_info.value.error


# --- balance tool ---------------------------------------------------------- #


@respx.mock
def test_balance_tool_returns_json_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    tool = PayClawBalanceTool()
    result = tool.invoke({})
    assert isinstance(result, str)
    assert json.loads(result) == SAMPLE_BALANCE


@respx.mock
def test_balance_tool_swallows_api_error_into_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    tool = PayClawBalanceTool()
    result = tool.invoke({})
    assert "401" in result
    assert "Invalid bearer token" in result


# --- pay tool -------------------------------------------------------------- #


@respx.mock
def test_pay_tool_happy_path():
    respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    tool = PayClawPayTool()
    out = tool.invoke({"to": "0x" + "1" * 40, "amount": "0.05"})
    assert json.loads(out)["txHash"] == SAMPLE_RECEIPT["txHash"]


def test_pay_tool_rejects_bad_address():
    tool = PayClawPayTool()
    with pytest.raises(Exception, match="0x-prefixed"):
        tool.invoke({"to": "not-an-address", "amount": "0.05"})


def test_pay_tool_rejects_bad_amount():
    tool = PayClawPayTool()
    with pytest.raises(Exception, match="decimal string"):
        tool.invoke({"to": "0x" + "1" * 40, "amount": "five dollars"})


# --- history tool ---------------------------------------------------------- #


@respx.mock
def test_history_tool_passes_limit():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/gpt/history").mock(
        return_value=httpx.Response(200, json=SAMPLE_HISTORY)
    )
    tool = PayClawHistoryTool()
    out = tool.invoke({"limit": 5})
    assert json.loads(out) == SAMPLE_HISTORY
    assert route.calls[0].request.url.params["limit"] == "5"


# --- async ----------------------------------------------------------------- #


@pytest.mark.asyncio
@respx.mock
async def test_balance_tool_async():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    tool = PayClawBalanceTool()
    out = await tool.ainvoke({})
    assert json.loads(out) == SAMPLE_BALANCE
