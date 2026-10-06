# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities responsibly. **Do not open a public
GitHub issue for security reports.**

Email **security@rhino.fi** with a description of the issue, the affected
version, and steps to reproduce. You will receive an acknowledgement, and we
will keep you informed of the fix and disclosure timeline.

## Key material

This module **never accesses private keys and never broadcasts a transaction**.
Smart Deposit Addresses need no signature from the depositor: funds arrive by an
ordinary transfer that the user makes themselves, and rhino.fi sweeps and
converts them. The only thing this module reads from a bound wallet account is
`account.getAddress()`, used as the default delivery destination — a read-only
account is sufficient for every operation. It does not read `account.keyPair`,
and never logs or persists private keys, seed phrases, or signed transactions.

## Custody model

rhino.fi Smart Deposit Addresses are **trusted-operator**, not self-custodial.
Between the deposit landing and the converted asset being delivered, the funds
are under rhino.fi's control. Deposit addresses are issued by rhino.fi and
cannot be derived or verified client-side, which is why this module does not
implement `deriveDepositAddress`.

## Operational guidance

- rhino.fi issues two key types. A standard key covers quotes, address creation
  and public reads, and is safe to use client-side. A `SECRET_` key additionally
  reads history and manages addresses, so supply it via configuration or secret
  management, keep it server-side, and never commit it. Of this module's
  methods, `getTransfers`, `getTransfer`,
  `disableDepositAddress` and `enableDepositAddress` need a `SECRET_` key.
  rhino.fi also withholds `destinationAddress` from a standard key; the
  module leaves it unset in that case rather than substituting a value, so
  don't rely on reading it back with a standard key.
- Verify `destinationAddress` before creating an address. It is fixed at
  creation time, and every deposit to that address is delivered there.
- Confirm the deposit address out of band where the value justifies it. Because
  addresses cannot be derived client-side, a tampered API response cannot be
  detected locally.
- On Stellar, always send the `memoId` from `chainMetadata` when depositing to
  the base address. A deposit without it cannot be attributed and needs manual
  recovery.
- `disableDepositAddress` pauses an address; deposits arriving while it is
  paused are rejected and refunded rather than converted.
