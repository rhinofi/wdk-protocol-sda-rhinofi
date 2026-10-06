/**
 * The details accepted by {@link SdaExecutionError}.
 *
 * @typedef {Object} SdaExecutionErrorDetails
 * @property {unknown} [cause] - The underlying rhino.fi SDK error or transport rejection.
 * @property {string} [code] - The rhino.fi failure tag, when the response carried one.
 * @property {string} [reason] - The WDK `ProviderErrorReason` the failure maps to, when one applies.
 */
/**
 * Thrown when the protocol is missing required configuration, such as the
 * rhino.fi API key. A WDK `ValueError`.
 */
export class ConfigurationError extends ValueError {
    /**
     * Creates a new configuration error.
     *
     * @param {string} message - The human-readable error message.
     */
    constructor(message: string);
}
/**
 * Thrown when a chain is not supported by rhino.fi, or has Smart Deposit
 * Addresses disabled. A WDK `SdaError` with reason `ROUTE_NOT_SUPPORTED`.
 */
export class UnsupportedChainError extends SdaError {
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
 * Thrown when a token is not supported on the given chain. A WDK `SdaError`
 * with reason `ROUTE_NOT_SUPPORTED`.
 */
export class UnsupportedTokenError extends SdaError {
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
 * Thrown when a rhino.fi Smart Deposit Address request fails. A WDK
 * `ProviderError`: `reason` holds the matching `ProviderErrorReason` when one
 * applies, and `code` carries the rhino.fi failure tag (e.g.
 * 'DepositAddressRateLimitExceeded', 'DepositAddressTokenOutNotSupported') for
 * programmatic handling.
 */
export class SdaExecutionError extends ProviderError {
    /**
     * Creates a new SDA execution error.
     *
     * @param {string} message - The human-readable error message.
     * @param {SdaExecutionErrorDetails} [details] - The underlying cause, the rhino.fi failure tag and the WDK reason.
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
    /**
     * - The WDK `ProviderErrorReason` the failure maps to, when one applies.
     */
    reason?: string;
};
import { NoSuchElementError } from '@tetherto/wdk-wallet/protocols';
import { ProviderError } from '@tetherto/wdk-wallet';
import { ProviderErrorReason } from '@tetherto/wdk-wallet';
import { SdaError } from '@tetherto/wdk-wallet/protocols';
import { SdaErrorReason } from '@tetherto/wdk-wallet/protocols';
import { ValueError } from '@tetherto/wdk-wallet/protocols';
import { WdkError } from '@tetherto/wdk-wallet/protocols';
export { NoSuchElementError, ProviderError, ProviderErrorReason, SdaError, SdaErrorReason, ValueError, WdkError };
