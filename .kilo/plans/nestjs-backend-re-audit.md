# NestJS Backend Architecture & Code Quality — Post-Fix Re-Audit

**Auditor:** Kilo (mimo-v2.5-pro)
**Date:** 2026-07-07
**Scope:** `backend/bittasker-nestjs/src/` — gasless, changelly-fiat, changelly-swap, auth.service.ts, nostr.service.ts, main.ts

---

## Prior Fix Verification

| # | Fix | Status | Evidence |
|---|-----|--------|----------|
| 1 | gasless.service.ts split into 3 files | ✅ VERIFIED | gasless.service.ts (499 lines), gasless-validation.service.ts (132 lines), gasless-alto.service.ts (108 lines) |
| 2 | nostr.service.ts: 12 bare `error.message` accesses fixed | ✅ VERIFIED | All 12 occurrences now use `instanceof Error ? error.message : String(error)` pattern |
| 3 | `devices: any[]` replaced with `UserDevice[]` | ✅ VERIFIED | Lines 228, 232 use `UserDevice[]` (imported from `@prisma/client`) |
| 4 | `[key: string]: any` replaced with `[key: string]: unknown` | ✅ VERIFIED | Line 382 uses `unknown` |
| 5 | changelly-fiat.service.ts: `await` added to `response.json()` | ✅ VERIFIED | Lines 162, 251 both use `await response.json()` |
| 6 | AbortSignal.timeout added to Changelly fetch calls | ✅ VERIFIED | Lines 154, 243 use `AbortSignal.timeout(15_000)` |
| 7 | auth.service.ts error messages sanitized | ✅ VERIFIED | Catch blocks use generic messages ("Registration failed", "Passkey authentication failed", "Failed to retrieve encrypted data") — no internal details leaked to clients |

---

## Dimension Scores

### 1. Module Architecture — 90/100

**Strengths:**
- Clean NestJS module structure: `GaslessModule`, `ChangellyFiatModule`, `ChangellySwapModule`
- Gasless module has proper provider registration with 7 services, 1 controller
- Correct exports: `GaslessService`, `DepositMonitorService`, `ChainlinkOracleService` available for cross-module use
- No circular dependencies detected
- Auth provided by global `JwtAuthGuard` (APP_GUARD) — clean pattern

**Issues:**
- `auth.service.ts` is a God class (1059 lines) mixing registration, login, WebAuthn, Nostr challenge validation, account deletion, email sending, and cron jobs

### 2. Service Layer Design — 82/100

**Strengths:**
- Gasless split: 7 focused services with clear single responsibilities
- Validation isolated in `GaslessValidationService`
- Alto bundler communication in `GaslessAltoService`
- Oracle, paymaster signing, preflight simulation, deposit monitoring — each in own file

**Issues:**
- **CRITICAL:** `auth.service.ts` is **1059 lines** — 2.1× the 500-line project limit. Should be split into: `auth-registration.service.ts`, `auth-webauthn.service.ts`, `auth-deletion.service.ts`
- `nostr.service.ts` at 607 lines also exceeds the limit but has a single coherent domain (Nostr operations)

### 3. Configuration Management — 88/100

**Strengths:**
- Centralized constants in `gasless.config.ts` (124 lines) — single source of truth
- `TokenInfo` interface with readonly arrays
- Fee tiers, gas bounds, buffer limits — all typed
- ConfigService used consistently via NestJS DI
- Paymaster key: Docker secret file → env var fallback (lines 20-40 of paymaster-signing.service.ts)
- `as const` assertions on addresses and chain constants

**Issues:**
- **Dead code** at `gasless.config.ts:82-84`: `if (!ARBITRUM_RPC_URL)` can never be true because line 81 uses `??` with fallback `'http://localhost:8545'`

### 4. API Design — 88/100

**Strengths:**
- Versioned routes: `/api/v1/gasless/*`, `/api/v1/changelly/fiat/*`, `/api/v1/changelly/swap/*`
- Proper `@Public()` decorator on unauthenticated endpoints (balance check, fiat endpoints, swap currencies/estimate/limits/status)
- Authenticated endpoints: `POST /gasless/relay`, `POST /gasless/estimate`, `POST /changelly/fiat/orders`, `POST /changelly/swap/create`
- DTO validation with class-validator decorators (Ethereum address validation, hex patterns, max length)
- Swagger in non-production

**Issues:**
- `POST /gasless/balance` is `@Public()` — anyone can probe balance of arbitrary addresses. Consider adding rate limiting or API key requirement.
- `POST /changelly/swap/status` is `@Public()` — transaction status lookup should require auth

### 5. Error Contract — 78/100

