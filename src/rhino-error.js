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

import { SdaExecutionError } from './errors.js'

/**
 * The shape this module reads from a rhino.fi SDA API error body to derive a
 * failure tag and a human-readable detail.
 *
 * @typedef {Object} RhinoErrorLike
 * @property {string} [_tag] - The rhino.fi API error tag (e.g. 'DepositAddressNotFound').
 * @property {string} [message] - The message the API returned alongside the tag.
 * @property {string[]} [addresses] - The addresses that were not found (DepositAddressNotFound).
 * @property {string[]} [chains] - The chains that are not supported (DepositAddressChainsNotSupported).
 * @property {RhinoRateLimit} [limit] - The limit that was hit (DepositAddressRateLimitExceeded).
 */

/**
 * The rate limit rhino.fi reports alongside a `DepositAddressRateLimitExceeded`
 * error.
 *
 * @typedef {Object} RhinoRateLimit
 * @property {'CountLimitExceeded' | 'WindowLimitExceeded'} _tag - Whether a total count or a per-window count was exceeded.
 * @property {number} allowed - The number of deposit addresses permitted.
 * @property {number} current - The number already created.
 * @property {number} [durationMs] - The window the limit applies to (WindowLimitExceeded).
 */

/**
 * The failure tag and human-readable detail derived from a rhino.fi SDA API error.
 *
 * @typedef {Object} RhinoErrorDescription
 * @property {string} [code] - The rhino.fi failure tag, when the body carried one.
 * @property {string} [detail] - A human-readable detail describing the failure.
 */

/**
 * The rhino.fi API error tags that mean "this deposit address does not exist".
 * Callers translate these into a `NoSuchElementError` rather than a generic
 * execution failure.
 *
 * @type {string[]}
 */
export const NOT_FOUND_TAGS = ['DepositAddressNotFound']

/**
 * Reads the rhino.fi failure tag from an SDA API error body.
 *
 * @param {RhinoErrorLike | undefined} rhinoError - The error body returned by the rhino.fi SDK.
 * @returns {string | undefined} The failure tag, or `undefined` if the body carried none.
 */
export const errorTag = (rhinoError) =>
  rhinoError && typeof rhinoError === 'object' ? rhinoError._tag : undefined

/**
 * Derives a failure tag and human-readable detail from a rhino.fi SDA API error
 * body. Tags without a bespoke detail fall back to the API's own `message`, so
 * new server-side error types stay legible without a module release.
 *
 * @param {RhinoErrorLike | undefined} rhinoError - The error body returned by the rhino.fi SDK.
 * @returns {RhinoErrorDescription} The extracted tag and detail.
 */
const describeRhinoError = (rhinoError) => {
  const message = typeof rhinoError?.message === 'string' && rhinoError.message !== ''
    ? rhinoError.message
    : undefined
  const code = errorTag(rhinoError)
  if (code === undefined) return message ? { detail: message } : {}
  switch (code) {
    case 'DepositAddressNotFound':
      return { code, detail: Array.isArray(rhinoError.addresses) ? `no such deposit address: ${rhinoError.addresses.join(', ')}` : 'no such deposit address' }
    case 'DepositAddressChainsNotSupported':
      return { code, detail: Array.isArray(rhinoError.chains) ? `unsupported chain(s): ${rhinoError.chains.join(', ')}` : 'unsupported chain(s)' }
    case 'DepositAddressTokenOutNotSupported':
      return { code, detail: 'the requested output asset is not supported on this route' }
    case 'DepositAddressInvalidDestinationAddress':
      return { code, detail: 'the destination address is not valid for the destination chain' }
    case 'DepositAddressMultipleChainTypesNotAllowed':
      return { code, detail: 'all source chains must belong to the same chain family' }
    case 'DepositAddressNoBridgableTokens':
      return { code, detail: 'no bridgeable tokens exist for this route' }
    case 'DepositAddressRateLimitExceeded':
      return { code, detail: describeRateLimit(rhinoError.limit) }
    case 'ExtensionNotEnabled':
      return { code, detail: 'Smart Deposit Addresses are not enabled for this API key' }
    case 'Unauthorized':
    case 'InvalidJwt':
      return { code, detail: 'the rhino.fi API key was rejected' }
    default:
      return { code, detail: message }
  }
}

/**
 * Describes an exceeded deposit-address rate limit, including the limit that
 * was hit so a caller knows whether to retry and when.
 *
 * @param {RhinoRateLimit | undefined} limit - The `limit` object rhino.fi returned alongside the error.
 * @returns {string} A human-readable description of the limit.
 */
const describeRateLimit = (limit) => {
  const base = 'the deposit-address creation rate limit has been exceeded'
  if (limit?._tag === 'CountLimitExceeded') {
    return `${base}: ${limit.current}/${limit.allowed} addresses`
  }
  if (limit?._tag === 'WindowLimitExceeded') {
    const seconds = Math.ceil((limit.durationMs ?? 0) / 1000)
    return `${base}: ${limit.current}/${limit.allowed} addresses per ${seconds}s, so retry after that window`
  }
  return base
}

/**
 * Builds an {@link SdaExecutionError} from a rhino.fi SDK error, enriching the
 * message with the precise failure and attaching its `code`. When the body
 * carries no usable detail (an empty or non-JSON error page), the HTTP status
 * stands in so the failure is still legible.
 *
 * @param {string} baseMessage - The context describing what was being attempted.
 * @param {RhinoErrorLike | undefined} rhinoError - The error returned by the rhino.fi SDK.
 * @param {{ ok: boolean, status: number, statusText?: string }} [response] - The HTTP response the error came with, if any.
 * @returns {SdaExecutionError} The enriched error.
 */
export const sdaExecutionError = (baseMessage, rhinoError, response) => {
  const { code, detail } = describeRhinoError(rhinoError)
  const fallbackDetail = response && !response.ok
    ? `rhino.fi responded ${response.status} ${response.statusText ?? ''}`.trim()
    : undefined
  const finalDetail = detail ?? fallbackDetail
  return new SdaExecutionError(finalDetail ? `${baseMessage} (${finalDetail}).` : baseMessage, { cause: rhinoError ?? response, code })
}
