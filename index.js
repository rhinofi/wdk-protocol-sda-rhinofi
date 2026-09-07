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

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaToken} SdaToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositAddressLimits} SdaDepositAddressLimits */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoutesOptions} SdaRoutesOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositOptions} SdaDepositOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaFeeType} SdaFeeType */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaFee} SdaFee */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositQuote} SdaDepositQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaCreateDepositAddressOptions} SdaCreateDepositAddressOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositAddress} SdaDepositAddress */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransferStatus} SdaTransferStatus */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfer} SdaTransfer */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfersOptions} SdaTransfersOptions */

/** @typedef {import('./src/rhinofi-protocol.js').RhinofiProtocolConfig} RhinofiProtocolConfig */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiCreateDepositAddressOptions} RhinofiCreateDepositAddressOptions */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiCreateDepositAddressExtras} RhinofiCreateDepositAddressExtras */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiQuoteDepositOptions} RhinofiQuoteDepositOptions */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiQuoteDepositExtras} RhinofiQuoteDepositExtras */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiTransfersOptions} RhinofiTransfersOptions */
/** @typedef {import('./src/rhinofi-protocol.js').RhinofiHistoryWindow} RhinofiHistoryWindow */

/** @typedef {import('./src/types.js').RhinofiSdaToken} RhinofiSdaToken */
/** @typedef {import('./src/types.js').RhinofiTokenLimits} RhinofiTokenLimits */
/** @typedef {import('./src/types.js').RhinofiSdaDepositAddress} RhinofiSdaDepositAddress */
/** @typedef {import('./src/types.js').RhinofiDepositAddressExtras} RhinofiDepositAddressExtras */
/** @typedef {import('./src/types.js').RhinofiSdaTransfer} RhinofiSdaTransfer */
/** @typedef {import('./src/types.js').RhinofiTransferExtras} RhinofiTransferExtras */
/** @typedef {import('./src/types.js').RhinofiChainMetadata} RhinofiChainMetadata */

/** @typedef {import('./src/errors.js').SdaExecutionErrorDetails} SdaExecutionErrorDetails */

export { default, default as RhinofiProtocol } from './src/rhinofi-protocol.js'
export { ISdaProtocol } from '@tetherto/wdk-wallet/protocols'
export {
  RhinofiProtocolError,
  ConfigurationError,
  ValueError,
  UnsupportedChainError,
  UnsupportedTokenError,
  NoSuchElementError,
  SdaExecutionError
} from './src/errors.js'
