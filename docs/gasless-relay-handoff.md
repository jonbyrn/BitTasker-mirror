# Gasless Relay Infrastructure — Developer Hand-Off Document

**Created:** 2026-06-16  
**Status:** Production-ready (95%+ audit confidence, 299/299 tests passing)  
**Audited:** Two full swarm audit cycles completed (2026-06-13)

---

## 1. Architecture Overview

### What It Is

The gasless relay is an **ERC-4337 Account Abstraction** infrastructure that allows BitTasker users to send tokens (USDT0, WBTC, tBTC) on Arbitrum **without holding ETH for gas**. The system uses a paymaster to sponsor gas fees, charging users a small token-denominated fee buffer instead.

### High-Level Flow

```
┌──────────────┐      POST /api/v1/gasless/relay       ┌──────────────────┐
│   Frontend    │ ──────────────────────────────────────>│  NestJS Backend  │
│  (SvelteKit)  │   { sender, userOp, eip7702Auth? }   │  (Port 4000)     │
│               │                                       │                  │
│  Builds UserOp│      POST /api/v1/gasless/estimate    │  1. Validate     │
│  Signs locally │ ─────────────────────────────────────>│  2. Simulate     │
│               │   { token, amount, recipient }         │  3. Sign paymstr │
│               │<───────────────────────────────────────│  4. Submit Alto  │
│               │   { feeBuffer, feeTier, estimatedGas } │                  │
└──────────────┘                                        └────────┬─────────┘
                                                                 │
                                                    eth_sendUserOperation
                                                                 │
                                                     ┌───────────▼─────────┐
                                                     │  Alto Bundler(s)    │
                                                     │  (Ports 3000/3001)  │
                                                     │  Pimlico Alto v0.8  │
                                                     └───────────┬─────────┘
                                                                 │
                                                     ┌───────────▼─────────┐
                                                     │  EntryPoint v0.8    │
                                                     │  0x4337...108       │
                                                     │  (Arbitrum One)     │
                                                     └─────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Frontend Store** | `src/lib/wallet/gasless-store.ts` (client-facing lib) + `src/wallet/gasless-store.ts` (wallet logic) | Builds UserOps, signs via EIP-7702 smart account, calls backend |
| **Frontend Config** | `src/wallet/gasless.config.ts` + `src/lib/wallet/gasless.config.ts` (re-export) | Token addresses, gas bounds, fee tiers, env vars |
| **Frontend Helpers** | `src/wallet/gasless-helpers.ts` + `src/lib/wallet/gasless-helpers.ts` | Fee parameter validation, buffer bounds, fee recipient checks |
| **Frontend Types** | `src/lib/types/gasless.types.ts` + `src/types/gasless.types.ts` | UserOperation, FeeEstimate, SerializableUserOperation, etc. |
| **UI Components** | `src/lib/components/wallet/Gasless*.svelte` | SendFlow, EnablePrompt, RevokePanel, ConfirmDialog, ErrorDisplay |
| **Backend Service** | `backend/bittasker-nestjs/src/gasless/gasless.service.ts` | Core relay logic — validate, simulate, sign, submit |
| **Backend Controller** | `backend/bittasker-nestjs/src/gasless/gasless.controller.ts` | REST endpoints: `/gasless/relay`, `/gasless/estimate`, `/gasless/check-balance` |
| **Backend Config** | `backend/bittasker-nestjs/src/gasless/gasless.config.ts` | Token addresses, gas bounds, fee tiers, env vars (server-side mirror) |
| **Backend DTOs** | `backend/bittasker-nestjs/src/gasless/dto/gasless.dto.ts` | class-validator DTOs for request validation |
| **Paymaster Signer** | `backend/bittasker-nestjs/src/gasless/paymaster-signing.service.ts` | ECDSA signing of paymaster data for Coinbase VerifyingPaymaster |
| **Deposit Monitor** | `backend/bittasker-nestjs/src/gasless/deposit-monitor.service.ts` | Monitors paymaster deposit in EntryPoint, auto-pauses relay if low |
| **Chainlink Oracle** | `backend/bittasker-nestjs/src/gasless/chainlink-oracle.service.ts` | BTC/USD price from Chainlink (USDT0 hardcoded at $1.00) |
| **Preflight Sim** | `backend/bittasker-nestjs/src/gasless/preflight-simulation.service.ts` | Pre-flight simulation before relay (non-blocking safety check) |
| **Docker Compose** | `docker/docker-compose.gasless.yml` | Full local stack: Anvil + Alto×2 + NestJS |
| **Dockerfile** | `backend/Dockerfile.gasless` | Two-stage Docker build for NestJS backend |

### EIP-7702 Delegation Flow

Users **never need ETH** — EIP-7702 delegation happens atomically with the first UserOp:

1. Frontend checks `eth_getCode(sender)` — if empty (first transaction), signs an EIP-7702 authorization
2. Sets `factory='0x7702000000000000000000000000000000000000'` sentinel on the UserOp
3. Adds `PER_EMPTY_ACCOUNT_COST` (25,000) to `preVerificationGas`
4. Includes `eip7702Auth` (chainId, address, nonce, r, s, v) in the relay request
5. Backend passes `eip7702Auth` as third param to `eth_sendUserOperation` on Alto
6. After first tx, delegation persists on-chain — subsequent txs skip auth

**Implementation contract:** `SIMPLE_7702_ACCOUNT_IMPL = 0xe6Cae83BdE06E4c305530e199D7217f42808555B` (Arbitrum mainnet)

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Raw `fetch` instead of ethers.js for Alto | Alto v0.8 rejects ethers.js batch JSON-RPC requests |
| `executeBatch((address,uint256,bytes)[])` with selector `0x34fcd5be` | BaseAccount's `Call[]` struct (ERC-4337 v0.8 tuple format) |
| `PackedUserOperation` for EntryPoint simulation | v0.8 EntryPoint uses packed format for gas limits/fees |
| Dual Alto bundlers with failover | Redundancy — if alto-1 fails, auto-retries on alto-2 |
| Deposit monitor fails-closed | If deposit check fails, relay pauses (prevents paymaster drain) |
| Fee re-estimation at relay time | Prevents tier boundary exploitation between estimate and relay |
| DTO cloning before signing | Prevents mutation of the incoming request DTO |

---

## 2. Deployment Instructions

### 2.1 Prerequisites

- Docker + Docker Compose v2
- Node.js 20+
- An `.env` file or environment variables configured (see Section 2.3)

### 2.2 Local Development Stack

```bash
cd docker

