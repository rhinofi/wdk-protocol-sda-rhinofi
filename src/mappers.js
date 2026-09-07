// Copyright 2026 Rhino.fi
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { Decimal as BaseDecimal } from 'decimal.js'

import { UnsupportedChainError, UnsupportedTokenError, ValueError } from './errors.js'

const Decimal = BaseDecimal.clone({ precision: 60 })

/**
 * Separates the chain, address and (for transfers) bridge id inside the
 * composite identifiers this module issues. rhino.fi keys Smart Deposit
 * Addresses by (address, chain), so the chain has to round-trip through
 * `SdaDepositAddress.id` and `SdaTransfer.id`.
 *
 * @type {string}
 */
const ID_SEPARATOR = ':'

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaToken} SdaToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaFee} SdaFee */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositQuote} SdaDepositQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositAddress} SdaDepositAddress */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfer} SdaTransfer */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransferStatus} SdaTransferStatus */

/** @typedef {import('@rhino.fi/sdk').BridgeConfig} BridgeConfig */
/** @typedef {import('@rhino.fi/sdk').ChainConfig} ChainConfig */
/** @typedef {import('@rhino.fi/sdk').TokenConfig} TokenConfig */

/**
 * A rhino.fi chain key paired with its bridge-config entry.
 *
 * @typedef {Object} ChainEntry
 * @property {string} key - The rhino.fi chain key (e.g. 'ARBITRUM'), as used in every SDA call.
 * @property {ChainConfig} entry - The chain's bridge-config entry.
 */

/** @typedef {import('./types.js').RhinofiSdaToken} RhinofiSdaToken */
/** @typedef {import('./types.js').RhinofiChainMetadata} RhinofiChainMetadata */
/** @typedef {import('./types.js').RhinofiSdaDepositAddress} RhinofiSdaDepositAddress */
/** @typedef {import('./types.js').RhinofiSdaTransfer} RhinofiSdaTransfer */

/**
 * The entry the rhino.fi SDA API returns for each token a deposit address accepts.
 *
 * @typedef {Object} RhinofiSupportedToken
 * @property {string} symbol - The token ticker, e.g. 'USDC'.
 * @property {string} address - The token's contract address on the deposit chain.
 * @property {number} minDepositLimitUsd - Smallest deposit rhino.fi will process for this token, in USD.
 * @property {number} maxDepositLimitUsd - Largest deposit rhino.fi will process for this token, in USD.
 */

/**
 * The token and chain context needed to convert a rhino.fi quote's decimal
 * amounts into the base units the WDK reports.
 *
 * @typedef {Object} QuoteContext
 * @property {string} inputToken - The rhino.fi ticker of the deposited token, which the fees are denominated in.
 * @property {number} inputDecimals - The deposited token's decimal count.
 * @property {string} outputAsset - The rhino.fi ticker of the asset delivered on the destination chain.
 * @property {number} outputDecimals - The delivered asset's decimal count.
 * @property {Blockchain} sourceChain - The chain the deposit originates from.
 * @property {Blockchain} destinationChain - The chain the converted asset is delivered to.
 */

/**
 * The fee fields this module reads from a rhino.fi quote. Every amount is a
 * decimal string denominated in the deposited token.
 *
 * @typedef {Object} RhinoQuoteFees
 * @property {string} [fee] - The total cost of the transaction, from which the gas components are subtracted to derive the protocol fee.
 * @property {string} [gasFee] - The destination-chain delivery gas cost.
 * @property {string} [sourceGasFee] - The source-chain cost of sweeping the deposit into rhino.fi's control.
 */

/**
 * The subset of a rhino.fi quote response this module consumes.
 *
 * @typedef {Object} RhinoQuote
 * @property {string} payAmount - The deposited amount as a decimal string.
 * @property {string} receiveAmount - The delivered amount as a decimal string.
 * @property {RhinoQuoteFees} [fees] - The fee breakdown.
 */

/**
 * Coerces a `number | bigint | string` amount into a `bigint` of base units.
 *
 * @param {number | bigint | string} value - The amount in base units.
 * @returns {bigint} The amount as a bigint.
 * @throws {RangeError} If a number amount is not an integer.
 * @throws {SyntaxError} If a string amount is not a valid integer.
 */
export const toBigInt = (value) => BigInt(value)

