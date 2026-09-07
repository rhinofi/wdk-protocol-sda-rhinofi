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

import { RhinoSdk } from '@rhino.fi/sdk'
import { SdaProtocol } from '@tetherto/wdk-wallet/protocols'

import { ConfigurationError, NoSuchElementError, ValueError } from './errors.js'
import { errorTag, NOT_FOUND_TAGS, sdaExecutionError } from './rhino-error.js'
import {
  decodeAddressId,
  decodeTransferId,
  depositEnabledChains,
  encodeAddressId,
  mapDepositAddress,
  mapQuote,
  mapRoute,
  mapSupportedTokens,
  mapTransfer,
  resolveChain,
  resolveDepositChain,
  resolveToken,
  sortNewestFirst,
  toBigInt,
  toDecimalString,
  toSdaToken
} from './mappers.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoutesOptions} SdaRoutesOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositOptions} SdaDepositOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositQuote} SdaDepositQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaCreateDepositAddressOptions} SdaCreateDepositAddressOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfersOptions} SdaTransfersOptions */

/** @typedef {import('./errors.js').SdaExecutionError} SdaExecutionError */
/** @typedef {import('./errors.js').UnsupportedChainError} UnsupportedChainError */
/** @typedef {import('./errors.js').UnsupportedTokenError} UnsupportedTokenError */

/** @typedef {import('./types.js').RhinofiSdaDepositAddress} RhinofiSdaDepositAddress */
/** @typedef {import('./types.js').RhinofiSdaTransfer} RhinofiSdaTransfer */

/**
 * The configuration accepted by {@link RhinofiProtocol}.
 *
 * @typedef {Object} RhinofiProtocolConfig
 * @property {string} apiKey - The rhino.fi API key. Required: every Smart Deposit Address request is authenticated.
 * @property {string} [apiBaseUrl] - Override for the rhino.fi API base URL (default: the mainnet API). Any trailing slash is stripped, since the SDK appends its own paths.
 * @property {number} [configTtlMs] - How long to cache the rhino.fi chain config and per-route token lists, in milliseconds (default: 60,000). Set to 0 to always fetch fresh.
 */

/**
 * The rhino.fi-specific options accepted by {@link RhinofiProtocol#createDepositAddress},
 * on top of the WDK {@link SdaCreateDepositAddressOptions}.
 *
 * @typedef {Object} RhinofiCreateDepositAddressExtras
 * @property {string} [addressNote] - A free-form label stored with the address, e.g. your own user id. Max 80 characters.
 * @property {string} [refundAddress] - Where unsuccessful deposits should be returned to. Leave unset unless your rhino.fi account manager has advised otherwise.
 * @property {string} [webhookUrl] - Where success and failure events for this address should be posted, overriding any URL configured in the rhino.fi console.
 * @property {'create-new' | 'reuse-existing'} [reusePolicy] - Whether to force a brand-new address or return a matching existing one (default: reuse a matching address when one exists).
 * @property {boolean} [bridgeIfNotSwappable] - Whether deposits that cannot be swapped to `outputAsset` should be bridged as-is instead of failing. Only meaningful alongside `outputAsset`.
 */

/**
 * The full option set accepted by {@link RhinofiProtocol#createDepositAddress}.
 *
 * @typedef {SdaCreateDepositAddressOptions & RhinofiCreateDepositAddressExtras} RhinofiCreateDepositAddressOptions
 */

/**
 * The rhino.fi-specific options accepted by {@link RhinofiProtocol#quoteDeposit},
 * on top of the WDK {@link SdaDepositOptions}.
 *
 * @typedef {Object} RhinofiQuoteDepositExtras
 * @property {string} depositor - The address the deposit will arrive from, on `sourceChain`.
 * @property {string} destinationAddress - Where the converted asset is delivered, on `destinationChain`.
 */

