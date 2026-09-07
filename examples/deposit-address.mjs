// Create a Smart Deposit Address and poll the deposits that arrive at it.
//
// Creating an address is a real, rate-limited write against your rhino.fi
// account — but it never moves funds and needs no signing key. The address is
// live immediately and is monitored long-term; see the README.
//
//   RHINO_API_KEY=<your key> RHINO_DESTINATION_ADDRESS=0x… node examples/deposit-address.mjs

import RhinofiProtocol from '@rhino.fi/wdk-protocol-sda-rhinofi'

const SOURCE_CHAIN = 'ARBITRUM'

const sda = new RhinofiProtocol(undefined, {
  apiKey: process.env.RHINO_API_KEY
})

// One descriptor per source chain. All source chains must be the same family.
const [deposit] = await sda.createDepositAddress({
  sourceChains: [SOURCE_CHAIN],
  destinationChain: 'BASE',
  outputAsset: 'USDT',
  destinationAddress: process.env.RHINO_DESTINATION_ADDRESS,
  addressNote: 'example-user-1'
})

console.log(`Send any of ${deposit.supportedInputTokens.map((token) => token.symbol).join(', ')}`)
console.log(`on ${SOURCE_CHAIN} to: ${deposit.address}`)
console.log(`It will be delivered as ${deposit.outputAsset?.token} to ${deposit.destinationAddress}`)

// Stellar addresses are muxed; clients that cannot send to one deposit to the
// base address and must set the memo.
if (deposit.chainMetadata) {
  console.log(`Or to ${deposit.chainMetadata.baseAddress} with memo ${deposit.chainMetadata.memoId}`)
}

// Keep this id — it round-trips the chain rhino.fi keys the address by.
console.log(`\nAddress id: ${deposit.id}`)

const transfers = await sda.getTransfers(deposit.address, { sourceChain: SOURCE_CHAIN })
if (transfers.length === 0) {
  console.log('\nNo deposits yet.')
} else {
  console.log('\nDeposits so far:')
  for (const transfer of transfers) {
    console.log(`  ${transfer.status.padEnd(15)} ${transfer.amount ?? '?'} ${transfer.token ?? ''} (${transfer.id})`)
  }
}

// Stop accepting deposits. Reversible via sda.enableDepositAddress(deposit.id).
// await sda.disableDepositAddress(deposit.id)
