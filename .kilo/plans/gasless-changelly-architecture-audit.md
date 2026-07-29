# Architecture Audit: Gasless & Changelly-Fiat NestJS Modules

**Auditor**: Architecture Agent  
**Date**: 2026-07-07  
**Scope**: `backend/bittasker-nestjs/src/gasless/` + `backend/bittasker-nestjs/src/changelly-fiat/`  
**Files Reviewed**: 19 source files (10 gasless, 4 changelly-fiat, 2 shared app files, 3 test-only patterns)

---

## Executive Summary

Both modules are well-structured NestJS modules with clean boundaries and no circular dependencies. The gasless module is the more mature of the two, with comprehensive test coverage and a well-thought-out security model. The changelly-fiat module is simpler but has several gaps: no tests, public endpoints that should be auth-gated, `any` casts that defeat type safety, and missing error handling around external API calls. Neither module has rate limiting at the module level (they rely on the global ThrottlerGuard, which is correctly configured).

---

## 1. Module Architecture

**Score: 82/100**

### Gasless Module (gasless/gasless.module.ts)

**Strengths:**
- Clean single responsibility: gasless transaction relay via ERC-4337
- 5 well-separated services: GaslessService (orchestrator), DepositMonitorService, PreflightSimulationService, ChainlinkOracleService, PaymasterSigningService
- Exports are minimal and correct: `[GaslessService, DepositMonitorService, ChainlinkOracleService]` — only the services that other modules might need
- No circular dependencies detected — grep confirms all imports are within-module or to `../auth/providers/jwt-auth.guard` (one-way)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| A1 | MEDIUM | `gasless/gasless.service.ts` | 77-92 | `UserOperation` interface is exported from the service file. It's a domain type used by 3 other services (PreflightSimulationService, PaymasterSigningService, and the DTO). Should be in a shared types file. |
| A2 | LOW | `gasless/gasless.module.ts` | 21 | `DepositMonitorService` is exported but no other module imports it. Same for `ChainlinkOracleService`. Export only `GaslessService` until cross-module consumers exist. |
| A3 | LOW | `gasless/gasless.service.ts` | 38-69 | ABI constants (`SIMPLE_ACCOUNT_ABI`, `ERC20_ABI`) are defined inline. They should be in `gasless.config.ts` or a dedicated `abi.ts` file for reuse and testability. |

### Changelly-Fiat Module (changelly-fiat/changelly-fiat.module.ts)

**Strengths:**
- Clean single responsibility: fiat on/off ramp via Changelly
- Minimal exports: `[ChangellyFiatService]`
- No cross-module dependencies (only imports `../auth/providers/jwt-auth.guard`)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| A4 | LOW | `changelly-fiat/changelly-fiat.module.ts` | — | No tests exist for this module (0 test files found). Every other module in the project has test coverage. |
| A5 | INFO | `changelly-fiat/changelly-fiat.module.ts` | — | The module is correctly self-contained. No issues with dependency graph. |

---

## 2. Service Layer Design

**Score: 78/100**

### Gasless Module