/**
 * The full option set accepted by {@link RhinofiProtocol#quoteDeposit}.
 *
 * @typedef {SdaDepositOptions & RhinofiQuoteDepositExtras} RhinofiQuoteDepositOptions
 */

/**
 * The rhino.fi-specific history window accepted by
 * {@link RhinofiProtocol#getTransfers} and {@link RhinofiProtocol#getTransfer}.
 *
 * rhino.fi serves deposit history from a time window rather than an offset. The
 * window may sit anywhere in the past but may not span more than 31 days, so
 * reaching an older deposit means moving the window rather than widening it.
 * A window wider than that is rejected up front with a `ValueError`.
 *
 * @typedef {Object} RhinofiHistoryWindow
 * @property {Date} [fromTimestamp] - Start of the window (default: 31 days before `toTimestamp`).
 * @property {Date} [toTimestamp] - End of the window (default: now).
 */

/**
 * The full option set accepted by {@link RhinofiProtocol#getTransfers}.
 *
 * @typedef {SdaTransfersOptions & RhinofiHistoryWindow} RhinofiTransfersOptions
 */

/**
 * How long the rhino.fi chain config and per-route token lists are cached, in milliseconds.
 *
 * @type {number}
 */
const DEFAULT_CONFIG_TTL_MS = 60_000

/**
 * The widest history window rhino.fi accepts, in milliseconds. Its default is
 * 7 days, so the readers ask for this instead and let the caller move the
 * window further back for anything older.
 *
 * @type {number}
 */
const MAX_HISTORY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000

/**
 * rhino.fi Smart Deposit Address (SDA) protocol.
 *
 * A Smart Deposit Address is an address rhino.fi issues on a source chain. Any
 * supported token sent to it is swept, converted, and delivered to a fixed
 * destination chain and address — the depositor needs no rhino.fi account and
 * signs nothing beyond an ordinary transfer, so this module never touches keys
 * and never broadcasts a transaction.
 *
 * rhino.fi's custody model is **trusted-operator**: addresses are issued and
 * swept by rhino.fi, not derived client-side, and are monitored for ten years.
 * `deriveDepositAddress`, `renewDepositAddress` and `recoverDepositAddress` are
 * therefore not implemented, and inherit the base class's
 * `UnsupportedOperationError`. So does `getTransfersByRecipient`: rhino.fi
 * has no per-recipient history, and assembling one from the recipient's
 * addresses costs a request per address, so deposits are read per address
 * with {@link RhinofiProtocol#getTransfers} instead.
 *
 * Routes are discovered per source/destination chain pair, so
 * {@link RhinofiProtocol#getSupportedRoutes} requires a `destinationChain`.
 *
 * @see https://docs.rhino.fi
 */
export default class RhinofiProtocol extends SdaProtocol {
  /**
   * Creates a new rhino.fi SDA protocol without binding it to a wallet account.
   * Every call must then pass an explicit `destinationAddress`.
   *
   * @overload
   * @param {undefined} noAccount - Pass `undefined` to leave the protocol unbound.
   * @param {RhinofiProtocolConfig} config - The rhino.fi protocol configuration.
   */

  /**
   * Creates a new read-only rhino.fi SDA protocol. Read-only is sufficient for
   * every operation: the module only ever reads the account's address.
   *
   * @overload
   * @param {IWalletAccountReadOnly} readOnlyAccount - The account whose address is the default delivery destination.
   * @param {RhinofiProtocolConfig} config - The rhino.fi protocol configuration.
   */