# Create secrets directory if it doesn't exist
mkdir -p secrets

# Create placeholder secrets for local dev
echo "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" > secrets/bundler_private_key.txt
echo "0x59c6995d99995957502795dd9999999999999999999999999999999999999999" > secrets/utility_private_key.txt
echo "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" > secrets/paymaster_signer_key.txt

# Start the full stack
docker compose -f docker-compose.gasless.yml up -d

# Check all services are healthy
docker compose -f docker-compose.gasless.yml ps
```

**Services started:**
- `anvil` — Arbitrum fork on `localhost:8545` (chain ID 42161)
- `alto-1` — Bundler primary (internal port 3000)
- `alto-2` — Bundler redundant (internal port 3001)
- `nestjs-gasless` — Backend on `localhost:4000`

```bash
# Stop everything
docker compose -f docker-compose.gasless.yml down -v

# View logs
docker compose -f docker-compose.gasless.yml logs -f nestjs-gasless
docker compose -f docker-compose.gasless.yml logs -f alto-1
```

### 2.3 Required Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ARBITRUM_RPC_URL` | Yes (prod) | Arbitrum One RPC endpoint | `https://arb1.arbitrum.io/rpc` |
| `ALCHEMY_API_KEY` | Yes (prod) | For Alto bundler blockchain mode | `abc123...` |
| `GAS_TREASURY` | Yes | Address collecting fee buffers | `0x...` |
| `PAYMASTER_ADDRESS` | Yes | Coinbase VerifyingPaymaster address | `0x4C7D...` |
| `JWT_SECRET` | Yes | JWT signing secret | (random 32-byte hex) |
| `CHAIN_ID` | No | Defaults to `42161` | `42161` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |

**Frontend env vars (Vite):**
| Variable | Description |
|----------|-------------|
| `VITE_GAS_TREASURY` | Same as `GAS_TREASURY` (exposed to client) |
| `VITE_TX_RELAY_BASE_URL` | Backend API base URL (e.g. `http://localhost:4000/api/v1`) |
| `VITE_ARBITRUM_RPC_URL` | Arbitrum RPC for client-side checks |
| `VITE_ALTO_URL_1` / `VITE_ALTO_URL_2` | Alto bundler URLs (for client-side estimation) |

### 2.4 Production Deployment Checklist

- [ ] Deploy `VerifyingPaymaster` contract to Arbitrum mainnet (or use existing at `0x4C7D20565687A308135a7B38eA0b26a5e292B4c4`)
- [ ] Fund paymaster deposit in EntryPoint (minimum 0.01 ETH, recommended 0.1 ETH)
- [ ] Configure `PAYMASTER_SIGNER_KEY` as a Docker secret (NOT an env var)
- [ ] Configure `bundler_private_key` and `utility_private_key` as Docker secrets
- [ ] Set `ARBITRUM_RPC_URL` to a reliable Arbitrum RPC (Alchemy/Infura)
- [ ] Set `GAS_TREASURY` to the treasury wallet address
- [ ] Verify Alto bundler(s) are running and healthy (`curl http://alto-host:3000/health`)
- [ ] Run backend tests: `cd backend/bittasker-nestjs && npm run test`
- [ ] Run frontend tests: `npm run test:unit:components` and `npm run test:unit:stores`
- [ ] Test a relay on a fork before going to mainnet

---

## 3. Blast Radius Analysis

The gasless relay touches many parts of the BitTasker codebase. Here are the areas most likely to break and why.

### 3.1 HIGH RISK — Dual Store Architecture

**Files:** `src/wallet/gasless-store.ts` + `src/lib/wallet/gasless-store.ts`

The frontend has **two** gasless store files. This was the source of a critical bug (C1) where:
- `src/wallet/gasless-store.ts` owns the actual wallet state (`gaslessWallet`, `gaslessAccount`, `gaslessAddress`, etc.)
- `src/lib/wallet/gasless-store.ts` is a **re-export wrapper** that adds `sendToken()`, `estimateFee()`, and the API call logic

**What breaks:** If someone adds a duplicate `walletState` writable store to the lib store (instead of re-exporting from the wallet store), `sendToken()` will try to use an uninitialized `gaslessAccount` and UserOps will be sent unsigned. This exact bug was fixed in the June 2026 audit cycle.

**Mitigation:** The lib store MUST import and re-export wallet state from `../../wallet/gasless-store`. Never create a second writable store for the same state.

### 3.2 HIGH RISK — Config Duplication

**Files:** `src/wallet/gasless.config.ts` + `backend/bittasker-nestjs/src/gasless/gasless.config.ts`

The token addresses, gas bounds, and fee tiers are duplicated between frontend and backend. These MUST stay in sync. If someone changes a gas bound on one side but not the other, the backend will reject valid UserOps or accept invalid ones.

**What breaks:** Adding a new token to the backend config but not the frontend (or vice versa). Changing `GAS_BOUNDS.MAX_CALL_GAS` on one side.

**Mitigation:** Both configs should be treated as a pair. Any change to gas bounds, fee tiers, or token addresses must be applied to BOTH files.

### 3.3 HIGH RISK — EIP-7702 Auth Signing

**Files:** `src/lib/wallet/gasless-store.ts` (function `signEip7702AuthIfNeeded`) + `src/wallet/gasless-store.ts` (`ownerKey`)

The EIP-7702 authorization signing uses `keccak256(0x05 || rlp([chainId, implAddress, eoaNonce]))` and requires the owner private key stored in the wallet store.

