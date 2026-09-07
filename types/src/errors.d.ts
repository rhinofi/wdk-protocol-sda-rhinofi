/**
 * The details accepted by {@link SdaExecutionError}.
 *
 * @typedef {Object} SdaExecutionErrorDetails
 * @property {unknown} [cause] - The underlying rhino.fi SDK error or transport rejection.
 * @property {string} [code] - The rhino.fi failure tag, when the response carried one.
 */
/**
 * The options accepted alongside an error message. Declared here rather than
 * using the built-in `ErrorOptions`, which only exists from the ES2022 lib and
 * would otherwise leak into the emitted types as an unresolved name.
 *
 * @typedef {Object} RhinofiErrorOptions
 * @property {unknown} [cause] - The underlying error this one wraps.
 */
/**
 * Base class for every error thrown by the rhino.fi SDA protocol.
 * Catch this to handle any module-specific failure.
 */
export class RhinofiProtocolError extends Error {
    /**
     * Creates a new rhino.fi protocol error.
     *
     * @param {string} message - The human-readable error message.
     * @param {RhinofiErrorOptions} [details] - Standard error options, carrying the underlying `cause`.
     */
    constructor(message: string, details?: RhinofiErrorOptions);
}
/**
 * Thrown when the protocol is missing required configuration, such as the
 * rhino.fi API key.
 */
export class ConfigurationError extends RhinofiProtocolError {
}
/**
 * Thrown when a required argument is missing or malformed - the WDK
 * `ValueError` equivalent for this module. Raised before any network call, so
 * receiving one always means the call itself was wrong.
 */
export class ValueError extends RhinofiProtocolError {
}
/**
 * Thrown when a chain is not supported by rhino.fi, or has Smart Deposit
 * Addresses disabled.
 */
export class UnsupportedChainError extends RhinofiProtocolError {
    /**
     * Creates a new unsupported-chain error.
     *
     * @param {string | number} chain - The chain identifier that could not be resolved, as supplied by the caller.
     */
    constructor(chain: string | number);
    /**
     * The chain identifier that could not be resolved.
     *
     * @type {string | number}
     */
    chain: string | number;
}
/**
 * Thrown when a token is not supported on the given chain.
 */
export class UnsupportedTokenError extends RhinofiProtocolError {
    /**
     * Creates a new unsupported-token error.
     *
     * @param {string} token - The token symbol or contract address that could not be resolved.
     * @param {string | number} chain - The chain the token was looked up on.
     */
    constructor(token: string, chain: string | number);
    /**
     * The token symbol or contract address that could not be resolved.
     *
     * @type {string}
     */
    token: string;
    /**
     * The chain the token was looked up on.
     *
     * @type {string | number}
     */
    chain: string | number;
}
/**
 * Thrown when no deposit address or transfer exists for the given identifier —
 * the WDK `NoSuchElementError` equivalent for this module.
 */
export class NoSuchElementError extends RhinofiProtocolError {
    /**
     * Creates a new no-such-element error.
     *
     * @param {string} kind - What was looked up, e.g. 'deposit address' or 'transfer'.
     * @param {string} id - The identifier that produced no match.
     * @param {RhinofiErrorOptions} [details] - Standard error options, carrying the underlying `cause`.
     */
    constructor(kind: string, id: string, details?: RhinofiErrorOptions);
    /**
     * The identifier that produced no match.
     *
     * @type {string}
     */
    id: string;
}
/**
 * Thrown when a rhino.fi Smart Deposit Address request fails. The `code`
 * carries the rhino.fi failure tag (e.g. 'DepositAddressRateLimitExceeded',
 * 'DepositAddressTokenOutNotSupported') for programmatic handling.
 */
export class SdaExecutionError extends RhinofiProtocolError {
    /**
     * Creates a new SDA execution error.
     *
     * @param {string} message - The human-readable error message.
     * @param {SdaExecutionErrorDetails} [details] - The underlying cause and the rhino.fi failure tag.
     */
    constructor(message: string, details?: SdaExecutionErrorDetails);
    /**
     * The rhino.fi failure tag (e.g. 'DepositAddressNotFound'), when known.
     *
     * @type {string | undefined}
     */
    code: string | undefined;
}
/**
 * The details accepted by {@link SdaExecutionError}.
 */
export type SdaExecutionErrorDetails = {
    /**
     * - The underlying rhino.fi SDK error or transport rejection.
     */
    cause?: unknown;
    /**
     * - The rhino.fi failure tag, when the response carried one.
     */
    code?: string;
};
/**
 * The options accepted alongside an error message. Declared here rather than
 * using the built-in `ErrorOptions`, which only exists from the ES2022 lib and
 * would otherwise leak into the emitted types as an unresolved name.
 */
export type RhinofiErrorOptions = {
    /**
     * - The underlying error this one wraps.
     */
    cause?: unknown;
};