/**
 * Converts a human-readable decimal amount (the rhino.fi wire format) into base units.
 *
 * @param {string | number} decimalString - The amount in whole token units, e.g. '1.5'.
 * @param {number} decimals - The token's decimal count.
 * @returns {bigint} The amount in base units.
 */
export const toBaseUnits = (decimalString, decimals) =>
  BigInt(new Decimal(decimalString).mul(new Decimal(10).pow(decimals)).toFixed(0))

/**
 * Converts a base-unit amount into a human-readable decimal string (the rhino.fi wire format).
 *
 * @param {bigint | number} amount - The amount in base units.
 * @param {number} decimals - The token's decimal count.
 * @returns {string} The amount in whole token units.
 */
export const toDecimalString = (amount, decimals) =>
  new Decimal(amount.toString()).div(new Decimal(10).pow(decimals)).toFixed()

/**
 * Builds the `SdaDepositAddress.id` that round-trips the chain rhino.fi keys
 * the address by.
 *
 * @param {string} chain - The rhino.fi deposit-chain key.
 * @param {string} address - The Smart Deposit Address.
 * @returns {string} The composite deposit-address identifier.
 */
export const encodeAddressId = (chain, address) => `${chain}${ID_SEPARATOR}${address}`

/**
 * Splits a composite deposit-address identifier back into its chain and address.
 *
 * @param {string} id - The identifier previously returned in `SdaDepositAddress.id`.
 * @returns {DepositAddressRef} The deposit chain and address.
 * @throws {ValueError} If the identifier is missing or not in `<chain>:<address>` form.
 */
export const decodeAddressId = (id) => {
  const separatorIndex = typeof id === 'string' ? id.indexOf(ID_SEPARATOR) : -1
  if (separatorIndex <= 0 || separatorIndex === id.length - 1) {
    throw new ValueError(`"${id}" is not a valid rhino.fi deposit-address id. Use the \`id\` returned by createDepositAddress, which has the form "<chain>:<address>".`)
  }
  return {
    depositChain: id.slice(0, separatorIndex),
    depositAddress: id.slice(separatorIndex + 1)
  }
}

/**
 * A deposit address split into the (address, chain) pair rhino.fi keys it by.
 *
 * @typedef {Object} DepositAddressRef
 * @property {string} depositChain - The rhino.fi deposit-chain key.
 * @property {string} depositAddress - The Smart Deposit Address.
 */

/**
 * A single deposit, identified by its Smart Deposit Address and rhino.fi's id
 * for the deposit itself.
 *
 * @typedef {DepositAddressRef & TransferRefId} TransferRef
 */

/**
 * The rhino.fi identifier of a single deposit at a Smart Deposit Address.
 *
 * @typedef {Object} TransferRefId
 * @property {string} transferId - rhino.fi's identifier for the deposit, unique within the address.
 */

/**
 * Builds the `SdaTransfer.id` that round-trips the address and chain a deposit
 * has to be looked up by — rhino.fi exposes deposits only per Smart Deposit
 * Address, never by a global transfer id.
 *
 * @param {string} chain - The rhino.fi deposit-chain key.
 * @param {string} address - The Smart Deposit Address the deposit was sent to.
 * @param {string} transferId - rhino.fi's identifier for the deposit.
 * @returns {string} The composite transfer identifier.
 */
export const encodeTransferId = (chain, address, transferId) =>
  `${chain}${ID_SEPARATOR}${address}${ID_SEPARATOR}${transferId}`

/**
 * Splits a composite transfer identifier back into its chain, address and
 * rhino.fi deposit id.
 *
 * @param {string} id - The identifier previously returned in `SdaTransfer.id`.
 * @returns {TransferRef} The deposit chain, address and rhino.fi deposit id.
 * @throws {ValueError} If the identifier is missing or not in `<chain>:<address>:<transferId>` form.
 */
export const decodeTransferId = (id) => {
  const parts = typeof id === 'string' ? id.split(ID_SEPARATOR) : []
  if (parts.length < 3 || parts.some((part) => part === '')) {
    throw new ValueError(`"${id}" is not a valid rhino.fi transfer id. Use the \`id\` returned by getTransfers, which has the form "<chain>:<address>:<transferId>".`)
  }
  const [depositChain, ...rest] = parts
  const transferId = rest.pop()
  return { depositChain, depositAddress: rest.join(ID_SEPARATOR), transferId }
}