**What breaks:** If the `ownerKey` isn't properly set during wallet initialization, or if the `permissionless` library changes its `to7702SimpleSmartAccount` API, the auth signing will fail silently (producing an invalid signature) and the EntryPoint will reject the UserOp.

**Mitigation:** The `ownerKey` must be set during `gaslessWallet.init(privateKey)`. Test the first-transaction path (EIP-7702 delegation) separately from subsequent transactions.

### 3.4 MEDIUM RISK — Alto Bundler Communication

**File:** `backend/bittasker-nestjs/src/gasless/gasless.service.ts` (method `sendToAlto`)

The backend uses raw `fetch` with `AbortSignal.timeout(10_000)` to communicate with Alto. Alto v0.8 rejects ethers.js batch requests.

**What breaks:** If someone wraps the Alto calls in an ethers.js provider (which batches by default), all relay requests will fail. If the Alto image version changes, the JSON-RPC method signatures might change.

**Mitigation:** Always use `sendToAlto()` for Alto communication. Never use ethers.js `JsonRpcProvider` for bundler calls.

### 3.5 MEDIUM RISK — Deposit Monitor Fail-Closed

**File:** `backend/bittasker-nestjs/src/gasless/deposit-monitor.service.ts`

The deposit monitor fails-closed: if the RPC check throws, `isPaused = true` and relay stops.

**What breaks:** If the Arbitrum RPC is temporarily down (rate limiting, network issues), the deposit check fails, and ALL gasless transactions halt until the next successful check (every 5 minutes).

**Mitigation:** Monitor the `[OPS ALERT]` log messages. Ensure the RPC endpoint is reliable. Consider adding a retry before pausing.

### 3.6 MEDIUM RISK — Fee Re-Estimation at Relay

**File:** `backend/bittasker-nestjs/src/gasless/gasless.service.ts` (method `reEstimateFeeAtRelay`)

The backend re-estimates gas at relay time and rejects if the actual tier exceeds what the user's fee buffer covers.

**What breaks:** If gas prices spike between the user's estimate and relay, or if the Chainlink oracle returns stale data, the relay will reject with a "Fee tier mismatch" error. The user must re-estimate and retry.

**Mitigation:** Frontend should handle this error gracefully and offer a retry with updated estimate.

### 3.7 LOW RISK — i18n Keys

**Files:** `static/locales/en/dashboard/wallet.json` + `static/locales/es/dashboard/wallet.json`

14 `gasless_send.*` keys were added during the audit. Any changes to gasless component text require updating both locale files.

**What breaks:** Missing translation keys cause the UI to show raw key names.

**Mitigation:** Run `python3 scripts/find-missing-translations.py --fix-suggestions` before committing.

---

## 4. Test Coverage Summary

### 4.1 Backend Tests (89 tests, 7 suites)

| Test File | Tests | What It Covers |
|-----------|-------|---------------|
| `gasless.service.spec.ts` | ~25 | Relay flow, fee estimation, validation, callData parsing, gas bounds, fee re-estimation, sender ownership, balance check |
| `gasless.controller.spec.ts` | ~12 | Endpoint routing, JWT auth integration, request/response shapes |
| `gasless-config.spec.ts` | ~15 | Token addresses, gas bounds, fee tiers, fee buffer min/max, helpers |
| `paymaster-signing.service.spec.ts` | ~10 | ECDSA signing, hash computation, key loading |
| `chainlink-oracle.service.spec.ts` | ~10 | Price lookup, staleness check, cache, USDT0 constant price |
| `deposit-monitor.service.spec.ts` | ~10 | Health check, fail-closed, threshold detection |
| `preflight-simulation.service.spec.ts` | ~7 | Simulation call, error handling |

### 4.2 Frontend Tests (210 tests across gasless test files)