  /**
   * Creates a new rhino.fi SDA protocol bound to a full wallet account.
   *
   * @overload
   * @param {IWalletAccount} account - The account whose address is the default delivery destination.
   * @param {RhinofiProtocolConfig} config - The rhino.fi protocol configuration.
   */
  constructor (account, config = {}) {
    super(account)

    if (!config.apiKey) {
      throw new ConfigurationError('A rhino.fi `apiKey` is required: every Smart Deposit Address request is authenticated.')
    }

    /**
     * The rhino.fi protocol configuration.
     *
     * @protected
     * @type {RhinofiProtocolConfig}
     */
    this._config = config

    /** @private */
    this._sdk = RhinoSdk({
      apiKey: config.apiKey,
      ...(config.apiBaseUrl ? { apiBaseUrl: config.apiBaseUrl.replace(/\/+$/, '') } : {})
    })

    /** @private */
    this._configTtlMs = config.configTtlMs ?? DEFAULT_CONFIG_TTL_MS

    /** @private */
    this._cache = new Map()
  }

  /**
   * Lists the conversion routes rhino.fi supports for a destination chain: the
   * source chains that accept deposits, the tokens each accepts, and the asset
   * delivered.
   *
   * rhino.fi discovers routes per chain pair, so `destinationChain` is
   * required. Omitting `sourceChain` queries every chain that has Smart Deposit
   * Addresses enabled — one request per chain, so prefer passing `sourceChain`
   * when you already know it. Source chains that fail to answer are skipped
   * rather than failing the whole call, so one degraded chain cannot break
   * discovery.
   *
   * @param {SdaRoutesOptions} [options] - Filters narrowing which routes are returned.
   * @returns {Promise<SdaRoute[]>} One route per source chain that accepts deposits for the destination.
   * @throws {ValueError} If `destinationChain` is not set.
   * @throws {UnsupportedChainError} If a named chain is unknown to rhino.fi or has Smart Deposit Addresses disabled.
   * @throws {UnsupportedTokenError} If `outputAsset` is not listed on the destination chain.
   * @throws {SdaExecutionError} If the rhino.fi chain config cannot be fetched.
   */
  async getSupportedRoutes (options = {}) {
    if (options.destinationChain == null) {
      throw new ValueError('`destinationChain` is required: rhino.fi discovers Smart Deposit Address routes per source/destination chain pair.')
    }

    const config = await this._getConfig()
    const destination = resolveChain(config, options.destinationChain)
    const outputAsset = options.outputAsset
      ? toSdaToken(resolveToken(destination.entry, options.outputAsset, destination.key), destination.key)
      : undefined

    const isFanOut = options.sourceChain == null
    const sourceChains = isFanOut
      ? depositEnabledChains(config)
      : [resolveDepositChain(config, options.sourceChain).key]

    const results = await Promise.all(sourceChains.map(async (sourceChain) => {
      let supportedTokens
      try {
        supportedTokens = await this._getRouteTokens(sourceChain, destination.key, outputAsset?.token)
      } catch (error) {
        if (!isFanOut) throw error
        return { error }
      }

      const inputTokens = mapSupportedTokens(supportedTokens, sourceChain, config[sourceChain])
        .filter((token) => options.sourceToken == null || this._matchesToken(token, options.sourceToken))
      if (inputTokens.length === 0) return {}

      return { route: mapRoute({ sourceChain, inputTokens, destinationChain: destination.key, outputAsset }) }
    }))

    if (results.length > 0 && results.every((result) => result.error)) {
      throw results[0].error
    }

    return results.map((result) => result.route).filter((route) => route !== undefined)
  }

