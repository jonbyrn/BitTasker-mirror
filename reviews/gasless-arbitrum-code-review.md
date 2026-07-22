## Code Review Report — Gasless ERC-4337 + EIP-7702 Implementation Plan

**Reviewer**: Senior Code Reviewer (Agent Zero)
**Date**: 2026-06-05
**Scope**: `requirements/gasless-arbitrum-plan.md` (835 lines) — all code snippets and implementation guidance
**Methodology**: Five-axis review (Correctness, Readability, Architecture, Security, Performance) against plan's own specifications, ethers.js APIs, NestJS conventions, and existing codebase patterns.

---

### Review Summary

**Verdict:** **REQUEST CHANGES**

**Overview:** The architecture is sound and the technology choices are appropriate, but the code snippets contain five runtime-fatal bugs that would cause 100% transaction failure or incorrect gas buffer calculation. The paymaster signing logic is fundamentally wrong (custom scheme vs. contract's actual hash), the signature placement overwrites the user's signature, and the `convertUSDToToken` function has a critical decimal mismatch for tBTC. The client-side flow also contradicts the stated architecture (direct bundler submission vs. routed through backend for paymaster signing).

| Category | Critical | Important | Suggestion |
|----------|----------|-----------|------------|
| Count | 5 | 10 | 8 |

### Critical Issues

---

#### [C-1] Paymaster signature overwrites UserOp signature — 100% transaction failure

- **Location**: Plan lines 253-254 (NestJS service)
- **Axis**: Correctness
- **Description**: `dto.userOp.signature = sponsorSig` overwrites the user's smart account signature. In ERC-4337, the `signature` field is exclusively for the smart account's validation. The paymaster's signature belongs in `paymasterAndData` (concatenated with paymaster address and gas parameters).
- **Impact**: Every UserOp fails at EntryPoint validation — the smart account receives the paymaster signature instead of the user's, `ecrecover` returns a non-owner address, and the EntryPoint returns `SIG_VALIDATION_FAILED`.
- **Fix**:
  ```typescript
  // WRONG (current plan):
  dto.userOp.signature = sponsorSig;

  // CORRECT:
  const paymasterSignature = await this.signPaymasterData(dto.userOp);
  dto.userOp.paymasterAndData = concat([
    this.paymasterAddress,
    encodeAbiParameters([{ type: 'bytes' }], [paymasterSignature]),
  ]);
  // User's signature remains untouched in dto.userOp.signature
  ```

---

#### [C-2] Custom paymaster signing scheme doesn't match Coinbase VerifyingPaymaster — sponsorship always fails

- **Location**: Plan lines 394-403 (paymaster signing)
- **Axis**: Correctness
- **Description**: The code signs `keccak256(abi.encode('GASLESS_SPONSOR', sender, nonce, keccak256(callData), chainId))`. The Coinbase VerifyingPaymaster computes its own hash internally in `validatePaymasterUserOp` using specific UserOp fields packed in a contract-defined format. These hashes will never match.
- **Additional issues**:
  - `abi.encode` is not a valid ethers function — ethers uses `encodeAbiParameters`
  - `this.signer.signMessage(hash)` — ethers.js `signMessage` expects a message string, not a raw hash; needs `signMessage(\nhashBytes)` or direct `signingKey.signDigest(hash)`
  - Return type `string` should be `Hex` (`0x${string}`)
- **Impact**: Paymaster contract returns `SIG_VALIDATION_FAILED` for every UserOp. Same 100% failure as C-1.
- **Fix**: Read the Coinbase VerifyingPaymaster source code (`validatePaymasterUserOp` function) and replicate the exact hash computation. The contract hashes specific UserOp fields with the entryPoint address and chainId. Write a test that signs locally and verifies against the contract via `eth_call`.
  ```typescript
  private async signPaymasterSponsorship(userOp: UserOperation): Promise<Hex> {
    // Must match the contract's exact hash computation from validatePaymasterUserOp
    const hash = getPaymasterSignatureHash(
      userOp,
      this.paymasterAddress,
      this.entryPointAddress,
      42161n
    );
    return this.signer.signMessage(hashToBytes(hash));
  }
  ```

---

#### [C-3] `convertUSDToToken` treats tBTC as 8-decimal — gas buffer is negligibly small

- **Location**: Plan lines 374-383 (convertUSDToToken)
- **Axis**: Correctness
- **Description**: The function handles both WBTC and TBTC identically:
  ```typescript
  if (token.symbol === 'WBTC' || token.symbol === 'TBTC') {
    return BigInt(Math.ceil((bufferedUSD / btcPrice) * 1e8));
  }
  ```
  But tBTC has **18 decimals**, not 8. For `$0.006 / $66000 = 0.0000000909 BTC`:
  - WBTC (8 dec): `0.0000000909 * 1e8 = 9.09 → ceil = 10` (10 satoshis) ✅
  - tBTC (18 dec): `0.0000000909 * 1e8 = 9.09 → ceil = 10` (10 * 10^-18 = 0.000000000000000010 tBTC) ❌

  The tBTC buffer should be `0.0000000909 * 1e18 = 90909090909` (~90.9 gwei-precision units).
- **Impact**: tBTC gas buffer is ~10^10 times too small. Treasury receives essentially zero tBTC per transaction. Paymaster is never reimbursed for tBTC sends.
- **Fix**:
  ```typescript
  function convertUSDToToken(usdAmount: number, token: TokenInfo, bufferPercent: number): bigint {
    const bufferedUSD = usdAmount * (1 + bufferPercent);

    if (token.symbol === 'WBTC') {
      return BigInt(Math.ceil((bufferedUSD / token.priceUSD) * 1e8));
    } else if (token.symbol === 'TBTC') {
      return BigInt(Math.ceil((bufferedUSD / token.priceUSD) * 1e18));
    } else {
      // Stablecoins: price ≈ $1, use token decimals
      return BigInt(Math.ceil(bufferedUSD * (10 ** token.decimals)));
    }
  }
  ```

---

#### [C-4] Client submits directly to bundler — bypasses paymaster signing entirely

- **Location**: Plan lines 325-331 (sendGasless)
- **Axis**: Correctness / Architecture
- **Description**: The `sendGasless` function calls `client.sendUserOperation(...)` which submits directly to the Alto bundler transport. But the architecture (section 2.2, steps 4-5) requires:
  1. Client builds and signs UserOp locally
  2. Client sends signed UserOp to NestJS backend
  3. Backend adds paymaster signature
  4. Backend forwards to Alto

  The current code skips steps 2-4 entirely. The UserOp arrives at Alto without paymaster sponsorship and is rejected.
- **Impact**: Every transaction fails because Alto receives an unsigned (for paymaster) UserOp.
- **Fix**: The `sendGasless` function should build and sign the UserOp locally, then POST it to the NestJS relay endpoint:
  ```typescript
  export async function sendGasless(
    token: string,
    recipient: string,
    amount: bigint,
    gasBuffer: bigint,
  ): Promise<string> {
    const client = get(bundlerClient);
    const account = get(smartAccount);
    if (!client || !account) throw new Error('Wallet not initialized');

    // 1. Build UserOp locally
    const userOp = await account.encodeUserOp([
      { to: token as `0x${string}`, data: encodeTransfer(recipient, amount) },
      { to: token as `0x${string}`, data: encodeTransfer(GAS_TREASURY, gasBuffer) },
    ]);

    // 2. Sign UserOp locally (private key never leaves device)
    const signedUserOp = await account.signUserOperation(userOp);

    // 3. Send to NestJS backend (NOT directly to bundler)
    const response = await fetch('/gasless/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ userOp: signedUserOp, sender: account.address }),
    });
    const { userOpHash } = await response.json();
    return userOpHash;
  }
  ```
  This also means `createSmartAccountClient` with `bundlerTransport` is unnecessary for the send flow — the bundler transport is only needed for gas estimation.

---

#### [C-5] `estimateUserOperationGas` API usage incorrect

- **Location**: Plan line 356 (gas estimation)
- **Axis**: Correctness
- **Description**: The code calls:
  ```typescript
  const estimate = await client.estimateUserOperationGas({ calls: dummyCalls });
  ```
  In ethers.js, `estimateUserOperationGas` does not accept a `calls` parameter. It requires a `userOp` object. The correct flow is:
  ```typescript
  // Build the UserOp first
  const dummyUserOp = await account.encodeUserOp(dummyCalls);
  // Then estimate
  const estimate = await client.estimateUserOperationGas({ userOp: dummyUserOp });
  ```
  Additionally, `getUserOperationGasPrice()` should be verified against the ethers.js API — the bundler RPC method is `pimlico_getUserOperationGasPrice` and the client wrapper method name may differ.
- **Impact**: Gas estimation fails at runtime with a type error or API error.

---

### Important Issues

---

#### [I-1] No gas parameter validation on backend relay — paymaster drain attack

- **Location**: Plan lines 247-257 (NestJS relay)
- **Axis**: Security
- **Description**: The backend only verifies `dto.sender === account.address`. A malicious client can submit UserOps with inflated `callGasLimit`, `verificationGasLimit`, `preVerificationGas`, and `maxFeePerGas` to drain the paymaster deposit.
- **Fix**: Add bounds validation:
  ```typescript
  const MAX_CALL_GAS = 500_000n;
  const MAX_VERIFICATION_GAS = 1_000_000n;
  const MAX_PRE_VERIFICATION_GAS = 100_000n;
  const currentGasPrice = await this.provider.getFeeData();
  const MAX_FEE = currentGasPrice.maxFeePerGas! * 150n / 100n;

  if (dto.userOp.callGasLimit > MAX_CALL_GAS) throw new BadRequestException();
  if (dto.userOp.verificationGasLimit > MAX_VERIFICATION_GAS) throw new BadRequestException();
  if (dto.userOp.preVerificationGas > MAX_PRE_VERIFICATION_GAS) throw new BadRequestException();
  if (dto.userOp.maxFeePerGas > MAX_FEE) throw new BadRequestException();
  ```

---

#### [I-2] No callData validation — arbitrary contract calls sponsored

- **Location**: Plan lines 247-257 (NestJS relay)
- **Axis**: Security
- **Description**: The backend doesn't validate `callData` content. A compromised client could submit UserOps that call any contract, perform approvals, or interact with DeFi protocols — all sponsored by the paymaster.
- **Fix**: Decode and validate callData:
  ```typescript
  const decoded = decodeFunctionData({ abi: SIMPLE_ACCOUNT_ABI, data: dto.userOp.callData });
  if (decoded.functionName !== 'executeBatch') throw new BadRequestException();
  for (const call of decoded.args) {
    if (!ALLOWED_TOKENS.includes(call.to.toLowerCase())) throw new BadRequestException();
    const inner = decodeFunctionData({ abi: ERC20_ABI, data: call.data });
    if (inner.functionName !== 'transfer') throw new BadRequestException();
  }
  ```

---

#### [I-3] `Number(gasCostEth) / 1e18` — precision loss in gas cost calculation

- **Location**: Plan line 368 (gas estimation)
- **Axis**: Correctness
- **Description**: `Number(gasCostEth)` converts a bigint to a 64-bit float. For Arbitrum's sub-cent gas (~0.005 ETH = 5e15 wei), this works. But for safety:
  ```typescript
  // Current (works for small values):
  const gasCostUSD = Number(gasCostEth) / 1e18 * ethPriceUSD;

  // Safer (pure BigInt until final conversion):
  const gasCostUSD = Number(gasCostEth * BigInt(Math.round(ethPriceUSD * 1e8)) / 1e8n) / 1e18;
  ```
  This is not a blocker for Arbitrum's gas costs but should be hardened.

---

#### [I-4] Missing NestJS dependency injection and validation

- **Location**: Plan lines 227-273 (controller + service)
- **Axis**: Correctness / Architecture
- **Description**: Several NestJS conventions are missing:
  - No constructor injection shown for `GaslessService` or `GaslessController`
  - No `@UsePipes(new ValidationPipe())` for DTO validation
  - No class-validator decorators on DTOs
  - `req.user` is untyped — should be `JwtPayload`
  - DTO mutation (`dto.userOp.signature = ...`) is a side effect
- **Fix**: Show full class structure with DI:
  ```typescript
  @Controller('gasless')
  export class GaslessController {
     constructor(private readonly gaslessService: GaslessService) {}

     @Post('relay')
     @UseGuards(JwtAuthGuard)
     @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
     async relay(@Body() dto: RelayUserOpDto, @Req() req: RequestWithUser): Promise<RelayResponse> {
       return this.gaslessService.relay(dto, req.user);
     }
  }
  ```

---

#### [I-5] Missing type annotations on Svelte stores

- **Location**: Plan lines 291-292 (gasless.ts)
- **Axis**: Type Safety
- **Description**: `writable(null)` has no type annotation:
  ```typescript
  export const smartAccount = writable<SmartAccount | null>(null);
  export const bundlerClient = writable<SmartAccountClient | null>(null);
  ```
  The existing wallet store at `src/lib/stores/wallet.store.ts` uses typed state objects. The new store should follow the same pattern.

---

#### [I-6] `encodeTransfer` function undefined

- **Location**: Plan lines 327-329 (sendGasless), lines 351-353 (estimation)
- **Axis**: Correctness
- **Description**: `encodeTransfer(recipient, amount)` is used but never defined. Should use ethers' `encodeFunctionData`:
  ```typescript
  import { ethers } from 'ethers';

  function encodeTransfer(to: string, value: bigint): Hex {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to as `0x${string}`, value],
    });
  }
  ```

---

#### [I-7] Missing constants and configuration

- **Location**: Plan lines 297, 308, 328
- **Axis**: Correctness
- **Description**: `RPC_URL`, `ALTO_BUNDLER_URL`, `GAS_TREASURY` are referenced but never defined. These should be in a config module:
  ```typescript
  const RPC_URL = env.PUBLIC_ARBITRUM_RPC_URL;
  const ALTO_BUNDLER_URL = env.PUBLIC_ALTO_BUNDLER_URL;
  const GAS_TREASURY = '0xYOUR_TREASURY_ADDRESS' as const;
  ```

---

#### [I-8] No error handling for Alto/RPC failures

- **Location**: Plan lines 247-263 (relay), lines 341-372 (estimation)
- **Axis**: Correctness
- **Description**: No try/catch or error handling for:
  - Alto bundler being down (timeout, connection refused)
  - RPC node failures
  - UserOp validation failures from Alto
  - `getEthPrice()` API failures
- **Fix**: Wrap all external calls in try/catch with meaningful error messages and retry logic.

---

#### [I-9] No pre-flight UserOp simulation

- **Location**: Plan (absent from all code snippets)
- **Axis**: Correctness / Security
- **Description**: If the UserOp's execution phase reverts (e.g., insufficient balance after estimation, token blacklisting), the EntryPoint still charges the paymaster for gas consumed. The plan has no simulation step.
- **Fix**: Add `eth_call` simulation before submitting to Alto:
  ```typescript
  const simResult = await this.provider.call({
    to: dto.userOp.sender,
    data: dto.userOp.callData,
  });
  if (simResult === '0x') throw new BadRequestException('UserOp would revert');
  ```

---

#### [I-10] `abi.encode` in paymaster signing is not a valid ethers function

- **Location**: Plan line 396
- **Axis**: Correctness
- **Description**: `abi.encode(...)` is Solidity syntax, not ethers. ethers uses:
  ```typescript
  import { ethers } from 'ethers';
  const encoded = encodeAbiParameters(
    [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }],
    ['GASLESS_SPONSOR', userOp.sender, userOp.nonce, keccak256(userOp.callData), 42161n]
  );
  ```
  But as noted in C-2, the entire signing scheme is wrong regardless.

---

### Suggestions

---

#### [S-1] Use Chainlink on-chain oracle instead of `getEthPrice()` API

- **Location**: Plan line 367
- **Description**: `getEthPrice()` is undefined and would require an external API (CoinGecko, etc.) with staleness/manipulation risk. Chainlink ETH/USD on Arbitrum (`0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`) costs ~2,100 gas ($0.00002) and is manipulation-resistant.

---

#### [S-2] Pin Alto Docker image to digest

- **Location**: Plan line 689
- **Description**: `ghcr.io/pimlicolabs/alto:latest` is mutable. Pin to `ghcr.io/pimlicolabs/alto@sha256:<digest>` for supply chain security.

---

#### [S-3] Network-isolate Alto from public internet

- **Location**: Plan lines 188-189
- **Description**: `ports: "3000:3000"` exposes Alto publicly. Use `expose` with internal Docker network:
  ```yaml
  expose:
    - "3000:3000"
  networks:
    - internal
  networks:
    internal:
      driver: bridge
      internal: true
  ```

---

#### [S-4] Add paymaster deposit monitoring with auto-pause

- **Location**: Plan (absent)
- **Description**: Implement a cron job that checks `entryPoint.balanceOf(paymasterAddress)` every 5 minutes. Alert when < 0.02 ETH, auto-pause relay when < 0.005 ETH.

---

#### [S-5] Define key management lifecycle

- **Location**: Plan lines 296-314, 558-565
- **Description**: The plan passes raw `privateKey: string` with zero documentation of generation, storage, backup, or recovery. For a Capacitor mobile app, keys should use platform secure storage (iOS Keychain / Android Keystore), never localStorage.

---

#### [S-6] Consider floating-point safety in `convertUSDToToken`

- **Location**: Plan lines 374-383
- **Description**: `Math.ceil` on floating-point arithmetic can produce incorrect results due to IEEE 754 precision. For example, `Math.ceil(0.1 + 0.2)` can return 1 in edge cases. Consider using integer arithmetic throughout:
  ```typescript
  // Convert USD to cents first, then to token
  const bufferedCents = Math.ceil(usdAmount * 100 * (1 + bufferPercent));
  const tokenAmount = BigInt(bufferedCents) * (10n ** BigInt(token.decimals)) / 100n;
  ```

---

#### [S-7] Add explicit type for `TokenInfo`

- **Location**: Plan lines 342, 374
- **Description**: `TokenInfo` is used but never defined:
  ```typescript
  interface TokenInfo {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
    priceUSD: number;
  }
  ```

---

#### [S-8] Svelte store should use `$state`/`$derived` if targeting Svelte 5

- **Location**: Plan lines 284-314
- **Description**: The plan mentions Svelte 5 but uses `writable`/`derived` from `svelte/store`. The existing codebase uses this pattern (consistent), but if the project is migrating to Svelte 5 runes, the store should use `$state` and `$derived` for better reactivity and no subscription overhead.

---

### What's Done Well

- **Architecture layer separation** (Section 2.1): Clean separation between wallet-core SDK (provider, balances) and app layer (AA logic, ethers.js). This is well-thought-out and prevents the SDK from becoming bloated.
- **Token registry pattern**: Adding new tokens requires zero UI code changes — auto-adapts from registry. Good extensibility.
- **Fixed buffer model**: Using fixed per-token buffers instead of real-time oracle pricing eliminates an entire class of oracle bugs for Arbitrum's sub-cent gas.
- **User signs locally**: The architecture correctly ensures the user's private key never leaves the device. UserOp signing happens client-side.
- **Existing pattern adherence**: The ArbitrumWallet follows BSCWallet/RSKWallet conventions (provider, balance reads, getWallet()). The wallet store uses the same Svelte store patterns as the existing 1448-line wallet.store.ts.
- **Testing strategy**: The 10 wBTC 8-decimal test cases (lines 750-763) are thorough and cover edge cases well.

---

### Verification Story

- **Tests reviewed**: Yes — the testing strategy (Section 10) is comprehensive with unit, integration, E2E, and wBTC precision tests. However, no actual test code is shown in the plan.
- **Build verified**: N/A (plan document, not executable code)
- **Security checked**: Yes — cross-referenced with the existing security audit (`reviews/gasless-arbitrum-security-audit.md`). The security audit identified the same C-1, C-2, and I-1 findings. This review adds C-3 (tBTC decimal mismatch), C-4 (client routing), and C-5 (API usage) as new findings.
- **Existing codebase checked**: Yes — read `src/lib/stores/wallet.store.ts` (1448 lines) to verify pattern consistency. The existing store uses `writable`/`derived` from `svelte/store`, ethers.js v6, and a typed state object pattern.

---

### Confidence Score

**Current plan as written: 28/100** — Five critical bugs would cause 100% transaction failure or incorrect gas buffer calculation if implemented verbatim.

**With Critical issues fixed: 65/100** — The architecture would function, but the Important issues (no gas validation, no callData validation, missing error handling) leave significant security gaps.

**With Critical + Important issues fixed: 85/100** — Production-ready with the Suggestions providing additional hardening.

---

### Priority Fix Order

1. **C-4**: Fix client-side flow to route through NestJS (architecture foundation)
2. **C-1**: Fix paymaster signature placement (`paymasterAndData`)
3. **C-2**: Implement correct VerifyingPaymaster hash computation from contract source
4. **C-3**: Fix `convertUSDToToken` tBTC decimal handling
5. **C-5**: Fix `estimateUserOperationGas` API usage
6. **I-1 + I-2**: Add gas parameter and callData validation on backend
7. **I-4**: Complete NestJS module with DI and validation
8. **I-8**: Add error handling throughout
9. **I-6 + I-7**: Define missing functions and constants
10. **Remaining Important + Suggestions**: Iterate through the rest