**Strengths:**
- Consistent `instanceof Error` guards in most catch blocks (nostr.service.ts: all 12 fixed)
- Gasless service uses proper NestJS exceptions (`BadRequestException`, `ForbiddenException`, `ServiceUnavailableException`)
- Changelly-fiat maps all errors to `ServiceUnavailableException` — clean for clients
- Gasless relay surfaces Alto/bundler errors as 400 (client-fixable) vs 503 (server error)

**Issues:**
- **BUG — auth.service.ts:886**: `error.message` accessed without `instanceof Error` guard. If a non-Error is thrown (e.g., a string), this will throw `TypeError: Cannot read properties of undefined (reading 'message')` at runtime.
- **BUG — auth.service.ts:1046**: Same bare `error.message` access without guard.
- **BUG — auth.service.ts:962**: Same bare `emailError.message` access without guard.
- `validateChallengeEvent` at line 266: `throw new Error('wrong kind')` — throws a raw `Error` instead of `UnauthorizedException`. This results in an unhandled 500 instead of a proper 401. Additionally, the same check repeats at line 286-288.
- `changelly-swap.controller.ts:92-104`: Error classification via string matching (`message.startsWith('Changelly API')`) — fragile coupling to error message content.

### 6. Type Safety — 82/100

**Strengths:**
- All DTOs use class-validator with strict validators (`IsEthereumAddress`, `Matches(/^0x...$/)` patterns)
- `UserDevice[]` type used (fixed from `any[]`)
- `[key: string]: unknown` used (fixed from `any`)
- `gasless-alto.service.ts:50`: `toAltoUserOp` returns `Record<string, string>` — typed
- ethers.js API calls use proper type assertions on JSON-RPC responses

**Issues:**
- **1 remaining `any`** in production code: `nostr.service.ts:31` — `(globalThis as any).WebSocket = WS`. This is a necessary shim with eslint-disable comment. Acceptable.
- `auth.service.ts:579,583,731,761,808`: 5 instances of `as unknown as MasterKeyEncryptedDataDto` — Prisma's `Json` type requires forced casts. Inherent Prisma limitation but indicates the type boundary is weak.
- `changelly-fiat.service.ts:144`: `cleaned as unknown as Record<string, string>` — SDK typing gap
- `changelly-fiat.service.ts:232`: `params as unknown as ChangellyGetOffersParams` — forced cast to reuse SDK signing method for an unsupported endpoint
- `gasless.service.ts:486`: `buildDummyUserOp` returns `Record<string, string>` instead of a partial `UserOperation` type

### 7. Resource Management — 85/100

**Strengths:**
- `AbortSignal.timeout(10_000)` on gasless RPC fetches (gasless.service.ts:337, deposit-monitor.service.ts:59)
- `AbortSignal.timeout(10_000)` on Alto bundler fetches (gasless-alto.service.ts:37)
- `AbortSignal.timeout(15_000)` on Changelly fiat fetches (lines 154, 243)
- `OnModuleDestroy` implemented: `PreflightSimulationService`, `ChainlinkOracleService`, `DepositMonitorService`, `NostrService`
- Provider cleanup: `setInterval` cleared, subscriptions stopped, provider destroyed, cache cleared
- NDK connect timeout (10s) prevents bootstrap blocking
- Price cache with 60s TTL avoids redundant oracle calls

**Issues:**
- **BUG — changelly-swap.service.ts:56-64**: `callApi` fetch has **NO AbortSignal.timeout**. The fix was applied to changelly-fiat but **NOT** to changelly-swap. A hung Changelly API will block the request indefinitely. This is a production risk.
- `deposit-monitor.service.ts`: Uses raw `setInterval` instead of `@nestjs/schedule` `@Cron` decorator — inconsistent with `auth.service.ts` which uses `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)`

### 8. Code Organization — 84/100

**Strengths:**
- Feature-based folder structure: `src/gasless/`, `src/changelly-fiat/`, `src/changelly-swap/`
- DTOs in dedicated `dto/` subdirectories
- Tests co-located in `__tests__/` directories
- Config extracted to separate file (`gasless.config.ts`)
- Consistent naming: `*.service.ts`, `*.controller.ts`, `*.module.ts`, `*.dto.ts`

**Issues:**
- `auth.service.ts` needs decomposition (1059 lines)
- Inconsistent error handling patterns between modules (some use `instanceof Error`, some use string matching)
- `WebhookDto` in `changelly-fiat.dto.ts` (lines 133-141) is defined but unused — only `WebhookBodyDto` is used

### 9. NestJS Best Practices — 86/100