  /**
   * Fetches a non-binding estimate of what a given deposit would deliver.
   *
   * The quote is priced against your rhino.fi account, so it reflects that
   * account's fee configuration, and it accounts for the source-chain sweep
   * that a Smart Deposit Address incurs and an ordinary bridge does not.
   * rhino.fi prices a deposit for real only once the funds arrive, so the
   * returned quote carries no id and no expiry — treat it as indicative.
   *
   * @param {RhinofiQuoteDepositOptions} options - The deposit to price, including the rhino.fi-specific extras.
   * @returns {Promise<SdaDepositQuote>} The estimated conversion, with an itemised fee breakdown.
   * @throws {ValueError} If `inputAmount` is missing or not positive, or either address is missing.
   * @throws {UnsupportedChainError} If either chain is unknown to rhino.fi or has Smart Deposit Addresses disabled.
   * @throws {UnsupportedTokenError} If the input token or output asset is not listed on its chain.
   * @throws {SdaExecutionError} If rhino.fi cannot price the deposit, e.g. because no route exists or the amount falls outside your account's deposit limits.
   */
  async quoteDeposit (options) {
    if (options.inputAmount == null) {
      throw new ValueError('`inputAmount` is required to quote a deposit.')
    }
    const inputAmount = toBigInt(options.inputAmount)
    if (inputAmount <= 0n) {
      throw new ValueError('`inputAmount` must be greater than zero.')
    }
    if (!options.depositor || !options.destinationAddress) {
      throw new ValueError('`depositor` and `destinationAddress` are required to quote a deposit.')
    }

    const config = await this._getConfig()
    const source = resolveDepositChain(config, options.sourceChain)
    const destination = resolveChain(config, options.destinationChain)
    const inputToken = resolveToken(source.entry, options.inputToken, source.key)
    const outputToken = options.outputAsset
      ? resolveToken(destination.entry, options.outputAsset, destination.key)
      : resolveToken(destination.entry, inputToken.token, destination.key)

    const quote = await this._call(
      this._sdk.api.bridge.getSwapUserQuote({
        chainIn: source.key,
        chainOut: destination.key,
        tokenIn: inputToken.token,
        tokenOut: outputToken.token,
        amount: toDecimalString(inputAmount, inputToken.decimals),
        mode: 'pay',
        isSda: 'true',
        depositor: options.depositor,
        recipient: options.destinationAddress
      }),
      'Failed to fetch a rhino.fi deposit quote.'
    )

    return mapQuote(quote, {
      inputToken: inputToken.token,
      inputDecimals: inputToken.decimals,
      outputAsset: outputToken.token,
      outputDecimals: outputToken.decimals,
      sourceChain: source.key,
      destinationChain: destination.key
    })
  }

  /**
   * Creates Smart Deposit Addresses for the given route and destination.
   *
   * rhino.fi issues one address per source chain, so the result has one entry
   * per entry in `sourceChains`. All source chains must belong to the same
   * chain family (all EVM, or all Solana, …); rhino.fi rejects a mixed list.
   * Created addresses are live and monitored immediately, for ten years.
   * With a standard (non-`SECRET_`) key the returned `destinationAddress` is
   * unset, as rhino.fi does not disclose it; the address still delivers to
   * the destination that was requested.
   *
   * @param {RhinofiCreateDepositAddressOptions} options - The address creation options, including the rhino.fi-specific extras.
   * @returns {Promise<RhinofiSdaDepositAddress[]>} The created addresses, one per source chain.
   * @throws {ValueError} If `sourceChains` is empty, or `destinationAddress` is omitted and no account was bound at construction.
   * @throws {UnsupportedChainError} If a source chain is unknown to rhino.fi or has Smart Deposit Addresses disabled.
   * @throws {UnsupportedTokenError} If `outputAsset` is not listed on the destination chain.
   * @throws {SdaExecutionError} If rhino.fi rejects the request, e.g. on a mixed-family chain list or an exceeded rate limit.
   */
  async createDepositAddress (options) {
    if (!Array.isArray(options.sourceChains) || options.sourceChains.length === 0) {
      throw new ValueError('`sourceChains` must list at least one chain to accept deposits from.')
    }

    const config = await this._getConfig()
    const depositChains = options.sourceChains.map((chain) => resolveDepositChain(config, chain).key)
    const destination = resolveChain(config, options.destinationChain)
    const destinationAddress = await this._resolveDestinationAddress(options.destinationAddress)
    const tokenOut = options.outputAsset
      ? resolveToken(destination.entry, options.outputAsset, destination.key).token
      : undefined

    const created = await this._call(
      this._sdk.api.depositAddresses.create({
        depositChains,
        destinationChain: destination.key,
        destinationAddress,
        ...(tokenOut ? { tokenOut } : {}),
        ...(options.addressNote ? { addressNote: options.addressNote } : {}),
        ...(options.refundAddress ? { refundAddress: options.refundAddress } : {}),
        ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
        ...(options.reusePolicy ? { reusePolicy: options.reusePolicy } : {}),
        ...(options.bridgeIfNotSwappable !== undefined ? { bridgeIfNotSwappable: options.bridgeIfNotSwappable } : {})
      }),
      'Failed to create a rhino.fi Smart Deposit Address.'
    )

    return (created ?? []).map((depositAddress) => mapDepositAddress(depositAddress, { config }))
  }