/**
 * Resolves a chain identifier — a rhino.fi chain key such as 'ARBITRUM', or a
 * numeric chain id such as `42161` — against the rhino.fi bridge config.
 *
 * @param {BridgeConfig} config - The rhino.fi `/configs` response.
 * @param {Blockchain} chain - The chain identifier to resolve.
 * @returns {ChainEntry} The matched chain key and config entry.
 * @throws {UnsupportedChainError} If no configured chain matches.
 */
export const resolveChain = (config, chain) => {
  if (chain == null) throw new UnsupportedChainError(chain)
  const asString = String(chain)
  const keys = Object.keys(config)
  const key =
    keys.find((candidate) => candidate.toLowerCase() === asString.toLowerCase()) ??
    keys.find((candidate) => config[candidate].networkId === asString)
  if (!key) throw new UnsupportedChainError(chain)
  return { key, entry: config[key] }
}

/**
 * Resolves a chain identifier and additionally requires that rhino.fi has
 * Smart Deposit Addresses enabled on it, so an unusable chain fails before any
 * address is created rather than at deposit time.
 *
 * @param {BridgeConfig} config - The rhino.fi `/configs` response.
 * @param {Blockchain} chain - The chain identifier to resolve.
 * @returns {ChainEntry} The matched chain key and config entry.
 * @throws {UnsupportedChainError} If no configured chain matches, or the chain has Smart Deposit Addresses disabled.
 */
export const resolveDepositChain = (config, chain) => {
  const resolved = resolveChain(config, chain)
  if (!resolved.entry.enabledDepositAddress || resolved.entry.status !== 'enabled') {
    throw new UnsupportedChainError(chain)
  }
  return resolved
}

/**
 * Lists the rhino.fi chain keys that currently accept Smart Deposit Addresses.
 *
 * @param {BridgeConfig} config - The rhino.fi `/configs` response.
 * @returns {string[]} The chain keys with Smart Deposit Addresses enabled.
 */
export const depositEnabledChains = (config) =>
  Object.keys(config).filter(
    (key) => config[key].status === 'enabled' && config[key].enabledDepositAddress
  )

/**
 * Resolves a token symbol or contract address against a chain's bridge-config
 * entry.
 *
 * @param {ChainConfig} chainEntry - The rhino.fi bridge-config entry for the chain.
 * @param {string} token - The token symbol or contract address to resolve.
 * @param {Blockchain} chainLabel - The chain identifier, used only in the error message.
 * @returns {TokenConfig} The matched token config entry.
 * @throws {UnsupportedTokenError} If the chain lists no such token.
 */
export const resolveToken = (chainEntry, token, chainLabel) => {
  const tokens = chainEntry?.tokens ?? {}
  if (!token) throw new UnsupportedTokenError(token, chainLabel)
  const asLower = String(token).toLowerCase()
  const entry =
    tokens[token] ??
    tokens[String(token).toUpperCase()] ??
    Object.values(tokens).find(
      (candidate) => candidate.token?.toLowerCase() === asLower || candidate.address?.toLowerCase() === asLower
    )
  if (!entry) throw new UnsupportedTokenError(token, chainLabel)
  return entry
}

/**
 * Builds an {@link SdaToken} for a token listed in a chain's bridge config.
 *
 * @param {TokenConfig} tokenEntry - The rhino.fi bridge-config entry for the token.
 * @param {string} chainKey - The rhino.fi chain key the token lives on.
 * @returns {SdaToken} The normalized token reference.
 */
export const toSdaToken = (tokenEntry, chainKey) => ({
  token: tokenEntry.token,
  chain: chainKey,
  symbol: tokenEntry.token,
  decimals: tokenEntry.decimals,
  ...(tokenEntry.address ? { address: tokenEntry.address } : {})
})

/**
 * Maps the rhino.fi SDA `supported-tokens` response to {@link RhinofiSdaToken}
 * entries, taking each token's decimal count from the bridge config. A token
 * with no bridge-config entry on the chain is skipped, since its decimals —
 * required to interpret any amount — are unknown.
 *
 * @param {RhinofiSupportedToken[]} supportedTokens - The `supportedTokens` array from a rhino.fi SDA response.
 * @param {string} chainKey - The rhino.fi chain key the tokens live on.
 * @param {ChainConfig} chainEntry - The rhino.fi bridge-config entry for that chain.
 * @returns {RhinofiSdaToken[]} The normalized tokens, with rhino.fi's USD deposit limits attached.
 */
