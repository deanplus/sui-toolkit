# Changelog


## [0.4.0]

### Changed - 2026-09-02
- Network & RPC Migration:
  - Migrated client from deprecated JSON-RPC to official Sui gRPC architecture (`SuiGrpcClient`).
  - Upgraded `@mysten/sui` to 2.x and migrated from legacy `@mysten/dapp-kit` to `@mysten/dapp-kit-react` & `@mysten/dapp-kit-core`.
  - Replaced `SuiClientProvider` and `WalletProvider` with `DAppKitProvider` configured via `createDAppKit`.
  - Updated Bulk Transfer and Coin Manager to use gRPC-compatible query methods (`listBalances`, `listCoins`) and promise-based transaction execution.
- Tooling & Documentation:
  - Unified package manager commands and build/deployment scripts from yarn to `pnpm`.
- Monorepo Architecture:
  - Structured repository into a pnpm workspace with root package.json and unified lockfile.


## [0.3.1] 

### Fixed - 2026-06-01
- Client startup:
  - Aligned `@mysten/sui` with dapp-kit to avoid duplicate `Transaction` types in wallet signing.
  - Removed unused Coin Operation Dialog code that triggered ESLint warnings.
- Coin Manager:
  - Capped merge selections at 512 coin objects, with a warning when Select All has to narrow a larger selection.

### Added - 2025-05-29
- Coin Manager improvements:
  - Added two-step confirmation for merge and clean operation

### Added - 2025-05-23
- Coin Manager improvements:
  - Implemented pagination for coin fetching to support wallets with large number of coins

### Added - 2025-05-22
- Bulk Transfer module improvements:
  - Added validation to prevent negative transfer amounts
  - Added real-time Sui address validation with visual feedback
- Coin Manager improvements:
  - Added coin icons display for better visual identification
  - Special handling for SUI coin with dedicated icon
  - Fallback display for coins without icon metadata


## [0.3.0] - 2025-05-16

### Added
  - Display coin values based on real-time price data
  - Burn functionality for individual coins and batch operations
  - Low value coin identification and batch burning

## [0.2.0] - 2025-05-11

### Added
- Coin Manager module:
  - View all coin types and their objects in your wallet
  - Batch merge same-type coin objects (including SUI and other tokens)
  - Batch clean zero-balance coin objects
  - Merge or clean zero-balance for a single coin type
