# @rhino.fi/wdk-protocol-sda-rhinofi

[![Built with WDK](./assets/built-with-wdk.png)](https://docs.wdk.tether.io)

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

## WDK compatibility

`RhinofiProtocol` implements `ISdaProtocol` from
[`@tetherto/wdk-wallet`](https://github.com/tetherto/wdk-wallet) by extending
its `SdaProtocol` base class, and throws that package's error types.

| | `@tetherto/wdk-wallet` |
| --- | --- |
| Supported range | `>=1.0.0-beta.17 <1.0.0` - `beta.17` is the first release with the `SdaError` this module throws |
| Built and tested against | `1.0.0-beta.19`, which this package pins as a dependency |

To match error classes with `instanceof` when your app resolves a different
`@tetherto/wdk-wallet` copy than this package, import them from this package -
it re-exports every class it throws.

## Installation

```bash
npm install @rhino.fi/wdk-protocol-sda-rhinofi
```

Every call needs a rhino.fi API key (`config.apiKey`), and talks to the live
rhino.fi API - see [Examples](#examples) for what each key type can do before
running anything.

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
  inputToken: 'USDT',
  destinationChain: 'BASE',
  outputAsset: 'USDT',
  inputAmount: 1_000_000_000n, // 1,000 USDT, in base units
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
route.inputTokens[0] // { token: 'USDT', decimals: 6, minDepositLimitUsd: 10, maxDepositLimitUsd: 100000, … }
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
| Any state this module does not recognize | `pending` |

`pending` is the WDK non-terminal fallback: a state rhino.fi adds later is
reported as `pending` rather than guessed at, so never treat `pending` as
final.

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

Every error is a WDK error: each one is, or extends, a class from
`@tetherto/wdk-wallet`, and all of them extend `WdkError`. This package
re-exports the WDK classes it throws (`WdkError`, `ValueError`,
`NoSuchElementError`, `SdaError`, `SdaErrorReason`, `ProviderError`,
`ProviderErrorReason`).

| Error | WDK type | Raised when |
| --- | --- | --- |
| `ValueError` | `ValueError` itself | An argument is missing or malformed — always before any network call. |
| `ConfigurationError` | extends `ValueError` | No `apiKey` was configured. |
| `NoSuchElementError` | `NoSuchElementError` itself | No such deposit address or transfer. |
| `UnsupportedChainError` | extends `SdaError`, `reason: ROUTE_NOT_SUPPORTED` | The chain is unknown to rhino.fi, or has SDAs disabled. `chain` names it. |
| `UnsupportedTokenError` | extends `SdaError`, `reason: ROUTE_NOT_SUPPORTED` | The token is not listed on that chain. `token` and `chain` name it. |
| `SdaExecutionError` | extends `ProviderError` | The rhino.fi request failed. `code` carries the rhino.fi failure tag. |
| `UnsupportedOperationError` | `UnsupportedOperationError` itself | One of the four unimplemented optional methods was called. |

`SdaExecutionError.reason` is a WDK `ProviderErrorReason` when one applies:
`NETWORK_ERROR` (the request never got a response), `UNAUTHORIZED` (the API key
was rejected), `FORBIDDEN` (Smart Deposit Addresses are not enabled for the
key), `REQUEST_TIMEOUT` or `INTERNAL_SERVER_ERROR`. It is `undefined` when
rhino.fi rejected the request for a reason WDK has no category for, such as a
rate limit - read `code` then.

```javascript
import { ProviderErrorReason, SdaExecutionError } from '@rhino.fi/wdk-protocol-sda-rhinofi'

try {
  await sda.createDepositAddress(options)
} catch (error) {
  if (error instanceof SdaExecutionError && error.code === 'DepositAddressRateLimitExceeded') {
    // back off and retry later
  } else if (error instanceof SdaExecutionError && error.reason === ProviderErrorReason.UNAUTHORIZED) {
    // the API key was rejected
  }
}
```

## Known limitations

- **Deposit limits are USD-only.** rhino.fi enforces limits in USD, so
  `SdaRoute.limits` is never set. Read `minDepositLimitUsd` /
  `maxDepositLimitUsd` on each input token instead.
- **`destinationAddress` can be absent.** rhino.fi withholds it from standard
  API keys, so `SdaDepositAddress.destinationAddress` is only populated when the
  module runs with a `SECRET_` key. Don't assume the field is always present.
- **`getTransfer` is a window search, not an id lookup.** rhino.fi has no lookup
  by deposit id, so `getTransfer(id)` scans one history window (31 days at most,
  the last 31 days by default) and throws `NoSuchElementError` for a deposit
  outside it. Pass `fromTimestamp` / `toTimestamp` to reach older deposits.
- **Refund completion is webhook-only.** The history never records the refund, so
  a rejected deposit stays `refund-pending` and `refunded` is never returned.
  The `SDA_REFUND_COMPLETED` webhook event is the only signal that funds went
  back.
- **Unrecognized statuses map to `pending`.** See
  [Transfer status](#transfer-status).
- **No Bare or testnet evidence yet.** The test suite runs under Node with the
  rhino.fi SDK mocked. The Bare entry point (`bare.js`) is shipped but not
  exercised by any automated test, and nothing has been run against a testnet:
  the default API and both examples are rhino.fi mainnet.

## Examples

Runnable scripts live in [`examples/`](./examples). Read this before running
one:

- **`RHINO_API_KEY` is required.** The constructor throws `ConfigurationError`
  without it.
- **The key type decides what works.** A standard key covers
  `getSupportedRoutes`, `quoteDeposit`, `createDepositAddress` and
  `getDepositAddress`, and is safe client-side. `getTransfers`, `getTransfer`,
  `disableDepositAddress` and `enableDepositAddress` need a `SECRET_` key, which
  must stay server-side. Only a `SECRET_` key reads `destinationAddress` back.
- **They hit live rhino.fi.** Both scripts call the mainnet API - there is no
  sandbox. `discover-and-quote.mjs` is read-only. `deposit-address.mjs` performs
  a real, rate-limited write: it creates an address on your account that is live
  immediately and delivers anything sent to it. Neither script moves funds.
- **Runtime.** The scripts are Node ES modules and need Node 20.6+ for
  `--env-file`. Under Bare, the `bare` export condition loads `bare.js`, which
  installs `bare-node-runtime`; the examples themselves have only been run under
  Node. Bundlers need ESM support and must honour the `exports` conditions - the
  import attributes in `bare.js` are only reached under the `bare` condition.

| Script | Needs | Key |
| --- | --- | --- |
| [`discover-and-quote.mjs`](./examples/discover-and-quote.mjs) | `RHINO_API_KEY`, `RHINO_DEPOSITOR_ADDRESS`, `RHINO_DESTINATION_ADDRESS` | standard |
| [`deposit-address.mjs`](./examples/deposit-address.mjs) | `RHINO_API_KEY`, `RHINO_DESTINATION_ADDRESS` | standard to create; `SECRET_` for the transfer listing at the end |

```bash
cp examples/.env.example examples/.env   # then fill it in
node --env-file=examples/.env examples/discover-and-quote.mjs
node --env-file=examples/.env examples/deposit-address.mjs
```

## Support

- Integration help: your rhino.fi account representative, and the
  [rhino.fi docs](https://docs.rhino.fi).
- Bugs in this module: [GitHub issues](https://github.com/rhinofi/wdk-protocol-sda-rhinofi/issues).
- Security reports: **security@rhino.fi** - see [SECURITY.md](./SECURITY.md).

## Development

```bash
npm install
npm test
npm run lint
```

## License

Apache-2.0
