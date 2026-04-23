/**
 * Unit tests for @grip-labs/payclaw-ai.
 *
 * Mocks ``fetch`` so tests run offline and don't spend USDC.
 *
 *     npm test
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import {
  PayClawClient,
  PayClawError,
  createPayClawTools,
  payclawBalanceTool,
  payclawHistoryTool,
  payclawPayTool,
} from '../src/index.js'

const SAMPLE_BALANCE = {
  address: '0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740',
  signerAddress: '0x7371d193516BAb191fE99d7149Ed47f8bCBd42f7',
  usdc: '2.01',
  usdcRaw: '2010000',
  chain: 'base-mainnet',
  explorer: 'https://basescan.org/address/0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740',
}

const SAMPLE_RECEIPT = {
  txHash: '0xa36a000000000000000000000000000000000000000000000000000000004528',
  status: 'confirmed',
  amountSent: '0.05',
  feeCharged: '0.0005',
  gasPaidInUsdc: '0.0123',
  smartAccountAddress: '0x567849BBEB2da9475F3EB0871Ad7C4CeA8738740',
  explorer: 'https://basescan.org/tx/0xa36a',
}

const SAMPLE_HISTORY = {
  transactions: [
    {
      direction: 'in',
      counterparty: '0x0000000000000000000000000000000000000001',
      amount: '1.0',
      txHash: '0xabc',
      blockNumber: 1,
      explorer: 'https://basescan.org/tx/0xabc',
    },
  ],
}

const VALID_ADDRESS = '0x' + '1'.repeat(40)

let originalFetch: typeof fetch

function mockFetchOnce(response: { status: number; body: unknown }) {
  globalThis.fetch = mock.fn(async () => {
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  originalFetch = globalThis.fetch
  process.env.PAYCLAW_API_TOKEN = 'test-token'
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- client --------------------------------------------------------------- //

describe('PayClawClient', () => {
  it('throws when token is missing', () => {
    delete process.env.PAYCLAW_API_TOKEN
    assert.throws(() => new PayClawClient(), /PAYCLAW_API_TOKEN/)
  })

  it('sends bearer token on getBalance', async () => {
    const fetchMock = mock.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization
      assert.equal(auth, 'Bearer abc')
      return new Response(JSON.stringify(SAMPLE_BALANCE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const client = new PayClawClient({ apiToken: 'abc' })
    const out = await client.getBalance()
    assert.deepEqual(out, SAMPLE_BALANCE)
  })

  it('posts JSON body on pay', async () => {
    const fetchMock = mock.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      assert.deepEqual(body, { to: VALID_ADDRESS, amount: '0.05' })
      return new Response(JSON.stringify(SAMPLE_RECEIPT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const client = new PayClawClient({ apiToken: 'abc' })
    const out = await client.pay({ to: VALID_ADDRESS, amount: '0.05' })
    assert.equal(out.txHash, SAMPLE_RECEIPT.txHash)
  })

  it('throws PayClawError on 4xx', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Invalid bearer token' } })
    const client = new PayClawClient({ apiToken: 'bad' })
    await assert.rejects(
      () => client.getBalance(),
      (err: unknown) => err instanceof PayClawError && err.status === 401,
    )
  })
})

// --- tools ---------------------------------------------------------------- //

describe('payclawBalanceTool', () => {
  it('returns balance object via execute', async () => {
    mockFetchOnce({ status: 200, body: SAMPLE_BALANCE })
    const t = payclawBalanceTool()
    const result = await t.execute!({}, { toolCallId: 'x', messages: [] } as unknown as never)
    assert.deepEqual(result, SAMPLE_BALANCE)
  })

  it('returns formatted error string on 401', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Invalid bearer token' } })
    const t = payclawBalanceTool()
    const result = await t.execute!({}, { toolCallId: 'x', messages: [] } as unknown as never)
    assert.equal(typeof result, 'string')
    assert.match(result as string, /401/)
    assert.match(result as string, /Invalid bearer token/)
  })
})

describe('payclawPayTool', () => {
  it('returns receipt object via execute', async () => {
    mockFetchOnce({ status: 200, body: SAMPLE_RECEIPT })
    const t = payclawPayTool()
    const result = await t.execute!(
      { to: VALID_ADDRESS, amount: '0.05' },
      { toolCallId: 'x', messages: [] } as unknown as never,
    )
    assert.equal((result as typeof SAMPLE_RECEIPT).txHash, SAMPLE_RECEIPT.txHash)
  })

  it('inputSchema rejects bad address', () => {
    const t = payclawPayTool()
    const parsed = (t.inputSchema as { safeParse: (v: unknown) => { success: boolean; error?: unknown } }).safeParse({
      to: 'not-an-address',
      amount: '0.05',
    })
    assert.equal(parsed.success, false)
  })

  it('inputSchema rejects bad amount', () => {
    const t = payclawPayTool()
    const parsed = (t.inputSchema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
      to: VALID_ADDRESS,
      amount: 'five dollars',
    })
    assert.equal(parsed.success, false)
  })
})

describe('payclawHistoryTool', () => {
  it('passes limit query param', async () => {
    let capturedUrl = ''
    globalThis.fetch = mock.fn(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify(SAMPLE_HISTORY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const t = payclawHistoryTool()
    const out = await t.execute!({ limit: 5 }, { toolCallId: 'x', messages: [] } as unknown as never)
    assert.deepEqual(out, SAMPLE_HISTORY)
    assert.match(capturedUrl, /limit=5/)
  })
})

describe('createPayClawTools', () => {
  it('returns three tools with conventional keys', () => {
    const tools = createPayClawTools()
    assert.ok('payclaw_get_balance' in tools)
    assert.ok('payclaw_pay' in tools)
    assert.ok('payclaw_get_history' in tools)
  })
})
