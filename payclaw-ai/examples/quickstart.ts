/**
 * Minimal smoke test — exercises the three PayClaw tools without any LLM.
 *
 *     export PAYCLAW_API_TOKEN=...
 *     npx tsx examples/quickstart.ts
 */

import { payclawBalanceTool, payclawHistoryTool, payclawPayTool } from '../src/index.js'

async function main() {
  const balance = payclawBalanceTool()
  const history = payclawHistoryTool()
  const pay = payclawPayTool()

  console.log('--- balance ---')
  console.log(await balance.execute!({}, { toolCallId: 'x', messages: [] } as never))

  console.log('\n--- history (last 5) ---')
  console.log(await history.execute!({ limit: 5 }, { toolCallId: 'x', messages: [] } as never))

  // Uncomment to fire a real on-chain transfer (uses real USDC + 1% fee):
  // console.log('\n--- pay 0.01 USDC to burn address ---')
  // console.log(
  //   await pay.execute!(
  //     { to: '0x000000000000000000000000000000000000dEaD', amount: '0.01' },
  //     { toolCallId: 'x', messages: [] } as never,
  //   ),
  // )
  void pay
}

main().catch(console.error)