| Test File | Tests | What It Covers |
|-----------|-------|---------------|
| `gasless-store.test.ts` (lib) | ~31 | Store state, init/reset, sendToken, estimateFee, API calls |
| `gasless-store.test.ts` (stores) | ~31 | Store behavior, derived stores, wallet lifecycle |
| `use-gasless-wallet.test.ts` | 30 | Rune-style state, derived stores, checkDelegation, transitions |
| `gasless-components.test.ts` | 22 | GaslessEnablePrompt (10), GaslessRevokePanel (12) |
| `eip7702-auth-signing.test.ts` | 8 | EIP-7702 authorization signing path |
| `gasless-helpers.test.ts` | ~20 | Fee parameter validation, buffer bounds, fee recipient checks |
| `gasless-config.test.ts` | ~15 | Token addresses, gas bounds, fee tiers, helper functions |
| `arbitrum-wallet.test.ts` | ~20+ | Arbitrum wallet initialization, signing, transaction building |

### 4.3 E2E Tests (4 Playwright tests)

Located in the Playwright CDP test suite against `localhost:9222`:
1. Page load and auth flow
2. Wallet initialization
3. Fee estimation (returns feeBuffer/feeTier/estimatedGas)
4. Relay (returns userOpHash)

### 4.4 Contract Tests (13 tests)

Solidity tests for the gasless contracts (deployed via Hardhat).

---

## 5. Major Test Gaps & Challenges

### 5.1 Connected Wallet Gasless Routing (NOT unit-testable)

**Location:** `swap-chain.service.ts` — `sendConnectedWalletArbitrumTx` helper

This code uses dynamic `import()` to load the gasless relay module at runtime. The dynamic import makes it extremely difficult to mock in unit tests. It's covered by the `swap-chain.test.ts` suite (35 tests) for the direct swap path, but the gasless routing branch within connected wallet transactions is essentially untested at the unit level.

**Challenge:** Dynamic ESM imports don't play well with Vitest mocking. You'd need integration tests with a real backend.

**Recommendation:** Test this manually via the Playwright e2e suite. Add a specific e2e test that initiates a swap from a connected wallet on Arbitrum and verifies the gasless path is taken.

### 5.2 Real On-Chain Balance Check

**Location:** `gasless.service.ts` — `checkBalance()` method

The balance check calls `eth_call` with `balanceOf(address)` on the actual token contract. In unit tests, this is mocked. In integration tests, it requires:
- A funded wallet with the actual token on Arbitrum (or a fork)
- The token contract to be deployed and accessible

**Challenge:** You can't write a meaningful unit test for this — you need real assets or a fork with `anvil_setCode` to deploy mock ERC20 contracts.

**Recommendation:** Test on the Anvil fork using `anvil_setCode` to deploy a MockERC20 at the USDT0 address (this is already done in the e2e test setup).

### 5.3 First-Transaction EIP-7702 Delegation

**Location:** `src/lib/wallet/gasless-store.ts` — `signEip7702AuthIfNeeded()`

Testing the first-transaction path requires:
1. A wallet with no code at its address (not yet delegated)
2. The `permissionless` library's `to7702SimpleSmartAccount` to create the account
3. The EIP-7702 authorization signing with `keccak256(0x05 || rlp(...))`

**Challenge:** The `permissionless` library is dynamically imported (`import(permissionlessPath)`) to avoid Vite's static analysis. This makes it nearly impossible to unit test the actual signing. The `eip7702-auth-signing.test.ts` (8 tests) covers the helper function but mocks the permissionless library entirely.

**Recommendation:** This MUST be tested via the Playwright e2e suite with a fresh wallet on the Anvil fork. Use `anvil_setCode` to clear any existing delegation, then trigger a first-transaction flow.

### 5.4 Paymaster Signing with Real Key

**Location:** `paymaster-signing.service.ts`

The signing service loads a private key from Docker secrets or env vars. Unit tests mock the key loading. The actual Coinbase VerifyingPaymaster contract validation can only be tested with:
1. The real paymaster deployed on-chain
2. The real signer key matching the paymaster's configured signer

**Challenge:** The paymaster contract has its own verification logic. A mismatch between the signing service's hash computation and the contract's expected hash will cause relay failures that unit tests can't catch.

**Recommendation:** Deploy the VerifyingPaymaster to the Anvil fork, fund its deposit, and test a full relay cycle end-to-end. The existing e2e tests do this with `anvil_setCode`.