  /**
   * Looks up an existing Smart Deposit Address by its identifier.
   *
   * @param {string} id - The `SdaDepositAddress.id` returned by {@link RhinofiProtocol#createDepositAddress}, which round-trips the deposit chain.
   * @returns {Promise<RhinofiSdaDepositAddress>} The deposit address descriptor.
   * @throws {ValueError} If the identifier is not in `<chain>:<address>` form.
   * @throws {NoSuchElementError} If rhino.fi has no such address.
   * @throws {SdaExecutionError} If the rhino.fi lookup fails for any other reason.
   */
  async getDepositAddress (id) {
    const { depositChain, depositAddress } = decodeAddressId(id)
    const config = await this._getConfig()

    const status = await this._call(
      this._sdk.api.depositAddresses.getStatus({ depositAddress, depositChain }),
      'Failed to fetch the rhino.fi Smart Deposit Address.',
      { notFound: () => new NoSuchElementError('deposit address', id) }
    )

    return mapDepositAddress(status, { config })
  }

  /**
   * Lists the deposits observed at a Smart Deposit Address.
   *
   * rhino.fi keys addresses by (address, chain), so `options.sourceChain` is
   * required. A rejected deposit reports `refund-pending`; rhino.fi's history
   * does not record the refund itself, so listen for the
   * `SDA_REFUND_COMPLETED` webhook event to learn when the funds went back.
   *
   * rhino.fi paginates history by date rather than by offset, so `limit` and
   * `skip` are applied to the window here. The window defaults to the last 31
   * days — the widest rhino.fi allows — and `fromTimestamp`/`toTimestamp` move
   * it further back for older deposits.
   *
   * @param {string} address - The Smart Deposit Address to list deposits for.
   * @param {RhinofiTransfersOptions} [options] - The source chain, the history window, plus optional status filtering and pagination.
   * @returns {Promise<RhinofiSdaTransfer[]>} The deposits observed at the address, newest first.
   * @throws {ValueError} If `address` or `options.sourceChain` is missing, `limit`/`skip` are negative, or the window is inverted or wider than 31 days.
   * @throws {UnsupportedChainError} If the source chain is unknown to rhino.fi.
   * @throws {SdaExecutionError} If the rhino.fi history request fails.
   */
  async getTransfers (address, options = {}) {
    if (!address) {
      throw new ValueError('`address` is required to list the deposits at a Smart Deposit Address.')
    }
    if (options.sourceChain == null) {
      throw new ValueError('`options.sourceChain` is required: rhino.fi keys Smart Deposit Addresses by (address, chain).')
    }
    this._validatePagination(options)
    const config = await this._getConfig()
    const depositChain = resolveChain(config, options.sourceChain).key

    const transfers = await this._fetchTransfers(depositChain, address, this._resolveWindow(options))
    return this._paginate(transfers, options)
  }

