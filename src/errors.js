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
  constructor (message, details) {
    super(message, details)
    this.name = this.constructor.name
  }
}

/**
 * Thrown when the protocol is missing required configuration, such as the
 * rhino.fi API key.
 */
export class ConfigurationError extends RhinofiProtocolError { }

/**
 * Thrown when a required argument is missing or malformed - the WDK
 * `ValueError` equivalent for this module. Raised before any network call, so
 * receiving one always means the call itself was wrong.
 */
export class ValueError extends RhinofiProtocolError { }

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
  constructor (chain) {
    super(`Chain "${chain}" is not supported by rhino.fi Smart Deposit Addresses.`)

    /**
     * The chain identifier that could not be resolved.
     *
     * @type {string | number}
     */
    this.chain = chain
  }
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
  constructor (token, chain) {
    super(`Token "${token}" is not supported on chain "${chain}".`)

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
  constructor (kind, id, details) {
    super(`No ${kind} found for id "${id}".`, details)

    /**
     * The identifier that produced no match.
     *
     * @type {string}
     */
    this.id = id
  }
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
  constructor (message, details = {}) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined)

    /**
     * The rhino.fi failure tag (e.g. 'DepositAddressNotFound'), when known.
     *
     * @type {string | undefined}
     */
    this.code = details.code
  }
}