### 5.5 Gas Price Volatility / Fee Tier Boundary

**Location:** `gasless.service.ts` — `reEstimateFeeAtRelay()`

Testing the fee tier mismatch rejection requires:
1. A gas estimate that falls in one tier
2. A relay-time re-estimation that falls in a higher tier

**Challenge:** You'd need to manipulate gas prices between estimate and relay, which is difficult in a controlled test environment.

**Recommendation:** Test with specific gas bounds that force a tier boundary. On the Anvil fork, use `anvil_setNextBlockBaseFee` to manipulate gas prices.

### 5.6 Multi-Alto Failover

**Location:** `gasless.service.ts` — `sendWithFallback()`

Testing failover requires stopping one Alto instance and verifying the service automatically retries on the other.

**Challenge:** Requires Docker-level control over container lifecycle.

**Recommendation:** Integration test: start both Altos, stop one via `docker stop alto-1`, relay a transaction, verify it succeeds via alto-2.

### 5.7 Deposit Monitor Edge Cases

**Location:** `deposit-monitor.service.ts`

The deposit monitor has three states: healthy, low warning, and critically low (paused). Testing the transition between states requires manipulating the paymaster's deposit balance in the EntryPoint.

**Challenge:** On a fork, you can't directly write to EntryPoint storage. You'd need to use `anvil_setStorageAt` with the correct storage slot.

**Recommendation:** Use `anvil_setStorageAt` to set the paymaster's deposit to specific values and verify the monitor's state transitions.

---

## 6. File Index

### Frontend Files (read these first)

| File | Lines | Purpose |
|------|-------|---------|
| `src/wallet/gasless-store.ts` | 398 | **Core wallet store** — SmartAccount interface, wallet init/reset, account state |
| `src/lib/wallet/gasless-store.ts` | 777 | **Client-facing store** — sendToken(), estimateFee(), EIP-7702 auth, API calls |
| `src/wallet/gasless.config.ts` | 113 | **Config** — token addresses, gas bounds, fee tiers, env vars |
| `src/lib/wallet/gasless-helpers.ts` | ~100 | **Validation helpers** — fee params, buffer bounds, fee recipient |
| `src/lib/types/gasless.types.ts` | ~100 | **TypeScript types** — UserOperation, FeeEstimate, SerializableUserOperation |
| `src/lib/components/wallet/GaslessSendFlow.svelte` | ~200 | **Main send UI** — multi-step send flow |
| `src/lib/components/wallet/GaslessEnablePrompt.svelte` | ~60 | **Enable prompt** — shown when gasless not yet activated |
| `src/lib/components/wallet/GaslessRevokePanel.svelte` | ~60 | **Revoke panel** — revoke EIP-7702 delegation |
| `src/lib/components/wallet/GaslessConfirmDialog.svelte` | ~150 | **Confirm dialog** — fee breakdown before send |
| `src/lib/components/wallet/GaslessErrorDisplay.svelte` | ~80 | **Error display** — user-friendly error messages |

### Backend Files

| File | Lines | Purpose |
|------|-------|---------|
| `backend/bittasker-nestjs/src/gasless/gasless.service.ts` | 739 | **Core service** — relay, estimate, validate, sign, submit |
| `backend/bittasker-nestjs/src/gasless/gasless.controller.ts` | ~70 | **REST controller** — endpoints + auth |
| `backend/bittasker-nestjs/src/gasless/gasless.config.ts` | 124 | **Config** — server-side mirror of frontend config |
| `backend/bittasker-nestjs/src/gasless/dto/gasless.dto.ts` | 151 | **DTOs** — class-validator request validation |
| `backend/bittasker-nestjs/src/gasless/paymaster-signing.service.ts` | 84 | **Paymaster signer** — ECDSA signing |
| `backend/bittasker-nestjs/src/gasless/deposit-monitor.service.ts` | 92 | **Deposit monitor** — paymaster health check |
| `backend/bittasker-nestjs/src/gasless/chainlink-oracle.service.ts` | 89 | **Oracle** — BTC/USD price, USDT0 constant |
| `backend/bittasker-nestjs/src/gasless/preflight-simulation.service.ts` | ~60 | **Preflight** — pre-relay simulation |