  /**
   * Retrieves a single deposit by its identifier.
   *
   * rhino.fi has no lookup by deposit id — its bridge-status endpoint is
   * documented as not covering Smart Deposit Address activity — so the deposit
   * is found within the address's history window. That window defaults to the
   * last 31 days, the widest rhino.fi allows; for an older deposit, move it
   * with `fromTimestamp`/`toTimestamp`.
   *
   * @param {string} id - The `SdaTransfer.id` returned by {@link RhinofiProtocol#getTransfers}, which round-trips the address and chain the deposit has to be looked up by.
   * @param {RhinofiHistoryWindow} [options] - The history window to search, when the deposit is older than 31 days.
   * @returns {Promise<RhinofiSdaTransfer>} The deposit's current status.
   * @throws {ValueError} If the identifier is not in `<chain>:<address>:<transferId>` form, or the window is inverted or wider than 31 days.
   * @throws {NoSuchElementError} If the window holds no deposit with that identifier.
   * @throws {SdaExecutionError} If the rhino.fi history request fails.
   */
  async getTransfer (id, options = {}) {
    const { depositChain, depositAddress, transferId } = decodeTransferId(id)

    const transfers = await this._fetchTransfers(depositChain, depositAddress, this._resolveWindow(options))
    const transfer = transfers.find((candidate) => candidate.id === id)
    if (!transfer) {
      throw new NoSuchElementError('transfer', transferId)
    }
    return transfer
  }

  /**
   * Disables a Smart Deposit Address so it stops accepting deposits.
   *
   * rhino.fi implements this as a pause, so it is reversible — call
   * {@link RhinofiProtocol#enableDepositAddress} to resume. Deposits that
   * arrive while the address is paused are rejected and refunded rather than
   * converted.
   *
   * @param {string} id - The `SdaDepositAddress.id` returned by {@link RhinofiProtocol#createDepositAddress}.
   * @returns {Promise<void>} Resolves once rhino.fi has paused the address.
   * @throws {ValueError} If the identifier is not in `<chain>:<address>` form.
   * @throws {NoSuchElementError} If rhino.fi has no such address.
   * @throws {SdaExecutionError} If the rhino.fi pause request fails.
   */
  async disableDepositAddress (id) {
    await this._setPaused(id, 'Pause')
  }

  /**
   * Re-enables a Smart Deposit Address previously disabled by
   * {@link RhinofiProtocol#disableDepositAddress}, so it accepts deposits again.
   *
   * This has no WDK counterpart — it exists so that disabling an address stays
   * reversible through this module rather than only through the rhino.fi console.
   *
   * @param {string} id - The `SdaDepositAddress.id` returned by {@link RhinofiProtocol#createDepositAddress}.
   * @returns {Promise<void>} Resolves once rhino.fi has unpaused the address.
   * @throws {ValueError} If the identifier is not in `<chain>:<address>` form.
   * @throws {NoSuchElementError} If rhino.fi has no such address.
   * @throws {SdaExecutionError} If the rhino.fi unpause request fails.
   */
  async enableDepositAddress (id) {
    await this._setPaused(id, 'Unpause')
  }

  /** @private */
  async _setPaused (id, action) {
    const { depositChain, depositAddress } = decodeAddressId(id)
    await this._call(
      this._sdk.api.depositAddresses.updateDepositAddresses({
        depositAddress,
        action: { _tag: action, depositChain }
      }),
      `Failed to ${action.toLowerCase()} the rhino.fi Smart Deposit Address.`,
      { notFound: () => new NoSuchElementError('deposit address', id) }
    )
  }

  /** @private */
  async _fetchTransfers (depositChain, depositAddress, window) {
    const history = await this._call(
      this._sdk.api.depositAddresses.getHistory({ depositAddress, depositChain, ...window }),
      'Failed to fetch the rhino.fi Smart Deposit Address history.',
      { notFound: () => new NoSuchElementError('deposit address', encodeAddressId(depositChain, depositAddress)) }
    )
    return (history?.bridges ?? []).map((entry) => mapTransfer(entry, { depositChain, depositAddress }))
  }

