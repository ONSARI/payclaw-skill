"""Thin sync HTTP client for the PayClaw REST API.

CrewAI tools are sync by default, so this client only exposes a sync surface.
The package exposes high-level CrewAI tools in :mod:`crewai_payclaw.tools`
that wrap this client.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_BASE_URL = "https://www.payclaw.me"
DEFAULT_TIMEOUT_S = 60.0  # /pay can take 20-40s for first deploy + UserOp


class PayClawError(Exception):
    """Raised when the PayClaw API returns a non-2xx response."""

    def __init__(self, status: int, error: str, detail: str | None = None) -> None:
        self.status = status
        self.error = error
        self.detail = detail
        msg = f"[{status}] {error}"
        if detail:
            msg += f" — {detail}"
        super().__init__(msg)


class PayClawClient:
    """HTTP client for the PayClaw REST API.

    Parameters
    ----------
    api_token:
        Bearer token. If omitted, reads ``PAYCLAW_API_TOKEN`` from env.
    base_url:
        Override the API host. Defaults to ``https://www.payclaw.me``.
    timeout:
        Per-request timeout in seconds.
    """

    def __init__(
        self,
        api_token: str | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        token = api_token or os.environ.get("PAYCLAW_API_TOKEN")
        if not token:
            raise ValueError(
                "PayClaw API token missing. Pass `api_token=...` or set "
                "PAYCLAW_API_TOKEN in the environment."
            )
        self._token = token
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError:
            payload = {"error": response.text or "Non-JSON response"}
        if response.is_success:
            return payload
        raise PayClawError(
            status=response.status_code,
            error=payload.get("error", "Unknown error"),
            detail=payload.get("detail"),
        )

    def get_balance(self) -> dict[str, Any]:
        """Read the agent wallet's USDC balance and address."""
        with httpx.Client(timeout=self._timeout) as client:
            r = client.get(f"{self._base_url}/api/gpt/balance", headers=self._headers)
        return self._raise_for_status(r)

    def pay(self, to: str, amount: str) -> dict[str, Any]:
        """Send USDC to ``to``. ``amount`` is a decimal string (e.g. ``"0.05"``)."""
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(
                f"{self._base_url}/api/gpt/pay",
                headers=self._headers,
                json={"to": to, "amount": amount},
            )
        return self._raise_for_status(r)

    def get_history(self, limit: int = 10) -> dict[str, Any]:
        """List recent USDC transfers (in + out) for the agent wallet."""
        with httpx.Client(timeout=self._timeout) as client:
            r = client.get(
                f"{self._base_url}/api/gpt/history",
                headers=self._headers,
                params={"limit": limit},
            )
        return self._raise_for_status(r)
