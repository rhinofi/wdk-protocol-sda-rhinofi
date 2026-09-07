// Discover the Smart Deposit Address routes into a destination chain, then
// fetch a (non-binding) estimate of what one deposit would deliver.
//
// Read-only: nothing here creates an address or moves funds, and no wallet
// account is needed at all — only an API key.
//
//   RHINO_API_KEY=<your key> \
//   RHINO_DEPOSITOR_ADDRESS=0x… \
//   RHINO_DESTINATION_ADDRESS=0x… \
//     node examples/discover-and-quote.mjs

import RhinofiProtocol from '@rhino.fi/wdk-protocol-sda-rhinofi'

const sda = new RhinofiProtocol(undefined, {
  apiKey: process.env.RHINO_API_KEY
})

// Naming the source chain keeps this to a single request. Omit it and every
// deposit-enabled chain is queried instead.
const routes = await sda.getSupportedRoutes({
  sourceChain: 'ARBITRUM',
  destinationChain: 'BASE',
  outputAsset: 'USDT'
})

for (const route of routes) {
  console.log(`${route.sourceChains.join('/')} -> ${route.destinationChain} as ${route.outputAsset?.token}`)
  for (const token of route.inputTokens) {
    console.log(`  accepts ${token.symbol} ($${token.minDepositLimitUsd} – $${token.maxDepositLimitUsd})`)
  }
}

const quote = await sda.quoteDeposit({
  sourceChain: 'ARBITRUM',
  inputToken: 'USDC',
  destinationChain: 'BASE',
  outputAsset: 'USDT',
  inputAmount: 1_000_000_000n, // 1,000 USDC (6 decimals)
  // Naming both addresses is what makes the quote reflect your account's fees.
  depositor: process.env.RHINO_DEPOSITOR_ADDRESS,
  destinationAddress: process.env.RHINO_DESTINATION_ADDRESS
})

console.log(`\nDepositing ${quote.inputAmount} ${quote.inputToken} delivers ~${quote.outputAmount} ${quote.outputAsset}`)
console.log(`Rate: ${quote.rate}`)
for (const fee of quote.fees) {
  console.log(`  ${fee.type} fee: ${fee.amount} ${fee.token}${fee.chain ? ` on ${fee.chain}` : ''} — ${fee.description}`)
}