export const mapSupportedTokens = (supportedTokens, chainKey, chainEntry) => {
  const tokens = chainEntry?.tokens ?? {}
  return (supportedTokens ?? []).flatMap((supported) => {
    const tokenEntry = tokens[supported.symbol]
    if (!tokenEntry) return []
    return [{
      ...toSdaToken(tokenEntry, chainKey),
      ...(supported.address ? { address: supported.address } : {}),
      minDepositLimitUsd: supported.minDepositLimitUsd,
      maxDepositLimitUsd: supported.maxDepositLimitUsd
    }]
  })
}

/**
 * Maps a rhino.fi SDA response entry to a {@link RhinofiSdaDepositAddress}.
 *
 * rhino.fi Smart Deposit Addresses never expire and always accept repeat
 * deposits, so the result carries `reusable: true` and no `expiry`. Route
 * `limits` are omitted because rhino.fi enforces its deposit bounds in USD
 * rather than in the input token's base unit; those bounds are reported
 * per-token on `supportedInputTokens` instead.
 *
 * rhino.fi discloses `destinationAddress` only to `SECRET_` keys, so with a
 * standard key it is left unset rather than filled in from anywhere else.
 *
 * @param {RhinofiDepositAddressResponse} depositAddress - The deposit-address entry rhino.fi returned.
 * @param {DepositAddressContext} context - The bridge config used to resolve tokens.
 * @returns {RhinofiSdaDepositAddress} The normalized deposit address descriptor.
 */
export const mapDepositAddress = (depositAddress, context) => {
  const { config } = context
  const chainKey = depositAddress.depositChain
  const chainEntry = config[chainKey]
  const destinationEntry = config[depositAddress.destinationChain]

  const outputAsset = depositAddress.tokenOut && destinationEntry
    ? toSdaToken(
      resolveToken(destinationEntry, depositAddress.tokenOut, depositAddress.destinationChain),
      depositAddress.destinationChain
    )
    : undefined

  return {
    address: depositAddress.depositAddress,
    id: encodeAddressId(chainKey, depositAddress.depositAddress),
    sourceChains: [chainKey],
    supportedInputTokens: mapSupportedTokens(depositAddress.supportedTokens, chainKey, chainEntry),
    destinationChain: depositAddress.destinationChain,
    ...(depositAddress.destinationAddress ? { destinationAddress: depositAddress.destinationAddress } : {}),
    reusable: true,
    isActive: depositAddress.isActive,
    isPaused: depositAddress.isPaused,
    ...(outputAsset ? { outputAsset } : {}),
    ...(depositAddress.addressNote ? { addressNote: depositAddress.addressNote } : {}),
    ...(depositAddress.refundAddress ? { refundAddress: depositAddress.refundAddress } : {}),
    ...(depositAddress.chainMetadata ? { chainMetadata: depositAddress.chainMetadata } : {})
  }
}

/**
 * The deposit-address entry shape shared by the rhino.fi create, status and
 * search responses.
 *
 * @typedef {Object} RhinofiDepositAddressResponse
 * @property {string} depositAddress - The Smart Deposit Address funds are sent to.
 * @property {string} depositChain - The rhino.fi chain key the address lives on.
 * @property {string} destinationChain - The rhino.fi chain key the converted asset is delivered to.
 * @property {string} [destinationAddress] - The address the converted asset is delivered to; disclosed only to `SECRET_` keys.
 * @property {RhinofiSupportedToken[]} [supportedTokens] - The tokens the address accepts; absent from search results.
 * @property {boolean} [isActive] - Whether rhino.fi is still monitoring the address.
 * @property {boolean} [isPaused] - Whether the address currently rejects deposits.
 * @property {string} [tokenOut] - The ticker of the asset delivered on the destination chain.
 * @property {string} [addressNote] - The free-form label supplied when the address was created.
 * @property {string} [refundAddress] - The address unsuccessful deposits are returned to.
 * @property {RhinofiChainMetadata} [chainMetadata] - Chain-specific deposit metadata, currently only populated for Stellar.
 */

/**
 * The context {@link mapDepositAddress} needs beyond the rhino.fi response itself.
 *
 * @typedef {Object} DepositAddressContext
 * @property {BridgeConfig} config - The rhino.fi `/configs` response, used to resolve token decimals.
 */

/**
 * Maps the state of an accepted rhino.fi bridge to the canonical WDK
 * {@link SdaTransferStatus}. Unknown states fall back to `processing` — the
 * deposit was accepted, so it is in flight rather than failed.
 *
 * @type {Record<string, SdaTransferStatus>}
 */
