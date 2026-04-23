/**
 * @grip-labs/payclaw-openclaw — PayClaw as a native OpenClaw plugin.
 *
 * Registers three tools that any OpenClaw agent can call:
 *   - payclaw_pay      → send USDC on Base mainnet
 *   - payclaw_balance  → read agent wallet's USDC + ETH balance
 *   - payclaw_history  → list recent USDC transfers in/out
 *
 * Wraps the @grip-labs/payclaw SDK. Each agent gets its own auto-provisioned
 * EOA keyed by agentId; the wallet keystore is encrypted on disk under
 * ~/.openclaw/agents/{agentId}/payclaw-wallet.json (chmod 600), never sent
 * off-device.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { jsonResult, readStringParam, readNumberParam } from "openclaw/plugin-sdk/channel-actions";
import { Type } from "@sinclair/typebox";
import {
  pay,
  balance,
  history,
  PayClawError,
  type PayClawConfig,
} from "@grip-labs/payclaw";

// ────────────────────────────────────────────────────────────────────────────
// Helpers

function configFromApi(api: any): Partial<PayClawConfig> | undefined {
  // OpenClaw passes plugin config through api.config. Map fields we care about.
  const cfg = api?.config ?? {};
  const out: Partial<PayClawConfig> = {};
  if (typeof cfg.rpcUrl === "string") out.rpcUrl = cfg.rpcUrl;
  if (typeof cfg.usdcAddress === "string") out.usdcAddress = cfg.usdcAddress;
  if (typeof cfg.feeRecipient === "string") out.feeRecipient = cfg.feeRecipient;
  if (typeof cfg.feeBps === "number") out.feeBps = cfg.feeBps;
  if (typeof cfg.dailyCapUsdc === "number") out.dailyCapUsdc = cfg.dailyCapUsdc;
  if (Array.isArray(cfg.recipientWhitelist) && cfg.recipientWhitelist.length > 0) {
    out.recipientWhitelist = cfg.recipientWhitelist as string[];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveAgentIdFromContext(rawParams: Record<string, unknown>, fallback?: string): string | undefined {
  const passed = readStringParam(rawParams, "agentId") || undefined;
  return passed ?? fallback ?? process.env.OPENCLAW_AGENT_ID ?? process.env.AGENT_ID ?? undefined;
}

function errorPayload(err: unknown) {
  if (err instanceof PayClawError) {
    return { error: err.code, message: err.message };
  }
  return { error: "UNEXPECTED", message: err instanceof Error ? err.message : String(err) };
}

// ────────────────────────────────────────────────────────────────────────────
// Tools

function createPayTool(api: any) {
  return {
    name: "payclaw_pay",
    label: "PayClaw Send",
    description:
      "Send USDC from this agent's wallet to a 0x address on Base mainnet. " +
      "Charges 1% take rate. Auto-provisions the agent wallet on first call. " +
      "Subject to a daily spending cap and optional recipient whitelist.",
    parameters: Type.Object(
      {
        to: Type.String({
          description: "Recipient address (0x...) on Base mainnet",
          pattern: "^0x[a-fA-F0-9]{40}$",
        }),
        amount: Type.String({
          description: "Amount in USDC as decimal string (min 0.01), e.g. '1.50'",
          pattern: "^\\d+(\\.\\d+)?$",
        }),
        memo: Type.Optional(
          Type.String({
            description: "Optional human-readable memo (off-chain only in v0.1)",
            maxLength: 280,
          }),
        ),
        agentId: Type.Optional(
          Type.String({
            description: "Override agent id (defaults to OPENCLAW_AGENT_ID env)",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const to = readStringParam(rawParams, "to", { required: true });
        const amount = readStringParam(rawParams, "amount", { required: true });
        const memo = readStringParam(rawParams, "memo") || undefined;
        const agentId = resolveAgentIdFromContext(rawParams);
        const config = configFromApi(api);
        const receipt = await pay({ to, amount, memo, agentId, config });
        return jsonResult(receipt);
      } catch (err) {
        return jsonResult(errorPayload(err));
      }
    },
  };
}

function createBalanceTool(api: any) {
  return {
    name: "payclaw_balance",
    label: "PayClaw Balance",
    description:
      "Returns this agent's wallet address, current USDC balance, and a Basescan " +
      "link. Auto-provisions the wallet on first call — useful to obtain the " +
      "funding address for a freshly-installed agent. Gas is paid in USDC via " +
      "Circle Paymaster, so the agent never needs ETH.",
    parameters: Type.Object(
      {
        agentId: Type.Optional(
          Type.String({
            description: "Override agent id (defaults to OPENCLAW_AGENT_ID env)",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const agentId = resolveAgentIdFromContext(rawParams);
        const config = configFromApi(api);
        const bal = await balance({ agentId, config });
        return jsonResult(bal);
      } catch (err) {
        return jsonResult(errorPayload(err));
      }
    },
  };
}

function createHistoryTool(api: any) {
  return {
    name: "payclaw_history",
    label: "PayClaw History",
    description:
      "Returns the most recent USDC Transfer events touching this agent's wallet " +
      "(in, out, or both) over the last ~55 hours of Base history.",
    parameters: Type.Object(
      {
        limit: Type.Optional(
          Type.Number({
            description: "Max number of transactions (1-100, default 20)",
            minimum: 1,
            maximum: 100,
          }),
        ),
        direction: Type.Optional(
          Type.Unsafe<"out" | "in" | "all">({
            type: "string",
            enum: ["out", "in", "all"],
            description: "Filter by direction (default: all)",
          }),
        ),
        agentId: Type.Optional(
          Type.String({
            description: "Override agent id (defaults to OPENCLAW_AGENT_ID env)",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const limit = readNumberParam(rawParams, "limit", { integer: true }) ?? undefined;
        const direction = (readStringParam(rawParams, "direction") || undefined) as
          | "out"
          | "in"
          | "all"
          | undefined;
        const agentId = resolveAgentIdFromContext(rawParams);
        const config = configFromApi(api);
        const txs = await history({ limit, direction, agentId, config });
        return jsonResult({ transactions: txs });
      } catch (err) {
        return jsonResult(errorPayload(err));
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin entry

export default definePluginEntry({
  id: "payclaw",
  name: "PayClaw",
  description:
    "Give this OpenClaw agent its own wallet on Base mainnet. " +
    "USDC-native, 1% flat take rate, auto-provisioned, on-chain settlement.",
  register(api) {
    api.registerTool(createPayTool(api));
    api.registerTool(createBalanceTool(api));
    api.registerTool(createHistoryTool(api));
  },
});