  /** @private */
  _resolveWindow ({ fromTimestamp, toTimestamp } = {}) {
    const end = toTimestamp ?? new Date()
    const start = fromTimestamp ?? new Date(end.getTime() - MAX_HISTORY_WINDOW_MS)
    if (start.getTime() > end.getTime()) {
      throw new ValueError('`fromTimestamp` must not be after `toTimestamp`.')
    }
    if (end.getTime() - start.getTime() > MAX_HISTORY_WINDOW_MS) {
      throw new ValueError('The history window must not span more than 31 days: move `fromTimestamp`/`toTimestamp` rather than widening them.')
    }
    return { fromTimestamp: start, ...(toTimestamp ? { toTimestamp } : {}) }
  }

  /** @private */
  _validatePagination (options) {
    if (options.limit != null && options.limit < 0) {
      throw new ValueError('`options.limit` must not be negative.')
    }
    if (options.skip != null && options.skip < 0) {
      throw new ValueError('`options.skip` must not be negative.')
    }
  }

  // rhino.fi returns a fixed history window with no offset pagination, so the
  // status filter, ordering and limit/skip are applied to the fetched list.
  /** @private */
  _paginate (transfers, options) {
    const filtered = options.status
      ? transfers.filter((transfer) => transfer.status === options.status)
      : transfers
    const ordered = sortNewestFirst(filtered)
    const start = options.skip ?? 0
    return options.limit != null ? ordered.slice(start, start + options.limit) : ordered.slice(start)
  }

  /** @private */
  _matchesToken (token, candidate) {
    const asLower = String(candidate).toLowerCase()
    return token.token.toLowerCase() === asLower || token.address?.toLowerCase() === asLower
  }

  /** @private */
  async _resolveDestinationAddress (destinationAddress) {
    if (destinationAddress) return destinationAddress
    if (!this._account) {
      throw new ValueError('`destinationAddress` is required when no wallet account is bound to the protocol.')
    }
    return this._account.getAddress()
  }

  // Caches the rhino.fi chain config and per-route token lists for
  // `configTtlMs` so bursts of calls reuse one fetch. Failures are not cached,
  // so the next call retries.
  /** @private */
  _cached (key, fetcher) {
    const cached = this._cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise
    }
    const promise = fetcher().catch((error) => {
      if (this._cache.get(key)?.promise === promise) this._cache.delete(key)
      throw error
    })
    this._cache.set(key, { expiresAt: Date.now() + this._configTtlMs, promise })
    return promise
  }

  /** @private */
  async _getConfig () {
    return this._cached('config', () =>
      this._call(this._sdk.api.bridge.getBridgeConfig(), 'Failed to fetch the rhino.fi chain config.')
    )
  }

  /** @private */
  async _getRouteTokens (depositChain, destinationChain, tokenOut) {
    const tokens = await this._cached(`tokens:${depositChain}:${destinationChain}:${tokenOut ?? ''}`, () =>
      this._call(
        this._sdk.api.depositAddresses.getSupportedTokens({
          depositChain,
          destinationChain,
          ...(tokenOut ? { tokenOut } : {})
        }),
        'Failed to fetch the rhino.fi Smart Deposit Address supported tokens.'
      )
    )
    return tokens?.supportedTokens ?? []
  }

  // Awaits a rhino.fi SDK call, converting both transport rejections (network,
  // DNS, TLS) and non-2xx results into a typed module error. Not-found is
  // recognised by rhino.fi's error tag and, failing a tagged body, by a bare
  // HTTP 404.
  /** @private */
  async _call (promise, message, handlers = {}) {
    let result
    try {
      result = await promise
    } catch (error) {
      throw sdaExecutionError(message, error)
    }
    const response = result?.response
    const failed = result?.error !== undefined || (response !== undefined && !response.ok)
    if (!failed) return result?.data

    const isNotFound = NOT_FOUND_TAGS.includes(errorTag(result.error)) || response?.status === 404
    if (handlers.notFound && isNotFound) {
      throw handlers.notFound()
    }
    throw sdaExecutionError(message, result.error, response)
  }
}