export const BRIDGE_STATE_TO_STATUS = {
  PENDING: 'processing',
  PENDING_CONFIRMATION: 'processing',
  DEPOSIT_ACCEPTED: 'processing',
  ACCEPTED: 'processing',
  EXECUTED: 'completed',
  FAILED: 'failed'
}

/**
 * Maps a rhino.fi deposit-address history entry to the canonical WDK
 * {@link SdaTransferStatus}.
 *
 * A `rejected` deposit is one rhino.fi declined to convert while still holding
 * the funds, so it maps to `refund-pending`; the history never records the
 * refund itself, so `refunded` is not derivable here. A `failed` deposit is
 * terminal: rhino.fi accepted it and the conversion then failed.
 *
 * @param {RhinofiHistoryEntry} entry - The history entry returned by rhino.fi.
 * @returns {SdaTransferStatus} The canonical transfer status.
 */
export const mapTransferStatus = (entry) => {
  switch (entry._tag) {
    case 'detected':
      return 'detected'
    case 'confirming':
      return 'processing'
    case 'accepted':
      return BRIDGE_STATE_TO_STATUS[entry.history?.state] ?? 'processing'
    case 'rejected':
      return 'refund-pending'
    case 'failed':
      return 'failed'
    default:
      return 'processing'
  }
}

/**
 * Maps a rhino.fi deposit-address history entry to a {@link RhinofiSdaTransfer}.
 *
 * @param {RhinofiHistoryEntry} entry - The history entry returned by rhino.fi.
 * @param {DepositAddressRef} address - The deposit chain and address the deposit was sent to.
 * @returns {RhinofiSdaTransfer} The normalized transfer.
 */
export const mapTransfer = (entry, address) => {
  const { depositChain, depositAddress } = address

  return {
    id: encodeTransferId(depositChain, depositAddress, entry._id),
    status: mapTransferStatus(entry),
    address: depositAddress,
    sourceChain: depositChain,
    ...(entry.tokenSymbol ? { token: entry.tokenSymbol } : {}),
    ...(entry.tokenAddress ? { tokenAddress: entry.tokenAddress } : {}),
    ...(entry.amountWei !== undefined ? { amount: BigInt(entry.amountWei) } : {}),
    ...(entry.amountUsd !== undefined ? { amountUsd: entry.amountUsd } : {}),
    ...(entry.sender ? { sender: entry.sender } : {}),
    ...(entry.txHash ? { txHash: entry.txHash } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.createdAt ? { createdAt: entry.createdAt } : {})
  }
}

/**
 * The deposit-address history entry shape, flattened across the states
 * rhino.fi reports (`detected`, `confirming`, `accepted`, `rejected`, `failed`).
 *
 * @typedef {Object} RhinofiHistoryEntry
 * @property {string} _id - rhino.fi's identifier for the deposit.
 * @property {'detected' | 'confirming' | 'accepted' | 'rejected' | 'failed'} _tag - The state the deposit has reached.
 * @property {RhinofiHistoryBridge} [history] - The bridge record, present once the deposit is accepted.
 * @property {string} [tokenSymbol] - The ticker of the deposited token.
 * @property {string} [tokenAddress] - The contract address of the deposited token.
 * @property {string} [amountWei] - The deposited amount, in the token's base unit.
 * @property {number} [amountUsd] - The USD value of the deposit.
 * @property {string} [sender] - The source-chain address the deposit came from.
 * @property {string} [txHash] - The source-chain hash of the deposit transaction.
 * @property {string} [reason] - rhino.fi's reason tag for a rejected deposit, e.g. 'OVER_MAX'.
 * @property {string} [createdAt] - ISO-8601 timestamp of when the deposit reached this state.
 */

/**
 * The bridge record attached to an accepted deposit.
 *
 * @typedef {Object} RhinofiHistoryBridge
 * @property {string} state - The bridge state, e.g. 'EXECUTED', mapped by {@link BRIDGE_STATE_TO_STATUS}.
 */

/**
 * Orders transfers newest first, sorting those with no timestamp last.
 *
 * @param {RhinofiSdaTransfer[]} transfers - The transfers to order.
 * @returns {RhinofiSdaTransfer[]} A new array, newest first.
 */
