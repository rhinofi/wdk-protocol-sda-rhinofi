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

import { ProviderError, ProviderErrorReason } from '@tetherto/wdk-wallet'
import { NoSuchElementError, SdaError, SdaErrorReason, ValueError, WdkError } from '@tetherto/wdk-wallet/protocols'

export { NoSuchElementError, ProviderError, ProviderErrorReason, SdaError, SdaErrorReason, ValueError, WdkError }

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
  constructor (message) {
    super(message)

    this.name = 'ConfigurationError'
  }
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
  constructor (chain) {
    super(`Chain "${chain}" is not supported by rhino.fi Smart Deposit Addresses.`, { reason: SdaErrorReason.ROUTE_NOT_SUPPORTED })

    this.name = 'UnsupportedChainError'

    /**
     * The chain identifier that could not be resolved.
     *
     * @type {string | number}
     */
    this.chain = chain
  }
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
  constructor (token, chain) {
    super(`Token "${token}" is not supported on chain "${chain}".`, { reason: SdaErrorReason.ROUTE_NOT_SUPPORTED })

    this.name = 'UnsupportedTokenError'

    /**
     * The token symbol or contract address that could not be resolved.
     *
     * @type {string}
     */
    this.token = token

    /**
     * The chain the token was looked up on.
     *
     * @type {string | number}
     */
    this.chain = chain
  }
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
  constructor (message, details = {}) {
    super(message, {
      reason: details.reason,
      ...(details.cause !== undefined ? { cause: details.cause } : {})
    })

    this.name = 'SdaExecutionError'

    /**
     * The WDK `ProviderErrorReason`, or `undefined` when rhino.fi rejected the
     * request for a reason WDK has no category for - read `code` then.
     *
     * @type {string | undefined}
     */
    this.reason = details.reason

    /**
     * The rhino.fi failure tag (e.g. 'DepositAddressNotFound'), when known.
     *
     * @type {string | undefined}
     */
    this.code = details.code
  }
}
