export type Blockchain = import("@tetherto/wdk-wallet/protocols").Blockchain;
export type SdaToken = import("@tetherto/wdk-wallet/protocols").SdaToken;
export type SdaDepositAddress = import("@tetherto/wdk-wallet/protocols").SdaDepositAddress;
export type SdaTransfer = import("@tetherto/wdk-wallet/protocols").SdaTransfer;
/**
 * A token accepted by a rhino.fi Smart Deposit Address. Extends the WDK
 * {@link SdaToken} with rhino.fi's per-token deposit limits, which are
 * denominated in USD rather than in the token's own base unit.
 */
export type RhinofiSdaToken = SdaToken & RhinofiTokenLimits;
/**
 * rhino.fi's USD-denominated per-token deposit limits.
 */
export type RhinofiTokenLimits = {
    /**
     * - Smallest deposit rhino.fi will process for this token, in USD.
     */
    minDepositLimitUsd: number;
    /**
     * - Largest deposit rhino.fi will process for this token, in USD.
     */
    maxDepositLimitUsd: number;
};
/**
 * Chain-specific deposit metadata. rhino.fi populates this for Stellar Smart
 * Deposit Addresses, where the muxed (M…) address resolves to a base account
 * plus a memo id — clients that cannot send to a muxed address deposit to the
 * base address and set the memo instead.
 */
export type RhinofiChainMetadata = {
    /**
     * - Discriminator identifying which chain family the metadata describes.
     */
    _tag: "STELLAR";
    /**
     * - The Stellar base account (G…) the muxed deposit address resolves to.
     */
    baseAddress: string;
    /**
     * - The memo id that must accompany a deposit made to `baseAddress`.
     */
    memoId: string;
};
/**
 * A rhino.fi Smart Deposit Address. Extends the WDK {@link SdaDepositAddress}
 * with the rhino.fi lifecycle flags and metadata that have no WDK equivalent.
 * `destinationAddress` is optional here, unlike in WDK: rhino.fi discloses it
 * only to `SECRET_` keys, and this module never substitutes another value.
 */
export type RhinofiSdaDepositAddress = Omit<SdaDepositAddress, "destinationAddress"> & RhinofiDepositAddressExtras;
/**
 * The rhino.fi-specific fields carried on every {@link RhinofiSdaDepositAddress}.
 */
export type RhinofiDepositAddressExtras = {
    /**
     * - The address the converted asset is delivered to. Present only when the API key is a `SECRET_` key.
     */
    destinationAddress?: string;
    /**
     * - Whether rhino.fi is still monitoring the address for incoming deposits.
     */
    isActive: boolean;
    /**
     * - Whether the address currently rejects deposits; toggled by `disableDepositAddress` and `enableDepositAddress`.
     */
    isPaused: boolean;
    /**
     * - The free-form label supplied when the address was created.
     */
    addressNote?: string;
    /**
     * - The address unsuccessful deposits are returned to, when one was configured.
     */
    refundAddress?: string;
    /**
     * - Chain-specific deposit metadata, currently only populated for Stellar.
     */
    chainMetadata?: RhinofiChainMetadata;
};
/**
 * A deposit observed at a rhino.fi Smart Deposit Address. Extends the WDK
 * {@link SdaTransfer} — which carries only `id` and `status` — with the
 * amounts, token and transaction hashes rhino.fi reports for the deposit.
 */
export type RhinofiSdaTransfer = SdaTransfer & RhinofiTransferExtras;
/**
 * The rhino.fi-specific fields carried on every {@link RhinofiSdaTransfer}.
 */
export type RhinofiTransferExtras = {
    /**
     * - The Smart Deposit Address the deposit was sent to.
     */
    address: string;
    /**
     * - The chain the deposit arrived on.
     */
    sourceChain: Blockchain;
    /**
     * - The ticker of the deposited token.
     */
    token?: string;
    /**
     * - The contract address of the deposited token on the source chain.
     */
    tokenAddress?: string;
    /**
     * - The deposited amount, in the token's base unit.
     */
    amount?: bigint;
    /**
     * - The USD value of the deposit at the time it was observed.
     */
    amountUsd?: number;
    /**
     * - The source-chain address the deposit was sent from.
     */
    sender?: string;
    /**
     * - The source-chain hash of the deposit transaction.
     */
    txHash?: string;
    /**
     * - rhino.fi's reason tag for a rejected or refunded deposit, e.g. 'OVER_MAX'.
     */
    reason?: string;
    /**
     * - ISO-8601 timestamp of when the deposit reached its current state.
     */
    createdAt?: string;
};
