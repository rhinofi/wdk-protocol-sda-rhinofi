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
    constructor(noAccount: undefined, config: RhinofiProtocolConfig);
    /**
     * Creates a new read-only rhino.fi SDA protocol. Read-only is sufficient for
     * every operation: the module only ever reads the account's address.
     *
     * @overload
     * @param {IWalletAccountReadOnly} readOnlyAccount - The account whose address is the default delivery destination.
     * @param {RhinofiProtocolConfig} config - The rhino.fi protocol configuration.
     */
    constructor(readOnlyAccount: IWalletAccountReadOnly, config: RhinofiProtocolConfig);
    /**
     * Creates a new rhino.fi SDA protocol bound to a full wallet account.
     *
     * @overload
     * @param {IWalletAccount} account - The account whose address is the default delivery destination.
     * @param {RhinofiProtocolConfig} config - The rhino.fi protocol configuration.
     */
    constructor(account: IWalletAccount, config: RhinofiProtocolConfig);
    /**
     * The rhino.fi protocol configuration.
     *
     * @protected
     * @type {RhinofiProtocolConfig}
     */
    protected _config: RhinofiProtocolConfig;
    /** @private */
    private _sdk;
    /** @private */
    private _configTtlMs;
    /** @private */
    private _cache;
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
    quoteDeposit(options: RhinofiQuoteDepositOptions): Promise<SdaDepositQuote>;
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
    createDepositAddress(options: RhinofiCreateDepositAddressOptions): Promise<RhinofiSdaDepositAddress[]>;
    /**
     * Looks up an existing Smart Deposit Address by its identifier.
     *
     * @param {string} id - The `SdaDepositAddress.id` returned by {@link RhinofiProtocol#createDepositAddress}, which round-trips the deposit chain.
     * @returns {Promise<RhinofiSdaDepositAddress>} The deposit address descriptor.
     * @throws {ValueError} If the identifier is not in `<chain>:<address>` form.
     * @throws {NoSuchElementError} If rhino.fi has no such address.
     * @throws {SdaExecutionError} If the rhino.fi lookup fails for any other reason.
     */
    getDepositAddress(id: string): Promise<RhinofiSdaDepositAddress>;
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
    getTransfers(address: string, options?: RhinofiTransfersOptions): Promise<RhinofiSdaTransfer[]>;
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
    getTransfer(id: string, options?: RhinofiHistoryWindow): Promise<RhinofiSdaTransfer>;
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
    enableDepositAddress(id: string): Promise<void>;
    /** @private */
    private _setPaused;
    /** @private */
    private _fetchTransfers;
    /** @private */
    private _resolveWindow;
    /** @private */
    private _validatePagination;
    /** @private */
    private _paginate;
    /** @private */
    private _matchesToken;
    /** @private */
    private _resolveDestinationAddress;
    /** @private */
    private _cached;
    /** @private */
    private _getConfig;
    /** @private */
    private _getRouteTokens;
    /** @private */
    private _call;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type Blockchain = import("@tetherto/wdk-wallet/protocols").Blockchain;
export type SdaRoutesOptions = import("@tetherto/wdk-wallet/protocols").SdaRoutesOptions;
export type SdaRoute = import("@tetherto/wdk-wallet/protocols").SdaRoute;
export type SdaDepositOptions = import("@tetherto/wdk-wallet/protocols").SdaDepositOptions;
export type SdaDepositQuote = import("@tetherto/wdk-wallet/protocols").SdaDepositQuote;
export type SdaCreateDepositAddressOptions = import("@tetherto/wdk-wallet/protocols").SdaCreateDepositAddressOptions;
export type SdaTransfersOptions = import("@tetherto/wdk-wallet/protocols").SdaTransfersOptions;
export type SdaExecutionError = import("./errors.js").SdaExecutionError;
export type UnsupportedChainError = import("./errors.js").UnsupportedChainError;
export type UnsupportedTokenError = import("./errors.js").UnsupportedTokenError;
export type RhinofiSdaDepositAddress = import("./types.js").RhinofiSdaDepositAddress;
export type RhinofiSdaTransfer = import("./types.js").RhinofiSdaTransfer;
/**
 * The configuration accepted by {@link RhinofiProtocol}.
 */
export type RhinofiProtocolConfig = {
    /**
     * - The rhino.fi API key. Required: every Smart Deposit Address request is authenticated.
     */
    apiKey: string;
    /**
     * - Override for the rhino.fi API base URL (default: the mainnet API). Any trailing slash is stripped, since the SDK appends its own paths.
     */
    apiBaseUrl?: string;
    /**
     * - How long to cache the rhino.fi chain config and per-route token lists, in milliseconds (default: 60,000). Set to 0 to always fetch fresh.
     */
    configTtlMs?: number;
};
/**
 * The rhino.fi-specific options accepted by {@link RhinofiProtocol#createDepositAddress},
 * on top of the WDK {@link SdaCreateDepositAddressOptions}.
 */
export type RhinofiCreateDepositAddressExtras = {
    /**
     * - A free-form label stored with the address, e.g. your own user id. Max 80 characters.
     */
    addressNote?: string;
    /**
     * - Where unsuccessful deposits should be returned to. Leave unset unless your rhino.fi account manager has advised otherwise.
     */
    refundAddress?: string;
    /**
     * - Where success and failure events for this address should be posted, overriding any URL configured in the rhino.fi console.
     */
    webhookUrl?: string;
    /**
     * - Whether to force a brand-new address or return a matching existing one (default: reuse a matching address when one exists).
     */
    reusePolicy?: "create-new" | "reuse-existing";
    /**
     * - Whether deposits that cannot be swapped to `outputAsset` should be bridged as-is instead of failing. Only meaningful alongside `outputAsset`.
     */
    bridgeIfNotSwappable?: boolean;
};
/**
 * The full option set accepted by {@link RhinofiProtocol#createDepositAddress}.
 */
export type RhinofiCreateDepositAddressOptions = SdaCreateDepositAddressOptions & RhinofiCreateDepositAddressExtras;
/**
 * The rhino.fi-specific options accepted by {@link RhinofiProtocol#quoteDeposit},
 * on top of the WDK {@link SdaDepositOptions}.
 */
export type RhinofiQuoteDepositExtras = {
    /**
     * - The address the deposit will arrive from, on `sourceChain`.
     */
    depositor: string;
    /**
     * - Where the converted asset is delivered, on `destinationChain`.
     */
    destinationAddress: string;
};
/**
 * The full option set accepted by {@link RhinofiProtocol#quoteDeposit}.
 */
export type RhinofiQuoteDepositOptions = SdaDepositOptions & RhinofiQuoteDepositExtras;
/**
 * The rhino.fi-specific history window accepted by
 * {@link RhinofiProtocol#getTransfers} and {@link RhinofiProtocol#getTransfer}.
 *
 * rhino.fi serves deposit history from a time window rather than an offset. The
 * window may sit anywhere in the past but may not span more than 31 days, so
 * reaching an older deposit means moving the window rather than widening it.
 * A window wider than that is rejected up front with a `ValueError`.
 */
export type RhinofiHistoryWindow = {
    /**
     * - Start of the window (default: 31 days before `toTimestamp`).
     */
    fromTimestamp?: Date;
    /**
     * - End of the window (default: now).
     */
    toTimestamp?: Date;
};
/**
 * The full option set accepted by {@link RhinofiProtocol#getTransfers}.
 */
export type RhinofiTransfersOptions = SdaTransfersOptions & RhinofiHistoryWindow;
import { SdaProtocol } from '@tetherto/wdk-wallet/protocols';