**Strengths:**
- Clear controller → service → external layering
- `GaslessService` orchestrates: it calls DepositMonitor, PreflightSimulation, ChainlinkOracle, and PaymasterSigning
- Each sub-service has a single concern (deposit health, simulation, price feeds, signing)
- Business logic is in the service, not the controller (controller just delegates)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| B1 | HIGH | `gasless/gasless.service.ts` | 110-739 | **God service**: 739 lines. `GaslessService` handles relay, estimation, balance checking, callData validation, fee re-estimation, callData building, and Alto communication. This violates single responsibility. |
| B2 | MEDIUM | `gasless/gasless.service.ts` | 130-149 | `sendToAlto()` is a raw HTTP client that should be extracted to an `AltoClientService`. This would enable mocking in tests (currently tests mock `global.fetch`). |
| B3 | MEDIUM | `gasless/gasless.service.ts` | 362-442 | `checkBalance()` does raw RPC calls (`eth_call`) via `fetch`. This should be in a `BalanceCheckerService` or use the existing ethers provider pattern from other services. |
| B4 | MEDIUM | `gasless/gasless.service.ts` | 491-558 | `validateCallData()` is a complex validation function (67 lines) that parses ABI-encoded data, checks fee recipients, and validates buffer bounds. This should be a dedicated `CallDataValidatorService`. |
| B5 | LOW | `gasless/deposit-monitor.service.ts` | 16-28 | Constructor does async work (`checkDeposit()`) and sets up `setInterval`. NestJS best practice is `OnModuleInit` for lifecycle hooks. The `setInterval` is never cleaned up (no `OnModuleDestroy`). |
| B6 | LOW | `gasless/deposit-monitor.service.ts` | 88-91 | `notifyOps()` is a stub that only logs. Should be wired to an alerting system (Sentry, PagerDuty, email). |

### Changelly-Fiat Module

**Strengths:**
- Clean controller → service → SDK layering
- Service correctly wraps the official SDK (`@changelly/fiat-api-sdk-node`)
- `OnModuleInit` for lazy initialization (good pattern)
- `requireClient()` provides clear error when SDK not configured

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| B7 | HIGH | `changelly-fiat/changelly-fiat.controller.ts` | 75, 92, 113 | **`as any` casts defeat type safety**: `offerParams as any` (line 92, 113) and `body as any` (line 125). The controller builds a `Record<string, unknown>` and casts it to the SDK's expected type. This bypasses compile-time checks. |
| B8 | MEDIUM | `changelly-fiat/changelly-fiat.service.ts` | 108-140 | `getSellOffers()` manually signs and sends HTTP requests instead of using the SDK. The comment says "SDK doesn't include getSellOffers method" — this is a fragile pattern that will break if the SDK's signing logic changes. |
| B9 | MEDIUM | `changelly-fiat/changelly-fiat.service.ts` | 125-139 | `getSellOffers()` has no timeout on the `fetch` call. If Changelly's API hangs, the request will block indefinitely. |
| B10 | MEDIUM | `changelly-fiat/changelly-fiat.service.ts` | 134-136 | Error handling in `getSellOffers()` and `getOrderStatus()` throws raw `Error` instead of NestJS exceptions. These will be caught by the global exception filter but without proper HTTP status codes. |
| B11 | LOW | `changelly-fiat/changelly-fiat.service.ts` | 25 | `CHANGELLY_FIAT_BASE` is hardcoded as a constant. Should be configurable via `ConfigService` for testing/staging environments. |

---

## 3. Configuration Management

**Score: 71/100**

### Gasless Module

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| C1 | HIGH | `gasless/gasless.config.ts` | 68-84 | **Configuration is read at module import time** via `process.env[...]` with `??` defaults. This means: (1) config cannot be overridden in tests without setting env vars before import, (2) `ConfigService` is not used, (3) values are frozen at import time and won't reflect runtime config changes. The service also injects `ConfigService` (line 120) but only uses it in `checkBalance()` (line 392). |
| C2 | MEDIUM | `gasless/gasless.config.ts` | 70-72 | `GAS_TREASURY` defaults to empty string and only warns. If not set, fee collection silently fails. Should be a required env var that fails startup (like `main.ts` does for `JWT_SECRET`). |
| C3 | MEDIUM | `gasless/gasless.config.ts` | 80-82 | Dead code: `if (!ARBITRUM_RPC_URL)` can never be true because the `??` on line 79 provides a default. |
| C4 | LOW | `gasless/gasless.config.ts` | 92-93 | `PAYMASTER_SIGNER_KEY_FILE` defaults to `/run/secrets/paymaster_signer_key`. This is a Docker-specific path that will fail in non-containerized environments. |
| C5 | LOW | `gasless/deposit-monitor.service.ts` | 17 | Reads `process.env['ARBITRUM_RPC_URL']` directly instead of using `ConfigService` or the centralized config from `gasless.config.ts`. Same pattern in `preflight-simulation.service.ts:21` and `chainlink-oracle.service.ts:33`. |
| C6 | LOW | `gasless/paymaster-signing.service.ts` | 42 | Reads `process.env['CHAIN_ID']` directly. Should use `ConfigService` or `gasless.config.ts`. |