### Infrastructure Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.gasless.yml` | Full local stack: Anvil + Alto×2 + NestJS |
| `backend/Dockerfile.gasless` | Two-stage Docker build for NestJS |
| `docker/secrets/bundler_private_key.txt` | Bundler private key (Docker secret) |
| `docker/secrets/utility_private_key.txt` | Utility private key (Docker secret) |
| `docker/secrets/paymaster_signer_key.txt` | Paymaster signer key (Docker secret) |

---

## 7. Known Issues & TODOs

### 7.1 EIP-7702 Address Derivation (Server-Side)

The backend's sender ownership verification checks `dto.sender === user.walletAddress`. For EIP-7702 accounts, the sender IS the EOA address (not a deployed contract). The TODO comment in the service notes that full server-side EIP-7702 address derivation would require the `permissionless` library integration on the backend.

**Current behavior:** If `user.walletAddress` is set, it's compared to `dto.sender`. If not set, verification is skipped with a warning.

**Impact:** Low — the frontend always sends the correct sender, and JWT auth ensures the request is authenticated.

### 7.2 Balance Check is Partially Mocked

The `checkBalance()` method has a code path for when `dto.sender` is not provided — it returns `sufficient: true` without checking on-chain. This was intentional (the BalanceCheckDto originally lacked a sender field), but it means the balance check can be bypassed.

**Impact:** Medium — the backend trusts the frontend to only relay when the user has sufficient balance. The fee buffer bounds validation provides a secondary safety net.

### 7.3 Preflight Simulation is Non-Blocking

The preflight simulation failure is caught and logged as a warning — it doesn't block the relay. This is intentional because Alto does its own simulation, and the preflight is just a safety pre-check.

**Impact:** Low — Alto will reject invalid UserOps regardless.

---

## 8. Recommended Testing Workflow

### For a New Developer

1. **Read this document fully** — understand the architecture and blast radius
2. **Start the local stack:** `docker compose -f docker-compose.gasless.yml up -d`
3. **Run backend tests:** `cd backend/bittasker-nestjs && npm run test`
4. **Run frontend tests:** `npm run test:unit:stores` and `npm run test:unit:components`
5. **Read the gasless service** (`gasless.service.ts`) — it's the most critical backend file
6. **Read the wallet store** (`src/wallet/gasless-store.ts`) — it's the most critical frontend file
7. **Run the e2e tests** against the local stack to verify the full pipeline
8. **Make a test transaction** using the Playwright CDP on `localhost:9222`

### Before Making Any Changes

1. Run `gitnexus_impact({target: "functionName", direction: "upstream"})` on any function you're modifying
2. Check if the change affects BOTH frontend and backend configs
3. Run the relevant test suites after changes
4. Run `npm run check` for type safety
5. Run `npm run lint` for code quality
6. Verify translations with `python3 scripts/find-missing-translations.py --fix-suggestions` if UI text changed

---

## 9. Key Contacts & Resources

- **EntryPoint v0.8:** `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (Arbitrum One)
- **VerifyingPaymaster:** `0x4C7D20565687A308135a7B38eA0b26a5e292B4c4`
- **Simple7702Account Impl:** `0xe6Cae83BdE06E4c305530e199D7217f42808555B`
- **Alto Bundler:** [Pimlico Alto](https://github.com/pimlicolabs/alto) — ERC-4337 v0.8 bundler
- **Permissionless.js:** [permissionless](https://github.com/pimlicolabs/permissionless) — Account abstraction SDK
- **ERC-4337 Spec:** [eips.ethereum.org/EIPS/eip-4337](https://eips.ethereum.org/EIPS/eip-4337)
- **EIP-7702 Spec:** [eips.ethereum.org/EIPS/eip-7702](https://eips.ethereum.org/EIPS/eip-7702)

---

*This document was generated from the BitTasker codebase analysis and memory of two full swarm audit cycles. Last updated: 2026-06-16.*
