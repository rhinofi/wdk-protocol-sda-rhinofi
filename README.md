# @rhino.fi/wdk-protocol-sda-rhinofi

WDK module for Rhino.fi Smart Deposit Addresses: generate one address per user and let Rhino.fi handle chain detection, routing and settlement.

A **Smart Deposit Address** (SDA) is an address rhino.fi issues on a source
chain. Any supported token sent to it is swept, converted, and delivered to a
fixed destination chain and address. The depositor needs no rhino.fi account and
signs nothing beyond an ordinary transfer, so this module **never touches
private keys and never broadcasts a transaction**. It only talks to the rhino.fi
API.

That makes it a fit for any product where users arrive with stablecoins on the
wrong chain:

- Exchanges and custodial platforms accepting deposits from end users
- DeFi protocols onboarding liquidity from multiple chains
- Neobanks and payment processors that need predictable, compliant settlement

## Installation

```bash
npm install @rhino.fi/wdk-protocol-sda-rhinofi
```

## Usage

```javascript
import RhinofiProtocol from '@rhino.fi/wdk-protocol-sda-rhinofi'

// Your WDK wallet account, from your wallet manager. It is optional - its
// address is the default delivery destination — and read-only is enough,
// since nothing here signs. Pass `undefined` to run unbound.
const sda = new RhinofiProtocol(account, { apiKey: process.env.RHINO_API_KEY })

// Which source chains can deliver USDT to Base, and what do they accept?
const routes = await sda.getSupportedRoutes({
  destinationChain: 'BASE',
  outputAsset: 'USDT'
})

// Optional: a non-binding estimate of what a deposit would deliver, priced
// against your account's fees.
const quote = await sda.quoteDeposit({
  sourceChain: 'ARBITRUM',
  inputToken: 'USDC',
  destinationChain: 'BASE',
  outputAsset: 'USDT',
  inputAmount: 1_000_000_000n, // 1,000 USDC, in base units
  depositor: '0x…',
  destinationAddress: '0x…'
})
console.log(quote.outputAmount, quote.fees)

// Issue the address the user funds. One entry per source chain.
// `webhookUrl` is where deposit events for this address get posted.
const [deposit] = await sda.createDepositAddress({
  sourceChains: ['ARBITRUM'],
  destinationChain: 'BASE',
  outputAsset: 'USDT',
  destinationAddress: '0x…',
  webhookUrl: 'https://your-app.example/rhino-webhook'
})
console.log('Send funds to:', deposit.address)

// Reconcile, or check on demand. Prefer webhooks for live updates.
const transfers = await sda.getTransfers(deposit.address, { sourceChain: 'ARBITRUM' })
```

Chains are named with rhino.fi keys (`'ARBITRUM'`, `'BASE'`, …) or numeric chain
ids (`42161`), and amounts are always **base units** (`bigint`), never decimals.

### Tracking deposits