### Changelly-Fiat Module

**Strengths:**
- Uses `ConfigService` correctly for all env vars (lines 36-38 of service)
- Graceful degradation: warns and returns early if keys not configured

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| C7 | LOW | `changelly-fiat/changelly-fiat.service.ts` | 25 | `CHANGELLY_FIAT_BASE` URL is hardcoded. Should come from config for environment flexibility. |

---

## 4. API Design

**Score: 85/100**

### Gasless Module

**Strengths:**
- RESTful: POST for mutations (relay, estimate, balance)
- URI versioning: `{ path: 'gasless', version: '1' }` → `/api/v1/gasless/...`
- Consistent `@HttpCode(HttpStatus.OK)` on POST endpoints
- Auth handled by global `JwtAuthGuard` with `@Public()` decorator for the balance endpoint

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| D1 | MEDIUM | `gasless/gasless.controller.ts` | 55-63 | `checkBalance` is `@Public()` — no auth required. This endpoint takes a `token` and `sender` address and performs an on-chain balance check. While not directly dangerous (it's read-only), it could be used for address enumeration or oracle manipulation if combined with timing attacks. Consider requiring auth. |
| D2 | LOW | `gasless/gasless.controller.ts` | 39, 49, 60 | Return types are inline (`Promise<{ userOpHash: string }>`, `Promise<FeeEstimate>`, etc.). Should use dedicated response DTOs for Swagger documentation. |
| D3 | LOW | `gasless/gasless.controller.ts` | 40, 51, 62 | Logging includes user IDs and token addresses. Ensure these don't leak to production logs in a way that violates privacy requirements. |

### Changelly-Fiat Module

**Strengths:**
- RESTful: GET for reads, POST for mutations
- URI versioning: `{ path: 'changelly/fiat', version: '1' }` → `/api/v1/changelly/fiat/...`
- Proper use of query params for GET, body for POST

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| D4 | HIGH | `changelly-fiat/changelly-fiat.controller.ts` | 47, 54, 64, 73, 95, 118, 128, 136, 159 | **All 9 endpoints are `@Public()`** — no authentication required. The justification in the controller comment (lines 5-8) says "Changelly API keys are server-side only" and "rate limiting is handled by global ThrottlerGuard". However, this means: (1) any anonymous user can create orders (`POST /orders`), (2) any anonymous user can query order status, (3) the webhook endpoint has no auth beyond signature validation. The `POST /orders` endpoint especially should require auth — it creates financial orders with wallet addresses. |
| D5 | MEDIUM | `changelly-fiat/changelly-fiat.controller.ts` | 120 | `POST /orders` returns `HttpStatus.OK` (200). For order creation, `HttpStatus.CREATED` (201) would be more semantically correct. |
| D6 | LOW | `changelly-fiat/changelly-fiat.controller.ts` | 49-51, 66-70 | No return type annotations on `getProviders()` and `getAvailableCountries()`. Return types are inferred as `Promise<any>`. |
| D7 | LOW | `changelly-fiat/changelly-fiat.controller.ts` | 139-157 | The webhook handler uses `@Body() body: { orderId: string }` — an inline type instead of the existing `WebhookDto` class (which is defined but unused in `dto/changelly-fiat.dto.ts:133-141`). |

---

## 5. Error Contract

**Score: 74/100**

### Gasless Module

**Strengths:**
- Uses NestJS exception hierarchy: `BadRequestException` (400), `ForbiddenException` (403), `ServiceUnavailableException` (503)
- Relay endpoint has a multi-layer error handler (lines 234-265): re-throws known exceptions, wraps Alto errors as 400, wraps unknown errors as 503
- Fee estimation wraps all errors as 400 (line 357)
- Deposit monitor fails closed (pauses relay when health unknown)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| E1 | MEDIUM | `gasless/gasless.service.ts` | 243 | Error classification uses string matching (`e.message?.includes('Alto error') || e.message?.includes('AA')`). This is fragile — if Alto changes error messages, classification breaks. Should use error codes or custom error classes. |
| E2 | MEDIUM | `gasless/gasless.service.ts` | 234 | `e.message` and `e.stack` are accessed on an untyped `catch` variable. TypeScript strict mode would flag this. Should use `error instanceof Error ? error.message : String(error)`. |
| E3 | LOW | `gasless/preflight-simulation.service.ts` | 68 | `parseRevertReason(error: any)` — uses `any` type. Should use a typed error interface. |
| E4 | LOW | `gasless/gasless.service.ts` | 262 | Unknown relay errors are wrapped as `ServiceUnavailableException` (503). This hides the real error from the client. Consider a generic 500 with a correlation ID for debugging. |

### Changelly-Fiat Module

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| E5 | HIGH | `changelly-fiat/changelly-fiat.service.ts` | 134-136, 195-197 | `getSellOffers()` and `getOrderStatus()` throw raw `Error` instead of NestJS exceptions. The global exception filter will catch these but return 500 with no structured error body. Should throw `ServiceUnavailableException` or `BadRequestException` with a user-friendly message. |
| E6 | MEDIUM | `changelly-fiat/changelly-fiat.controller.ts` | — | No try-catch in any controller method. If the service throws, the global exception filter handles it, but there's no controller-level error enrichment (adding context like "Failed to fetch providers from Changelly"). |
| E7 | LOW | `changelly-fiat/changelly-fiat.service.ts` | 60-62 | `requireClient()` throws a generic `Error`. Should throw `ServiceUnavailableException` with a 503 status code since the service is not configured. |

---

## 6. Security Architecture

**Score: 72/100**

### Gasless Module

**Strengths:**
- Relay endpoint validates sender ownership against authenticated user (line 167)
- Fee parameter validation prevents paymaster drain (lines 446-489)
- callData validation ensures fee transfers go to the correct treasury (lines 491-558)
- Fee buffer bounds (min/max) prevent both underpayment and drain attacks
- Re-estimation at relay time prevents tier boundary exploitation (lines 560-621)
- Preflight simulation catches reverts before submission
- Deposit monitor with fail-closed behavior
- Private key loaded from Docker secrets with env var fallback (lines 20-39 of paymaster-signing.service.ts)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| F1 | HIGH | `gasless/gasless.service.ts` | 175-179 | **Auth bypass when no wallet address**: If `user.walletAddress` is falsy, the sender ownership check is SKIPPED entirely with only a warning log. This means any authenticated user without a wallet address can relay transactions for ANY sender address. This is a critical security gap. |
| F2 | MEDIUM | `gasless/gasless.service.ts` | 384-441 | `checkBalance()` makes an `eth_call` to an RPC URL from `ConfigService`. The `dto.token` address is used as the `to` field in the RPC call. While validated by `@IsEthereumAddress()` in the DTO, this is still a form of SSRF — the token address could point to a malicious contract that returns misleading data. The risk is mitigated by the fact that the result is only used for a balance check, not for any critical decision. |
| F3 | MEDIUM | `gasless/deposit-monitor.service.ts` | 41-49 | The `fetch` call to the RPC URL has no timeout. If the RPC hangs, the deposit check will block indefinitely. The relay will continue using the last known health state. |
| F4 | LOW | `gasless/gasless.config.ts` | 68 | `GAS_TREASURY` is read from env at import time. If an attacker can modify env vars (unlikely but possible in some deployment scenarios), they could redirect fee payments. |
| F5 | LOW | `gasless/paymaster-signing.service.ts` | 44 | Logs the paymaster signer address at startup. While the address is public, logging it in production could aid attackers in targeting the associated private key. |

### Changelly-Fiat Module

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| F6 | CRITICAL | `changelly-fiat/changelly-fiat.controller.ts` | 118-126 | **`POST /orders` is `@Public()`**: Any unauthenticated user can create fiat orders with arbitrary wallet addresses. This could be used for: (1) creating orders with victim's wallet addresses to trigger KYC/AML flags, (2) spamming Changelly's API with fake orders, (3) manipulating order volumes. The endpoint MUST require authentication. |
| F7 | HIGH | `changelly-fiat/changelly-fiat.controller.ts` | 159-167 | **`GET /status` is `@Public()`**: Any user can query any order status by `externalOrderId`. This leaks order details (amounts, currencies, wallet addresses, provider info) to unauthenticated users. |
| F8 | MEDIUM | `changelly-fiat/changelly-fiat.controller.ts` | 139-157 | Webhook endpoint has no IP allowlisting. Anyone who knows the webhook URL can send fake callbacks. The signature validation mitigates this, but adding IP allowlisting for Changelly's known IPs would be defense-in-depth. |
| F9 | MEDIUM | `changelly-fiat/changelly-fiat.controller.ts` | 161 | `externalOrderId` query parameter is not validated with `@IsString()` or any length/format constraint. While it goes through the global ValidationPipe, the raw string is passed directly to the service. |
| F10 | LOW | `changelly-fiat/changelly-fiat.service.ts` | 129 | `this.apiKey!` — non-null assertion. If `apiKey` is null (shouldn't happen due to `requireClient()`), this will send `null` as the API key header. |

---

## 7. Extensibility

**Score: 80/100**

### Gasless Module

**Adding a new token:**
1. Add token address constant to `gasless.config.ts`
2. Add to `TOKENS` array
3. Add to `FEE_BUFFER_MIN` and `FEE_BUFFER_MAX` maps
4. If it needs a price oracle, add a new Chainlink feed or price source to `ChainlinkOracleService`
5. **Difficulty: Easy** (4 files, ~10 lines each)

**Adding a new bundler:**
1. Add URL to `ALTO_URLS` array in `gasless.config.ts`
2. The fallback logic in `sendWithFallback()` automatically handles it
3. **Difficulty: Trivial** (1 line)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| G1 | MEDIUM | `gasless/chainlink-oracle.service.ts` | 50-58 | Token-to-oracle mapping is done via `if (symbol === 'USDT0') ... else if (symbol === 'WBTC' || symbol === 'TBTC')`. Adding a new token type (e.g., ETH-based) requires modifying this chain. Should use a map: `Record<string, () => Promise<bigint>>`. |
| G2 | LOW | `gasless/gasless.config.ts` | — | No JSDoc on `FEE_TIERS` explaining the tier system or how to add new tiers. |

### Changelly-Fiat Module

**Adding a new fiat provider:**
1. The module wraps the Changelly SDK — providers are returned by the SDK's `getProviderList()` method
2. No code changes needed for new Changelly providers
3. **Difficulty: Trivial** (SDK handles it)

**Issues:**

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| G3 | MEDIUM | `changelly-fiat/changelly-fiat.service.ts` | 108-140 | `getSellOffers()` manually constructs HTTP requests because the SDK lacks the method. If Changelly adds new sell endpoints or changes the signing logic, this code will break independently of SDK updates. |
| G4 | LOW | `changelly-fiat/changelly-fiat.controller.ts` | — | No Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) on any endpoint. Adding a new endpoint without documentation makes the API harder to discover. |

---

## Dimension Scores Summary

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| 1. Module Architecture | 82 | 15% | 12.3 |
| 2. Service Layer Design | 78 | 20% | 15.6 |
| 3. Configuration Management | 71 | 15% | 10.65 |
| 4. API Design | 85 | 10% | 8.5 |
| 5. Error Contract | 74 | 10% | 7.4 |
| 6. Security Architecture | 72 | 20% | 14.4 |
| 7. Extensibility | 80 | 10% | 8.0 |

### **Overall Score: 77/100**

---

## Architecture Violations (Prioritized)

### CRITICAL (fix before next deploy)

1. **F6: `POST /orders` is unauthenticated** — `changelly-fiat/changelly-fiat.controller.ts:118`
   - Remove `@Public()` from the `createOrder` endpoint
   - Add user ID from JWT to the order for audit trail
   - Validate that `externalUserId` matches the authenticated user

2. **F1: Auth bypass when no wallet address** — `gasless/gasless.service.ts:175-179`
   - When `user.walletAddress` is falsy, the relay should REJECT the request, not skip verification
   - Change the warn log to a `ForbiddenException`

### HIGH (fix within 2 sprints)

3. **B1: GaslessService is 739 lines** — Extract AltoClientService, CallDataValidatorService, BalanceCheckerService
4. **B7: `as any` casts in changelly controller** — Replace with proper type mapping
5. **D4: All changelly endpoints are public** — At minimum, protect `POST /orders` and `GET /status`
6. **F7: `GET /status` leaks order data** — Require authentication
7. **C1: Config read at import time** — Refactor gasless.config.ts to use ConfigService
8. **E5: Raw Error throws in changelly service** — Use NestJS exceptions

### MEDIUM (fix within 4 sprints)

9. **B2: Alto HTTP client not extracted** — Makes testing brittle (global.fetch mocking)
10. **B8: Manual HTTP in getSellOffers** — Fragile, should track SDK updates
11. **C2: GAS_TREASURY not required** — Should fail startup if missing
12. **D1: checkBalance is public** — Consider requiring auth
13. **E1: Error classification by string matching** — Use error codes
14. **F2: SSRF risk in checkBalance** — Validate token against ALLOWED_FEE_TOKENS before RPC call
15. **G1: Oracle mapping via if/else chain** — Use a registry map

### LOW (backlog)

16. **A1: UserOperation in wrong file** — Move to types/
17. **A2: Unnecessary exports** — Trim module exports
18. **B5: Constructor async work** — Use OnModuleInit
19. **B6: notifyOps is a stub** — Wire to alerting
20. **C3: Dead code** — Remove unreachable `if (!ARBITRUM_RPC_URL)`
21. **C5: Direct process.env reads** — Use ConfigService consistently
22. **D2: No response DTOs** — Add for Swagger
23. **D7: Unused WebhookDto** — Either use it or delete it
24. **F3: No timeout on deposit check fetch** — Add AbortSignal.timeout
25. **F5: Logging signer address** — Remove or downgrade to debug
26. **G2: No JSDoc on fee tiers** — Add documentation

---

## Design Improvement Recommendations

### 1. Extract AltoClientService (addresses B1, B2)

```
gasless/
├── alto-client.service.ts      # NEW: sendToAlto, sendWithFallback, toAltoUserOp
├── call-data-validator.service.ts  # NEW: validateCallData, validateFeeParameters
├── balance-checker.service.ts  # NEW: checkBalance (eth_call logic)
├── gasless.service.ts          # SLIM: orchestration only (~200 lines)
```

The `GaslessService` should become a thin orchestrator that delegates to:
- `AltoClientService` for all bundler communication
- `CallDataValidatorService` for callData and fee validation
- `BalanceCheckerService` for on-chain balance checks
- `DepositMonitorService` (existing)
- `PreflightSimulationService` (existing)
- `ChainlinkOracleService` (existing)
- `PaymasterSigningService` (existing)

### 2. Refactor gasless.config.ts to use ConfigService (addresses C1, C5, C6)

Create a `GaslessConfigService` that injects `ConfigService` and provides typed access to all gasless configuration:

```typescript
@Injectable()
export class GaslessConfigService {
  constructor(private readonly config: ConfigService) {}
  
  get gasTreasury(): string {
    return this.config.getOrThrow('GAS_TREASURY');
  }
  
  get altoUrls(): string[] {
    return [
      this.config.get('ALTO_URL_1', 'http://localhost:4001'),
      this.config.get('ALTO_URL_2', 'http://localhost:4002'),
    ];
  }
  
  // ... etc
}
```

Keep `gasless.config.ts` as a pure constants file (TOKENS, GAS_BOUNDS, FEE_TIERS, ABI definitions) — these don't come from env vars.

### 3. Fix changelly-fiat authentication (addresses F6, F7, D4)

```typescript
// Remove @Public() from createOrder and getOrderStatus
// Keep @Public() on read-only endpoints (providers, currencies, countries, offers, validate-address)
// Keep @Public() on webhook (validated by signature)

@Post('orders')
@HttpCode(HttpStatus.CREATED)
async createOrder(
  @Body() body: CreateOrderDto,
  @Req() req: { user: AuthenticatedUser },
) {
  // Validate externalUserId matches authenticated user
  return this.changellyFiatService.createOrder(body);
}

@Get('status')
async getOrderStatus(
  @Query('externalOrderId') externalOrderId: string,
  @Req() req: { user: AuthenticatedUser },
) {
  // Optionally validate the order belongs to this user
  return this.changellyFiatService.getOrderStatus(externalOrderId);
}
```

### 4. Fix auth bypass in gasless relay (addresses F1)

```typescript
// In gasless.service.ts relay(), lines 166-179:
if (user.walletAddress) {
  if (dto.sender.toLowerCase() !== user.walletAddress.toLowerCase()) {
    throw new ForbiddenException('Sender address does not match authenticated user');
  }
} else {
  // CHANGE: Reject instead of warn
  throw new ForbiddenException(
    'No wallet address on file for this user. Cannot verify sender ownership.'
  );
}
```

### 5. Extract UserOperation type (addresses A1)

Create `gasless/types/user-operation.ts`:
```typescript
export interface UserOperation {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
  factory?: string;
  factoryData?: string;
}
```

Update imports in: `gasless.service.ts`, `preflight-simulation.service.ts`, `paymaster-signing.service.ts`.

### 6. Add tests for changelly-fiat module (addresses A4)

Create at minimum:
- `changelly-fiat/__tests__/changelly-fiat.controller.spec.ts` — test all 9 endpoints
- `changelly-fiat/__tests__/changelly-fiat.service.spec.ts` — test all service methods with mocked SDK

### 7. Fix `as any` casts in changelly controller (addresses B7)

Create proper parameter mapping types:
```typescript
interface OfferParams {
  currencyFrom: string;
  currencyTo: string;
  amountFrom: string;
  country: string;
  state?: string;
  ip?: string;
  providerCode?: string;
  externalUserId?: string;
}
```

Use explicit field mapping instead of casting the entire object.

---

## Specific Fix Instructions

### Fix F6 (CRITICAL): Protect POST /orders

**File**: `changelly-fiat/changelly-fiat.controller.ts`
- **Line 118**: Remove `@Public()`
- **Line 121**: Add `@Req() req: { user: AuthenticatedUser }` parameter
- **Line 122**: Add validation that `body.externalUserId` matches or relates to `req.user.id`

### Fix F1 (CRITICAL): Reject relay when no wallet

**File**: `gasless/gasless.service.ts`
- **Lines 175-179**: Replace the `else` block:
  ```typescript
  // BEFORE:
  } else {
    this.logger.warn(`User ${user.id} has no wallet address on file — skipping sender verification`);
  }
  
  // AFTER:
  } else {
    this.logger.warn(`User ${user.id} has no wallet address on file — rejecting relay`);
    throw new ForbiddenException('No wallet address on file. Cannot verify sender ownership.');
  }
  ```

### Fix F7 (HIGH): Protect GET /status

**File**: `changelly-fiat/changelly-fiat.controller.ts`
- **Line 159**: Remove `@Public()`
- **Line 161**: Add `@Req() req: { user: AuthenticatedUser }` parameter

### Fix C2 (MEDIUM): Make GAS_TREASURY required

**File**: `gasless/gasless.config.ts`
- **Lines 68-72**: Replace:
  ```typescript
  // BEFORE:
  export const GAS_TREASURY = process.env['GAS_TREASURY'] ?? '';
  if (!GAS_TREASURY) {
    console.warn('[gasless] GAS_TREASURY environment variable is not set...');
  }
  
  // AFTER:
  export const GAS_TREASURY = process.env['GAS_TREASURY'];
  if (!GAS_TREASURY) {
    throw new Error('[gasless] GAS_TREASURY environment variable is required. Fee collection cannot operate without it.');
  }
  ```

### Fix E5 (HIGH): Use NestJS exceptions in changelly service

**File**: `changelly-fiat/changelly-fiat.service.ts`
- **Lines 134-136** (getSellOffers):
  ```typescript
  // BEFORE:
  throw new Error(`Changelly sell offers returned ${response.status}: ${errorText.slice(0, 500)}`);
  
  // AFTER:
  throw new ServiceUnavailableException(`Failed to fetch sell offers from Changelly (HTTP ${response.status})`);
  ```
- **Lines 195-197** (getOrderStatus): Same pattern.

### Fix C3 (LOW): Remove dead code

**File**: `gasless/gasless.config.ts`
- **Lines 80-82**: Delete the unreachable `if (!ARBITRUM_RPC_URL)` block.

### Fix D7 (LOW): Use WebhookDto or delete it

**File**: `changelly-fiat/changelly-fiat.controller.ts`
- **Line 141**: Either:
  - Use `@Body() body: WebhookDto` and remove the inline type, OR
  - Delete `WebhookDto` from `dto/changelly-fiat.dto.ts` if it's truly unused

---

## Test Coverage Assessment

| Module | Source Files | Test Files | Coverage Quality |
|--------|-------------|------------|-----------------|
| Gasless | 6 services + 1 controller + 1 config + 1 DTO | 7 test files | **Good** — covers happy paths, error paths, edge cases, validation |
| Changelly-Fiat | 1 service + 1 controller + 1 DTO | **0 test files** | **None** — no tests exist |

The gasless module has strong test coverage with proper mocking patterns. The changelly-fiat module has ZERO tests, which is a significant risk given it handles financial transactions.

---

## Files Inventory

### Gasless Module (10 files)
| File | Lines | Purpose |
|------|-------|---------|
| `gasless.module.ts` | 23 | Module definition |
| `gasless.controller.ts` | 64 | REST endpoints (relay, estimate, balance) |
| `gasless.service.ts` | 739 | Core relay logic, validation, Alto communication |
| `gasless.config.ts` | 124 | Constants, env vars, helper functions |
| `dto/gasless.dto.ts` | 151 | Request validation DTOs |
| `deposit-monitor.service.ts` | 92 | Paymaster deposit health monitoring |
| `preflight-simulation.service.ts` | 91 | EntryPoint simulation pre-check |
| `paymaster-signing.service.ts` | 84 | ECDSA signing for paymaster data |
| `chainlink-oracle.service.ts` | 89 | Chainlink price feed integration |
| `__tests__/` (7 files) | ~1236 | Test suites |

### Changelly-Fiat Module (4 files)
| File | Lines | Purpose |
|------|-------|---------|
| `changelly-fiat.module.ts` | 25 | Module definition |
| `changelly-fiat.controller.ts` | 168 | REST endpoints (9 endpoints) |
| `changelly-fiat.service.ts` | 202 | Changelly SDK wrapper |
| `dto/changelly-fiat.dto.ts` | 141 | Request validation DTOs |
