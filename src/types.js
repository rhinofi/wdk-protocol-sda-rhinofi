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

// The public type surface of this module: the rhino.fi-flavoured extensions of
// the WDK SDA types that public methods return. They live here rather than
// alongside the mappers so that the mappers' own declarations stay internal and
// are stripped from the published `types/` folder.

'use strict'

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaToken} SdaToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositAddress} SdaDepositAddress */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfer} SdaTransfer */

/**
 * A token accepted by a rhino.fi Smart Deposit Address. Extends the WDK
 * {@link SdaToken} with rhino.fi's per-token deposit limits, which are
 * denominated in USD rather than in the token's own base unit.
 *
 * @typedef {SdaToken & RhinofiTokenLimits} RhinofiSdaToken
 */

/**
 * rhino.fi's USD-denominated per-token deposit limits.
 *
 * @typedef {Object} RhinofiTokenLimits
 * @property {number} minDepositLimitUsd - Smallest deposit rhino.fi will process for this token, in USD.
 * @property {number} maxDepositLimitUsd - Largest deposit rhino.fi will process for this token, in USD.
 */

/**
 * Chain-specific deposit metadata. rhino.fi populates this for Stellar Smart
 * Deposit Addresses, where the muxed (M…) address resolves to a base account
 * plus a memo id — clients that cannot send to a muxed address deposit to the
 * base address and set the memo instead.
 *
 * @typedef {Object} RhinofiChainMetadata
 * @property {'STELLAR'} _tag - Discriminator identifying which chain family the metadata describes.
 * @property {string} baseAddress - The Stellar base account (G…) the muxed deposit address resolves to.
 * @property {string} memoId - The memo id that must accompany a deposit made to `baseAddress`.
 */

/**
 * A rhino.fi Smart Deposit Address. Extends the WDK {@link SdaDepositAddress}
 * with the rhino.fi lifecycle flags and metadata that have no WDK equivalent.
 * `destinationAddress` is optional here, unlike in WDK: rhino.fi discloses it
 * only to `SECRET_` keys, and this module never substitutes another value.
 *
 * @typedef {Omit<SdaDepositAddress, 'destinationAddress'> & RhinofiDepositAddressExtras} RhinofiSdaDepositAddress
 */

/**
 * The rhino.fi-specific fields carried on every {@link RhinofiSdaDepositAddress}.
 *
 * @typedef {Object} RhinofiDepositAddressExtras
 * @property {string} [destinationAddress] - The address the converted asset is delivered to. Present only when the API key is a `SECRET_` key.
 * @property {boolean} isActive - Whether rhino.fi is still monitoring the address for incoming deposits.
 * @property {boolean} isPaused - Whether the address currently rejects deposits; toggled by `disableDepositAddress` and `enableDepositAddress`.
 * @property {string} [addressNote] - The free-form label supplied when the address was created.
 * @property {string} [refundAddress] - The address unsuccessful deposits are returned to, when one was configured.
 * @property {RhinofiChainMetadata} [chainMetadata] - Chain-specific deposit metadata, currently only populated for Stellar.
 */

/**
 * A deposit observed at a rhino.fi Smart Deposit Address. Extends the WDK
 * {@link SdaTransfer} — which carries only `id` and `status` — with the
 * amounts, token and transaction hashes rhino.fi reports for the deposit.
 *
 * @typedef {SdaTransfer & RhinofiTransferExtras} RhinofiSdaTransfer
 */

/**
 * The rhino.fi-specific fields carried on every {@link RhinofiSdaTransfer}.
 *
 * @typedef {Object} RhinofiTransferExtras
 * @property {string} address - The Smart Deposit Address the deposit was sent to.
 * @property {Blockchain} sourceChain - The chain the deposit arrived on.
 * @property {string} [token] - The ticker of the deposited token.
 * @property {string} [tokenAddress] - The contract address of the deposited token on the source chain.
 * @property {bigint} [amount] - The deposited amount, in the token's base unit.
 * @property {number} [amountUsd] - The USD value of the deposit at the time it was observed.
 * @property {string} [sender] - The source-chain address the deposit was sent from.
 * @property {string} [txHash] - The source-chain hash of the deposit transaction.
 * @property {string} [reason] - rhino.fi's reason tag for a rejected or refunded deposit, e.g. 'OVER_MAX'.
 * @property {string} [createdAt] - ISO-8601 timestamp of when the deposit reached its current state.
 */

export {}