**Strengths:**
- Proper DI via constructor injection
- Global `JwtAuthGuard` via `APP_GUARD`
- Global `ValidationPipe` for DTO validation
- `@Cron()` decorator for scheduled tasks
- `OnModuleInit` / `OnModuleDestroy` lifecycle hooks
- Swagger documentation in non-production
- Versioned API routes
- Custom CORS middleware with origin whitelist

**Issues:**
- `registerUser` at line 347: Redundant null check — `if (!dto.challenge || ...)` is checked twice (lines 324 AND 347). The first check already throws, making the second unreachable.
- Custom CORS middleware (main.ts:27-43) reimplements CORS instead of using NestJS `app.enableCors({ origin: ... })`. The comment says "to avoid conflicts" but this is unnecessary complexity — proper `app.enableCors()` with a function origin resolver would be cleaner.
- `preflight-simulation.service.ts:74`: Error parsed via `as { data?: string; reason?: string; message?: string }` — works but should use a proper type guard

---

## Remaining Issues Summary

| # | File | Line | Severity | Issue |
|---|------|------|----------|-------|
| 1 | `auth.service.ts` | 886 | **HIGH** | Bare `error.message` — will TypeError on non-Error throws |
| 2 | `auth.service.ts` | 1046 | **HIGH** | Bare `error.message` — will TypeError on non-Error throws |
| 3 | `auth.service.ts` | 962 | **HIGH** | Bare `emailError.message` — will TypeError on non-Error throws |
| 4 | `changelly-swap.service.ts` | 56-64 | **HIGH** | Missing `AbortSignal.timeout` on fetch — hung API blocks indefinitely |
| 5 | `auth.service.ts` | — | **MEDIUM** | 1059 lines — 2.1× the 500-line project limit. Needs decomposition |
| 6 | `auth.service.ts` | 266 | **MEDIUM** | `throw new Error('wrong kind')` — raw Error, not NestJS exception. Results in unhandled 500 |
| 7 | `auth.service.ts` | 266, 286 | **LOW** | Duplicate kind check (redundant) |
| 8 | `gasless.config.ts` | 82-84 | **LOW** | Dead code — `if (!ARBITRUM_RPC_URL)` can never be true |
| 9 | `nostr.service.ts` | 31 | **LOW** | `(globalThis as any)` — documented, necessary for WebSocket shim |
| 10 | `auth.service.ts` | 579,583,731,761,808 | **LOW** | 5× `as unknown as` casts from Prisma Json types |
| 11 | `changelly-fiat.service.ts` | 144, 232 | **LOW** | `as unknown as` casts for SDK typing gaps |
| 12 | `changelly-swap.controller.ts` | 92-104 | **LOW** | Error classification via fragile string matching |
| 13 | `changelly-fiat.dto.ts` | 133-141 | **LOW** | Unused `WebhookDto` class (only `WebhookBodyDto` is used) |
| 14 | `deposit-monitor.service.ts` | 24 | **LOW** | Raw `setInterval` instead of `@nestjs/schedule` |

---

## Weighted Overall Score

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| 1. Module Architecture | 90 | 10% | 9.0 |
| 2. Service Layer Design | 82 | 15% | 12.3 |
| 3. Configuration Management | 88 | 10% | 8.8 |
| 4. API Design | 88 | 10% | 8.8 |
| 5. Error Contract | 78 | 15% | 11.7 |
| 6. Type Safety | 82 | 15% | 12.3 |
| 7. Resource Management | 85 | 10% | 8.5 |
| 8. Code Organization | 84 | 5% | 4.2 |
| 9. NestJS Best Practices | 86 | 10% | 8.6 |
| **OVERALL** | | | **84.2** |

---

## Production Readiness Verdict

**CONDITIONAL PASS** — Deploy after fixing the 4 HIGH-severity issues.

### Must-Fix Before Production
1. **auth.service.ts lines 886, 1046, 962**: Add `instanceof Error` guards to all 3 bare `error.message` accesses. These will cause `TypeError` at runtime if a non-Error is thrown, crashing the error handler itself.
2. **changelly-swap.service.ts line 56**: Add `signal: AbortSignal.timeout(15_000)` to the `callApi` fetch. Without this, a hung Changelly API will block the Node.js event loop thread indefinitely.

### Should-Fix (Next Sprint)
3. **auth.service.ts decomposition**: Split into focused services (registration, WebAuthn, deletion). At 1059 lines it's unmaintainable.
4. **auth.service.ts line 266**: Replace `throw new Error('wrong kind')` with `throw new UnauthorizedException('Invalid event kind')`.
5. **gasless.config.ts line 82-84**: Remove dead code.

### Post-Fix Score Estimate
After fixing the 4 HIGH issues: **88/100**
After also fixing MEDIUM issues: **91/100**

---

*Audit completed 2026-07-07T15:40:09-06:00*
