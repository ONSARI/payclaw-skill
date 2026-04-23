"""Unit tests for llama-index-tools-payclaw.

Uses ``respx`` to mock the PayClaw HTTP API so tests run offline and don't
spend USDC. Run with:

    pip install "llama-index-tools-payclaw[test]"
    pytest
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from llama_index.tools.payclaw import (
    PayClawClient,
    PayClawToolSpec,
    payclaw_balance_tool,
    payclaw_history_tool,
    payclaw_pay_tool,
)
from llama_index.tools.payclaw.client import DEFAULT_BASE_URL, PayClawError

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

VALID_ADDRESS = "0x" + "1" * 40


@pytest.fixture(autouse=True)
def _set_token(monkeypatch):
    monkeypatch.setenv("PAYCLAW_API_TOKEN", "test-token")


# --- client --------------------------------------------------------------- #


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
    assert route.calls[0].request.headers["Authorization"] == "Bearer abc"


@respx.mock
async def test_client_pay_posts_json():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    client = PayClawClient(api_token="abc")
    out = await client.pay(to=VALID_ADDRESS, amount="0.05")
    assert out == SAMPLE_RECEIPT
    body = json.loads(route.calls[0].request.content)
    assert body == {"to": VALID_ADDRESS, "amount": "0.05"}


@respx.mock
async def test_client_raises_payclaw_error_on_4xx():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    client = PayClawClient(api_token="bad")
    with pytest.raises(PayClawError) as exc_info:
        await client.get_balance()
    assert exc_info.value.status == 401


# --- tool factories ------------------------------------------------------- #


def test_balance_tool_has_correct_metadata():
    tool = payclaw_balance_tool()
    assert tool.metadata.name == "payclaw_get_balance"
    assert "balance" in tool.metadata.description.lower()


def test_pay_tool_has_correct_metadata():
    tool = payclaw_pay_tool()
    assert tool.metadata.name == "payclaw_pay"
    assert "USDC" in tool.metadata.description


def test_history_tool_has_correct_metadata():
    tool = payclaw_history_tool()
    assert tool.metadata.name == "payclaw_get_history"


@respx.mock
async def test_balance_tool_returns_json_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(200, json=SAMPLE_BALANCE)
    )
    tool = payclaw_balance_tool()
    result = await tool.async_fn()
    assert isinstance(result, str)
    assert json.loads(result) == SAMPLE_BALANCE


@respx.mock
async def test_balance_tool_swallows_api_error_into_string():
    respx.get(f"{DEFAULT_BASE_URL}/api/gpt/balance").mock(
        return_value=httpx.Response(401, json={"error": "Invalid bearer token"})
    )
    tool = payclaw_balance_tool()
    result = await tool.async_fn()
    assert "401" in result
    assert "Invalid bearer token" in result


@respx.mock
async def test_pay_tool_happy_path():
    respx.post(f"{DEFAULT_BASE_URL}/api/gpt/pay").mock(
        return_value=httpx.Response(200, json=SAMPLE_RECEIPT)
    )
    tool = payclaw_pay_tool()
    result = await tool.async_fn(to=VALID_ADDRESS, amount="0.05")
    assert json.loads(result)["txHash"] == SAMPLE_RECEIPT["txHash"]


async def test_pay_tool_rejects_bad_address_as_string():
    tool = payclaw_pay_tool()
    result = await tool.async_fn(to="not-an-address", amount="0.05")
    assert "PayClaw input error" in result
    assert "0x-prefixed" in result


async def test_pay_tool_rejects_bad_amount_as_string():
    tool = payclaw_pay_tool()
    result = await tool.async_fn(to=VALID_ADDRESS, amount="five dollars")
    assert "PayClaw input error" in result
    assert "decimal string" in result


@respx.mock
async def test_history_tool_passes_limit():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/gpt/history").mock(
        return_value=httpx.Response(200, json=SAMPLE_HISTORY)
    )
    tool = payclaw_history_tool()
    result = await tool.async_fn(limit=5)
    assert json.loads(result) == SAMPLE_HISTORY
    assert route.calls[0].request.url.params["limit"] == "5"


async def test_history_tool_rejects_bad_limit():
    tool = payclaw_history_tool()
    result = await tool.async_fn(limit=999)
    assert "PayClaw input error" in result


# --- tool spec ------------------------------------------------------------ #


def test_tool_spec_returns_three_tools():
    spec = PayClawToolSpec()
    tools = spec.to_tool_list()
    assert len(tools) == 3
    names = {t.metadata.name for t in tools}
    assert names == {"payclaw_get_balance", "payclaw_pay", "payclaw_get_history"}
