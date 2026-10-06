# Changelog

## 1.1.0

### Minor Changes

- 5c414dd: Throw WDK error types: `ValueError` and `NoSuchElementError` are now the `@tetherto/wdk-wallet` classes, `ConfigurationError` extends `ValueError`, `UnsupportedChainError`/`UnsupportedTokenError` extend `SdaError`, and `SdaExecutionError` extends `ProviderError` with a `reason`. `RhinofiProtocolError` and `NoSuchElementError#id` are removed. Unrecognized transfer statuses now map to `pending` instead of `processing`. README gains WDK compatibility, Known limitations, Examples and Support sections

### Patch Changes

- Updated dependencies [fb7dbb0]
- Updated dependencies [ba55886]
- Updated dependencies [87d9e5d]
  - @rhino.fi/sdk@3.4.0

## 1.0.1

### Patch Changes

- 3ec8703: Add the official "Built with WDK" badge to the README, bump `@tetherto/wdk-wallet` to `1.0.0-beta.19` and `bare-node-runtime` to `1.5.0`, and pin patched `axios`, `ws` and `uuid` through npm `overrides`
- Updated dependencies [3ec8703]
  - @rhino.fi/sdk@3.3.0

## 1.0.0

### Patch Changes

- fe7b5ce: Bump dependencies

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1] - Unreleased

Initial release: the WDK `SdaProtocol` implementation backed by rhino.fi Smart
Deposit Addresses.