Deposits are pushed, not polled. Set `webhookUrl` when creating an address (or
configure one project-wide in the rhino.fi Console) and rhino.fi posts an event
for every step: `BRIDGE_PENDING`, `BRIDGE_ACCEPTED`, `BRIDGE_EXECUTED`,
`DEPOSIT_ADDRESS_BRIDGE_REJECTED`, `DEPOSIT_ADDRESS_BRIDGE_DELAYED` and
`SDA_REFUND_COMPLETED`. Events are signed - verify them against the public key
from `GET https://api.rhino.fi/webhook/public-key` before trusting one. See the
[webhook docs](https://docs.rhino.fi/webhook/events-list).

`getTransfers` is then for reconciliation and on-demand lookups rather than the
primary path. It reads an address's history window. rhino.fi serves history
from a time window rather than an offset: the window may sit anywhere in the past but cannot span more than 31
days, so reaching an older deposit means moving it rather than widening it — a
wider or inverted window is rejected with a `ValueError` before any request.

```javascript
// Defaults to the last 31 days — the widest rhino.fi allows.
await sda.getTransfers(deposit.address, { sourceChain: 'ARBITRUM' })

// Move the window for older deposits. getTransfer takes the same option.
await sda.getTransfers(deposit.address, {
  sourceChain: 'ARBITRUM',
  fromTimestamp: new Date('2026-01-01'),
  toTimestamp: new Date('2026-01-20')
})
```

rhino.fi exposes no lookup by deposit id — its bridge-status endpoint explicitly
does not cover Smart Deposit Address activity — so `getTransfer(id)` searches the
same window.

## How rhino.fi maps onto the WDK SDA interface

| Trait | rhino.fi behaviour |
| --- | --- |
| Custody | **Trusted-operator.** rhino.fi issues and sweeps the address; it is not derived client-side. |
| Activation | Live the moment it is created; monitored for ten years. |
| Reuse | Every address accepts repeat deposits (`reusable: true`). |
| Route discovery | Per source/destination chain pair, so `destinationChain` is required. |
| Deposit limits | Enforced in **USD**, per token - see below. |

Four optional interface methods are therefore **not implemented**, and inherit
the base class's `UnsupportedOperationError`:

- `deriveDepositAddress` — addresses are not client-derivable under a
  trusted-operator model.
- `renewDepositAddress` — there is no activation to renew.
- `recoverDepositAddress` — rhino.fi exposes no deposit-reindex endpoint.
- `getTransfersByRecipient` — rhino.fi has no per-recipient history yet

### Identifiers round-trip their chain

rhino.fi keys addresses by `(address, chain)` and exposes deposits only per
address, so this module issues composite identifiers:

- `SdaDepositAddress.id` → `"<chain>:<address>"`
- `SdaTransfer.id` → `"<chain>:<address>:<depositId>"`

Pass them back verbatim; don't build them by hand.

### Deposit limits are in USD

The WDK `SdaRoute.limits` field is denominated in the input token's base unit,
and the interface says a protocol enforcing limits in another denomination
should omit it rather than convert. rhino.fi enforces USD bounds, so `limits` is
omitted and each token instead carries `minDepositLimitUsd` /
`maxDepositLimitUsd`:

```javascript
const [route] = await sda.getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })
route.inputTokens[0] // { token: 'USDC', decimals: 6, minDepositLimitUsd: 10, maxDepositLimitUsd: 100000, … }
```

### Transfer status

`status` is derived from rhino.fi's deposit history alone:

| rhino.fi state | `SdaTransferStatus` |
| --- | --- |
| Deposit seen in the mempool | `detected` |
| Confirming, or bridge in flight | `processing` |
| Bridge executed | `completed` |
| Bridge failed after acceptance | `failed` |
| Deposit rejected | `refund-pending` |

The history does not record the refund itself, so a rejected deposit stays
`refund-pending` here; the `SDA_REFUND_COMPLETED` webhook event is how you learn
the funds went back.

Transfers also carry the rhino.fi details the WDK type omits: `amount`,
`amountUsd`, `token`, `sender`, `txHash` and `reason`.

### Stellar deposits

For Stellar, the deposit address is a muxed (`M…`) address. Clients that cannot
send to one should use `chainMetadata` instead:

```javascript
deposit.chainMetadata // { _tag: 'STELLAR', baseAddress: 'G…', memoId: '123…' }
```

Deposit to `baseAddress` **with** `memoId` set, or rhino.fi cannot attribute the
deposit.

## API Reference

### `new RhinofiProtocol(account?, config)`

- `account` — a WDK wallet account, optional. Only its address is read, so a
  read-only account works. Without one, every call needs an explicit
  `destinationAddress`.
- `config.apiKey` — **required**; every SDA request is authenticated.
- `config.apiBaseUrl` — override the rhino.fi API base URL (default: mainnet).
- `config.configTtlMs` — how long the chain config and per-route token lists are
  cached, in ms (default: `60000`; `0` disables caching).

### Methods

| Method | Purpose |
| --- | --- |
| `getSupportedRoutes(options)` | Source chains, accepted tokens and delivered asset for a destination. `destinationChain` required. |
| `quoteDeposit(options)` | Non-binding estimate of what a deposit would deliver, priced as an SDA transaction against your account's fees. |
| `createDepositAddress(options)` | Issue addresses; one per source chain. |
| `getDepositAddress(id)` | Look one up by its `id`. |
| `getTransfers(address, options)` | Deposits seen at an address. `options.sourceChain` required. |
| `getTransfer(id, options)` | A single deposit by its `id`, within a history window. |
| `disableDepositAddress(id)` | Stop accepting deposits (a reversible pause). |
| `enableDepositAddress(id)` | Resume accepting deposits. Not part of the WDK interface. |

`createDepositAddress` also accepts rhino.fi-specific options: `addressNote`,
`refundAddress`, `webhookUrl`, `reusePolicy` and `bridgeIfNotSwappable`.

`quoteDeposit` requires `depositor` and `destinationAddress`. They make the
quote account-specific, so it reflects your negotiated fees rather than standard
rates. rhino.fi validates the depositor against `sourceChain` and the
destination against `destinationChain`.

### Performance notes

- `getSupportedRoutes` **without** `sourceChain` queries every deposit-enabled
  chain - one request each. Pass `sourceChain` when you know it. A chain that
  fails is skipped rather than failing the call, unless every chain fails, which
  throws rather than reporting an outage as an empty list. A named `sourceChain`
  that fails always throws.
- `getTransfers` reads one address and one window per call. Prefer a
  `webhookUrl` over polling when you only need to know that a deposit landed.

## Errors

All errors extend `RhinofiProtocolError`:

| Error | Raised when |
| --- | --- |
| `ConfigurationError` | No `apiKey` was configured. |
| `ValueError` | An argument is missing or malformed — always before any network call. |
| `UnsupportedChainError` | The chain is unknown to rhino.fi, or has SDAs disabled. |
| `UnsupportedTokenError` | The token is not listed on that chain. |
| `NoSuchElementError` | No such deposit address or transfer. |
| `SdaExecutionError` | rhino.fi rejected the request. `code` carries the rhino.fi failure tag. |

```javascript
import { SdaExecutionError } from '@rhino.fi/wdk-protocol-sda-rhinofi'

try {
  await sda.createDepositAddress(options)
} catch (error) {
  if (error instanceof SdaExecutionError && error.code === 'DepositAddressRateLimitExceeded') {
    // back off and retry later
  }
}
```

## Development

```bash
npm install
npm test
npm run lint
```

## License

Apache-2.0