export const sortNewestFirst = (transfers) =>
  [...transfers].sort((left, right) => {
    if (left.createdAt === right.createdAt) return 0
    if (!left.createdAt) return 1
    if (!right.createdAt) return -1
    return left.createdAt < right.createdAt ? 1 : -1
  })

/**
 * Maps a rhino.fi quote's fee breakdown to itemised {@link SdaFee} entries,
 * denominated in the deposited token.
 *
 * `sourceGasFee` is what rhino.fi spends sweeping the deposit out of the Smart
 * Deposit Address, and is reported as a network fee on the source chain;
 * `gasFee` is the destination-chain delivery cost and is reported there. What
 * remains of the total is rhino.fi's protocol fee, which is not tied to a chain
 * and so carries no `chain`. Zero-value items are omitted.
 *
 * @param {RhinoQuoteFees | undefined} fees - The `fees` object from a rhino.fi quote response.
 * @param {QuoteContext} context - The token and chain context the fees are denominated in.
 * @returns {SdaFee[]} The itemised fees greater than zero.
 */
export const mapFees = (fees, context) => {
  const { inputToken, inputDecimals, sourceChain, destinationChain } = context
  const sourceGas = new Decimal(fees?.sourceGasFee ?? '0')
  const destinationGas = new Decimal(fees?.gasFee ?? '0')
  const protocol = new Decimal(fees?.fee ?? '0').sub(sourceGas).sub(destinationGas)

  const result = []
  if (sourceGas.gt(0)) {
    result.push({
      type: 'network',
      amount: toBaseUnits(sourceGas.toFixed(), inputDecimals),
      token: inputToken,
      chain: sourceChain,
      included: true,
      description: 'Source-chain cost of sweeping the deposit'
    })
  }
  if (destinationGas.gt(0)) {
    result.push({
      type: 'network',
      amount: toBaseUnits(destinationGas.toFixed(), inputDecimals),
      token: inputToken,
      chain: destinationChain,
      included: true,
      description: 'Destination-chain delivery gas fee'
    })
  }
  if (protocol.gt(0)) {
    result.push({
      type: 'protocol',
      amount: toBaseUnits(protocol.toFixed(), inputDecimals),
      token: inputToken,
      included: true,
      description: 'rhino.fi protocol fee'
    })
  }
  return result
}

/**
 * Maps a rhino.fi quote response to an {@link SdaDepositQuote}.
 *
 * The quote is a non-binding estimate: rhino.fi prices a Smart Deposit Address
 * deposit only when the funds actually arrive, so the quote id and expiry the
 * response carries are not reported here.
 *
 * @param {RhinoQuote} quote - The rhino.fi quote response.
 * @param {QuoteContext} context - The token and chain context for base-unit conversion.
 * @returns {SdaDepositQuote} The normalized deposit quote.
 */
export const mapQuote = (quote, context) => {
  const { inputToken, inputDecimals, outputAsset, outputDecimals, sourceChain, destinationChain } = context
  const payAmount = new Decimal(quote.payAmount)

  return {
    inputChain: sourceChain,
    inputToken,
    inputAmount: toBaseUnits(quote.payAmount, inputDecimals),
    destinationChain,
    outputAsset,
    outputAmount: toBaseUnits(quote.receiveAmount, outputDecimals),
    fees: mapFees(quote.fees, context),
    ...(payAmount.gt(0) ? { rate: new Decimal(quote.receiveAmount).div(payAmount).toFixed() } : {})
  }
}

/**
 * Builds an {@link SdaRoute} for a rhino.fi source/destination chain pair.
 *
 * @param {RouteContext} context - The chain pair, its accepted input tokens and the asset delivered.
 * @returns {SdaRoute} The supported route.
 */
export const mapRoute = ({ sourceChain, inputTokens, destinationChain, outputAsset }) => ({
  sourceChains: [sourceChain],
  inputTokens,
  destinationChain,
  reusable: true,
  ...(outputAsset ? { outputAsset } : {})
})

/**
 * The inputs {@link mapRoute} assembles into a route.
 *
 * @typedef {Object} RouteContext
 * @property {string} sourceChain - The rhino.fi chain key deposits are accepted from.
 * @property {RhinofiSdaToken[]} inputTokens - The tokens accepted on the source chain.
 * @property {string} destinationChain - The rhino.fi chain key the converted asset is delivered to.
 * @property {SdaToken} [outputAsset] - The asset delivered, when the route converts to a single asset.
 */
