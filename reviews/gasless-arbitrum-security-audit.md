## Security Audit Report — Gasless ERC-4337 + EIP-7702 on Arbitrum One

**Auditor**: Security Auditor (Agent Zero)
**Date**: 2026-06-04
**Scope**: `requirements/gasless-arbitrum-plan.md` (835 lines)
**Methodology**: Adversarial review against OWASP Top 10, ERC-4337 security best practices, EIP-7702 specification, and production operational security standards.

---

### Summary

| Severity | Count |
|----------|-------|
| **Critical** | 4 |
| **High** | 6 |
| **Medium** | 8 |
| **Low** | 5 |
| **Info** | 3 |

**Overall Confidence Score: 32/100**

The plan as written would **NOT** produce a production-ready, secure implementation. Four critical issues would cause immediate 100% transaction failure or fund drain if implemented verbatim. The architecture is sound in concept, but the implementation details contain fundamental errors in signature handling, missing validation boundaries, and insufficient operational security.

---

### Findings

---

#### [CRITICAL-1] Paymaster signature overwrites UserOp signature — 100% transaction failure

- **Location**: Plan lines 253-254 (NestJS service pseudocode)
- **Description**: The code sets `dto.userOp.signature = sponsorSig` which **overwrites the user's smart account signature** with the paymaster sponsorship signature. In ERC-4337, the `signature` field is exclusively for the smart account's validation signature. The paymaster's signature belongs in the `paymasterAndData` field (concatenated with the paymaster address and gas parameters).
- **Impact**: Every single UserOp submitted through this relay will fail validation at the EntryPoint. The EntryPoint calls `validateUserOp` on the smart account with the overwritten signature, which will not verify against the user's signing key. 100% transaction failure rate. No funds at risk (nothing executes), but the system is completely non-functional.
- **Proof of concept**:
  1. User signs UserOp with their private key → `userOp.signature = 0xUSER_SIG`
  2. Backend overwrites: `userOp.signature = 0xPAYMASTER_SIG`
  3. EntryPoint calls `Simple7702Account.validateUserOp(userOp, ...)` with `0xPAYMASTER_SIG`
  4. Smart account recovers signer from `0xPAYMASTER_SIG` → address ≠ owner
  5. EntryPoint returns `SIG_VALIDATION_FAILED` → UserOp rejected
- **Recommendation**:
  ```typescript
  // WRONG (current plan):
  dto.userOp.signature = sponsorSig;
  
  // CORRECT — construct paymasterAndData per Coinbase VerifyingPaymaster spec:
  const paymasterAddress = this.paymasterContract.address;
  const paymasterSignature = await this.signPaymasterData(dto.userOp);
  dto.userOp.paymasterAndData = concat([
    paymasterAddress,
    encodeAbiParameters(
      [{ type: 'bytes' }],
      [paymasterSignature]
    ),
  ]);
  // User's signature remains untouched in dto.userOp.signature
  ```

---

#### [CRITICAL-2] Custom paymaster signing scheme does not match Coinbase VerifyingPaymaster — sponsorship always fails

- **Location**: Plan lines 394-403 (Paymaster signing logic)
- **Description**: The plan defines a custom signing scheme: `keccak256(abi.encode('GASLESS_SPONSOR', sender, nonce, keccak256(callData), chainId))`. However, the Coinbase VerifyingPaymaster computes its own hash internally in `validatePaymasterUserOp` using the UserOp fields packed in a specific format. The signer must sign **the hash that the contract computes**, not an arbitrary custom hash. These will never match.
- **Impact**: The paymaster contract will always return `SIG_VALIDATION_FAILED` for the paymaster portion, causing every UserOp to be rejected by the EntryPoint. Same as CRITICAL-1 — 100% failure rate.
- **Proof of concept**:
  1. Backend signs `keccak256(abi.encode('GASLESS_SPONSOR', ...))` → `sig_backend`
  2. Contract internally computes `hash = keccak256(abi.encode(userOp.sender, userOp.nonce, ..., entryPointAddress))` → `hash_contract`
  3. `ecrecover(sig_backend)` ≠ `verifyingSigner` because `hash_backend` ≠ `hash_contract`
  4. Contract returns `SIG_VALIDATION_FAILED`
- **Recommendation**:
  ```typescript
  // Use the contract's own hash computation:
  // Read the exact hash from Coinbase VerifyingPaymaster source code
  // (validatePaymasterUserOp function) and replicate it.
  // The contract hashes: (userOp.sender, userOp.nonce, keccak256(userOp.callData),
  //                       entryPoint, block.chainid)
  // Use the contract's exact packing — read from source, not invent your own.
  
  private async signPaymasterSponsorship(userOp: UserOperation): Promise<string> {
    const hash = getPaymasterSignature(userOp, this.paymasterAddress, this.entryPointAddress, 42161n);
    return this.signer.signMessage(hash);
  }
  ```
  **Action**: Read the Coinbase VerifyingPaymaster source (`validatePaymasterUserOp` function) and replicate the exact hash computation. Write a test that signs locally and verifies against the contract's `validatePaymasterUserOp` via `eth_call`.

---

#### [CRITICAL-3] No validation of UserOp gas parameters — paymaster drain attack

- **Location**: Plan lines 247-257 (NestJS relay endpoint)
- **Description**: The backend verifies `dto.sender === account.address` and signs paymaster sponsorship, but performs **no validation of gas parameters** (`callGasLimit`, `verificationGasLimit`, `preVerificationGas`, `maxFeePerGas`, `maxPriorityFeePerGas`). A malicious client (or compromised frontend) can submit UserOps with artificially inflated gas limits, causing the paymaster to pay orders of magnitude more ETH than necessary.
- **Impact**: An attacker controlling a valid user account can drain the entire paymaster deposit by submitting UserOps with `callGasLimit = 10,000,000` and `maxFeePerGas = 100 gwei`. With 0.1 ETH deposit and ~50,000 transactions worth of coverage, a single inflated UserOp could drain the full deposit.
- **Proof of concept**:
  1. Attacker registers account (or compromises existing user)
  2. Constructs UserOp: `{ callGasLimit: 10_000_000, maxFeePerGas: parseGwei('100'), ... }`
  3. Sends to `/gasless/relay`
  4. Backend signs paymaster data without validating gas params
  5. Alto submits to EntryPoint → paymaster charged `10,000,000 × 100 gwei = 1 ETH`
  6. Paymaster deposit drained in 1-2 transactions
- **Recommendation**:
  ```typescript
  async relay(dto: RelayUserOpDto, user: JwtPayload): Promise<{userOpHash: string}> {
    const account = await this.getSmartAccount(user.id);
    if (dto.sender !== account.address) throw new ForbiddenException();
    
    // MANDATORY: Validate gas parameters against sane bounds
    const MAX_CALL_GAS_LIMIT = 500_000n;
    const MAX_VERIFICATION_GAS_LIMIT = 1_000_000n;
    const MAX_PRE_VERIFICATION_GAS = 100_000n;
    const currentGasPrice = await this.provider.getGasData();
    const MAX_FEE_PER_GAS = currentGasPrice.maxFeePerGas * 150n / 100n;
    
    if (dto.userOp.callGasLimit > MAX_CALL_GAS_LIMIT) throw new BadRequestException('callGasLimit too high');
    if (dto.userOp.verificationGasLimit > MAX_VERIFICATION_GAS_LIMIT) throw new BadRequestException('verificationGasLimit too high');
    if (dto.userOp.preVerificationGas > MAX_PRE_VERIFICATION_GAS) throw new BadRequestException('preVerificationGas too high');
    if (dto.userOp.maxFeePerGas > MAX_FEE_PER_GAS) throw new BadRequestException('maxFeePerGas exceeds ceiling');
    
    // Validate callData matches expected pattern (2 transfers to known addresses)
    const decoded = decodeCallData(dto.userOp.callData);
    if (!isValidBatchedTransfer(decoded)) throw new BadRequestException('Invalid callData pattern');
    
    // Now sign paymaster data
    // ...
  }
  ```

---

#### [CRITICAL-4] User private key lifecycle undefined — potential fund loss or key exposure

- **Location**: Plan lines 296-314 (Svelte store), lines 558-565 (ArbitrumWallet constructor)
- **Description**: The plan passes a raw private key as a `string` parameter to `initArbitrumWallet(privateKey: string)` and `new ArbitrumWallet(privateKey: string, rpcUrl: string)`. There is **zero documentation** of:
  - Where the private key is generated (device? server?)
  - Where it is stored (Keychain? Secure Enclave? localStorage? Memory only?)
  - How it survives app restarts on mobile (Capacitor)
  - How it is backed up or recovered
  - Whether the key is the user's original EOA key or a derived key
  - How EIP-7702 authorization signing works with the key lifecycle
- **Impact**: If keys are stored in `localStorage` or plaintext on the device, a single XSS vulnerability or device compromise exposes all user funds. If keys are memory-only, users lose funds on app restart. This is the single most important security property of a wallet application and it is completely unspecified.
- **Recommendation**: Define a complete key management specification:
  1. **Generation**: BIP-39 mnemonic → BIP-44 derivation path for Arbitrum
  2. **Storage**: Capacitor Secure Storage (iOS Keychain / Android Keystore) — NEVER localStorage
  3. **Access**: Extract key only for signing operations, never keep in Svelte store as plaintext
  4. **Backup**: Encrypted mnemonic export with user passphrase
  5. **Recovery**: Mnemonic import restores full access including EIP-7702 delegation
  6. **EIP-7702 specifics**: Document that the user's existing EOA key IS the delegation key — same key controls both EOA and smart account

---

#### [HIGH-1] Alto Docker image uses `:latest` tag — supply chain attack vector

- **Location**: Plan line 689 (`ghcr.io/pimlicolabs/alto:latest`)
- **Description**: The docker-compose configuration pulls `ghcr.io/pimlicolabs/alto:latest`. The `:latest` tag is mutable — any push to the registry (including a compromised maintainer account or CI pipeline) replaces the image without notification.
- **Impact**: A compromised Alto image could exfiltrate the bundler private key, submit malicious transactions, or silently modify UserOp parameters before submission.
- **Recommendation**:
  ```yaml
  # Pin to digest, not tag
  services:
    alto:
      image: ghcr.io/pimlicolabs/alto@sha256:<exact-digest>
      # Update digest only after manual review of changelog + diff
  ```
  Also: enable Docker Content Trust, scan images with Trivy/Snyk before deployment, and maintain a private registry mirror.

---

#### [HIGH-2] Alto bundler exposed without authentication — unauthorized UserOp submission and DoS

- **Location**: Plan line 189 (`ports: "3000:3000"`)
- **Description**: The Alto bundler is exposed on port 3000 without any authentication layer mentioned. The plan shows the NestJS backend as a proxy to Alto, but the docker-compose binds port 3000 directly. If this port is reachable from the internet, anyone can submit UserOps directly to the bundler, bypassing the NestJS JWT auth and paymaster signing.
- **Impact**: An attacker can submit UserOps directly to Alto without authentication. While these won't have valid paymaster sponsorship (and will fail), they could: (a) fill the bundler's mempool with garbage, (b) enumerate active accounts, (c) cause Alto to waste RPC calls on validation, effectively DoS-ing the legitimate relay.
- **Recommendation**:
  ```yaml
  services:
    alto:
      # Do NOT expose port to host — only accessible via backend service
      expose:
        - "3000:3000"  # Internal Docker network only
      networks:
        - internal
    backend:
      networks:
        - internal
  networks:
    internal:
      driver: bridge
      internal: true  # No external access
  ```
  Add Alto API key authentication if supported, or use a reverse proxy with mTLS between backend and Alto.

---

#### [HIGH-3] No paymaster gas limit caps — defense-in-depth gap

- **Location**: Plan lines 146-174 (VerifyingPaymaster configuration)
- **Description**: The plan configures the VerifyingPaymaster with no explicit gas limit per UserOp. The Coinbase VerifyingPaymaster supports a `postOpGasLimit` configuration, but the plan doesn't specify setting any caps. Without caps, a single UserOp could consume the entire paymaster deposit.
- **Impact**: Combined with CRITICAL-3, the paymaster has no defense-in-depth against gas parameter manipulation. Even with backend-side validation, a bug in validation logic or a race condition could allow a drain transaction through.
- **Recommendation**: Configure the VerifyingPaymaster contract with maximum gas limits in the deployment script. Add an on-chain circuit breaker that limits per-UserOp paymaster expenditure to e.g., 500,000 gas (~$0.005 on Arbitrum). The contract owner (multisig) should be able to adjust this.

---

#### [HIGH-4] EIP-7702 delegation creates irreversible dependency on BitTasker infrastructure

- **Location**: Plan lines 90-115 (Architecture), line 807 (Risk #11)
- **Description**: EIP-7702 delegates smart account code to the user's EOA. The plan does not address:
  - What happens if BitTasker's backend goes offline permanently
  - How users revoke delegation (requires sending a transaction that requires ETH)
  - Whether users can interact with their EOA without the BitTasker infrastructure
  - What happens if the Simple7702Account implementation contract is upgraded or self-destructs
- **Impact**: If BitTasker goes down, users cannot send tokens because: (1) they have no ETH for gas, (2) their EOA has smart account code that requires EntryPoint execution, (3) they cannot revoke delegation without ETH. This creates **effective custodianship** — users' funds are accessible only through BitTasker's infrastructure, contradicting the "non-custodial" claim.
- **Recommendation**:
  1. Document an **emergency escape hatch**: Users can sign a raw transaction (not UserOp) to revoke EIP-7702 delegation. Provide a tool/script that works independently of BitTasker.
  2. Implement a **delegation revocation endpoint** that doesn't require gas (possibly using a separate free-tier relay or by providing signed revocation data that users can submit via any RPC).
  3. Add to the user documentation: "Your funds are always accessible via your private key. If BitTasker is down, use [emergency tool] to revoke smart account delegation and access your EOA directly."
  4. Consider using a **minimal proxy pattern** for the implementation contract so the user's delegation doesn't depend on a single implementation address remaining valid forever.

---

#### [HIGH-5] Single bundler instance — availability single point of failure

- **Location**: Plan lines 180-209 (Alto Bundler), line 797 (Risk #1)
- **Description**: The architecture has a single Alto bundler instance. The plan acknowledges "Alto bundler down" as HIGH risk but mitigates only with "health check + retry + restart." There is no redundancy, failover, or alternative bundler path.
- **Impact**: If the single Alto instance crashes, the Docker daemon fails, or the VPS goes down, ALL gasless transactions halt. Users see errors and cannot send tokens.
- **Recommendation**:
  1. Run Alto as a **replicated service** (Docker Swarm or Kubernetes) with at least 2 replicas
  2. Use a load balancer in front of Alto instances
  3. Register a fallback with a commercial bundler (Pimlico, Alchemy) as emergency backup
  4. Implement health check monitoring with PagerDuty/OpsGenie alerting (not just Sentry)

---

#### [HIGH-6] Paymaster signer rotation described as "quarterly" with no mechanism defined

- **Location**: Plan lines 810-811 (Risk #14, #15)
- **Description**: Both the bundler private key and paymaster signer key mention "rotated quarterly" as a mitigation for key compromise. However, the plan contains zero detail on:
  - How rotation is performed (manual? automated?)
  - How the new signer is set on the VerifyingPaymaster contract (owner call? multisig?)
  - Whether rotation requires downtime
  - How the old key is invalidated
  - Key ceremony procedures
- **Impact**: Without a rotation mechanism, "quarterly rotation" is aspirational, not a security control. A compromised key remains valid indefinitely until rotation is actually implemented.
- **Recommendation**: Define the complete key rotation runbook:
  1. Generate new signer key in HSM or secure enclave
  2. Call `VerifyingPaymaster.setSigner(newSigner)` via multisig
  3. Update NestJS environment variable
  4. Rolling restart of backend (zero downtime with blue-green deployment)
  5. Verify new signer works with test UserOp
  6. Securely destroy old key material
  7. Document in ops runbook with exact commands

---

#### [MEDIUM-1] No backend validation of callData structure — arbitrary contract calls possible

- **Location**: Plan lines 247-257 (NestJS relay)
- **Description**: The backend only verifies `dto.sender === account.address`. It does not validate the `callData` content. A compromised client could submit a UserOp that calls any contract with any calldata — not just the expected token transfers.
- **Impact**: The paymaster sponsors arbitrary contract interactions. An attacker could: call a malicious contract, perform approvals to drain tokens later, interact with DeFi protocols, or trigger reentrancy in vulnerable contracts.
- **Recommendation**: Decode and validate callData on the backend:
  ```typescript
  // Expected: executeBatch with exactly 2 calls to known token addresses
  const decoded = decodeFunctionData({ abi: SIMPLE_ACCOUNT_ABI, data: dto.userOp.callData });
  if (decoded.functionName !== 'executeBatch') throw new BadRequestException();
  if (decoded.args.length !== 2) throw new BadRequestException();
  for (const call of decoded.args) {
    if (!ALLOWED_TOKENS.includes(call.to.toLowerCase())) throw new BadRequestException('Unknown token');
    const tokenDecoded = decodeFunctionData({ abi: ERC20_ABI, data: call.data });
    if (tokenDecoded.functionName !== 'transfer') throw new BadRequestException('Only transfer allowed');
  }
  ```

---

#### [MEDIUM-2] Client-side gas buffer can be set to zero — paymaster subsidizes free transactions

- **Location**: Plan lines 316-331 (sendGasless), lines 336-383 (estimateGasFee)
- **Description**: The `sendGasless` function accepts `gasBuffer: bigint` as a parameter from the client. The backend relay does not validate that the gas buffer is sufficient. A modified client could send `gasBuffer = 0`, causing the paymaster to sponsor gas without reimbursement.
- **Impact**: Free gasless transactions for attackers — the paymaster subsidizes their gas costs indefinitely. At ~$0.003/tx, this is low financial impact per transaction but scales with automation.
- **Recommendation**: Backend must independently estimate and validate the gas buffer:
  ```typescript
  // In relay endpoint, after decoding callData:
  const [mainTransfer, gasTransfer] = decoded.args;
  const actualGasBuffer = gasTransfer.value;
  const minimumBuffer = await this.calculateMinimumBuffer(dto.userOp);
  if (actualGasBuffer < minimumBuffer) throw new BadRequestException('Gas buffer too low');
  ```

---

#### [MEDIUM-3] No UserOp failure handling — paymaster absorbs failed transaction gas costs

- **Location**: Plan lines 90-115 (Architecture flow)
- **Description**: If the UserOp's execution phase reverts (e.g., insufficient balance after gas estimation, token blacklisting, contract pause), the EntryPoint still charges the paymaster for gas consumed during the failed attempt. The plan has no strategy for this scenario.
- **Impact**: The paymaster pays ETH for failed transactions. The gas buffer is NOT collected (because the batched calls reverted). The treasury loses money on every failed UserOp. An attacker could deliberately cause failures to drain the paymaster deposit.
- **Recommendation**:
  1. Implement pre-flight simulation via `eth_call` before submitting to Alto
  2. Reject UserOps that would revert in simulation
  3. Add a "failed UserOp" counter per user — ban users with excessive failures
  4. Set `maxFeePerGas` ceiling to limit per-transaction exposure even on failure

---

#### [MEDIUM-4] Environment variables for all secrets — no HSM or secrets management

- **Location**: Plan lines 193-196 (Docker env vars)
- **Description**: All secrets (bundler key, paymaster signer key, utility key, RPC URL) are passed as environment variables. Docker env vars are visible via `docker inspect`, `/proc/<pid>/environ`, and container logs.
- **Impact**: Any process with access to the Docker host can read all private keys. A single host compromise yields all cryptographic material.
- **Recommendation**: Use Docker secrets, HashiCorp Vault, or AWS Secrets Manager. At minimum, use a `.env` file with restricted permissions (mode 600) mounted as a volume, not passed as environment variables.

---

#### [MEDIUM-5] `ALTO_UTILITY_PRIVATE_KEY` purpose undocumented — unknown attack surface

- **Location**: Plan line 196
- **Description**: The docker-compose includes `ALTO_UTILITY_PRIVATE_KEY=${UTILITY_PRIVATE_KEY}` with no explanation of what this key does or what permissions it has.
- **Impact**: Unknown. If this key has ETH balance or contract ownership, its compromise could be catastrophic.
- **Recommendation**: Document the purpose of `UTILITY_PRIVATE_KEY` in the plan. If it's for Alto's internal operations (nonce management, replacement transactions), document its permissions and rotation procedure.

---

#### [MEDIUM-6] No monitoring implementation for paymaster deposit depletion

- **Location**: Plan line 798 (Risk #2 mitigation)
- **Description**: The plan mentions "alert when < 0.01 ETH" but specifies no implementation. Without automated monitoring, the deposit could silently deplete to zero, causing all transactions to fail.
- **Impact**: Complete gasless service outage with no warning. Users see cryptic bundler errors.
- **Recommendation**: Implement automated monitoring:
  ```typescript
  // Cron job every 5 minutes
  async checkPaymasterDeposit() {
    const deposit = await this.entryPoint.balanceOf(this.paymasterAddress);
    if (deposit < parseEther('0.02')) {
      await this.alertOps('Paymaster deposit critically low', deposit);
    }
    if (deposit < parseEther('0.005')) {
      await this.alertOps('Paymaster deposit exhausted — all txs failing', deposit);
      // Auto-pause relay endpoint
    }
  }
  ```

---

#### [MEDIUM-7] USDT0 non-standard `transfer()` return value not addressed

- **Location**: Plan line 126 (Token inventory)
- **Description**: USDT (and likely USDT0) does not return a boolean from `transfer()` and `approve()`, violating the ERC-20 standard. While ethers handles this correctly via low-level calldata, the plan does not explicitly address this. If any component (Alto, EntryPoint, Simple7702Account) expects a boolean return value and reverts on its absence, USDT0 transfers will fail.
- **Impact**: USDT0 (the primary stablecoin) transfers may fail silently or revert depending on how the Simple7702Account's `execute` function handles non-standard return values.
- **Recommendation**: Verify that `Simple7702Account.execute()` and `executeBatch()` use low-level calls (not `abi.decode` with `bool` return). Write explicit integration tests for USDT0 on Arbitrum testnet/fork.

---

#### [MEDIUM-8] ETH price oracle for gas estimation undefined — stale/manipulated price risk

- **Location**: Plan line 367 (`getEthPrice()` — "simple API call")
- **Description**: The gas estimation function calls `getEthPrice()` to convert ETH gas cost to token amount, but this function is undefined. If it uses a single API (CoinGecko, CoinMarketCap), it could return stale or manipulated data.
- **Impact**: Stale ETH price → incorrect gas buffer → either user overpays or paymaster under-recovers. During extreme market moves, the 20% buffer may not cover the discrepancy.
- **Recommendation**: Use Chainlink ETH/USD on-chain oracle (already available on Arbitrum at `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`). This is on-chain, manipulation-resistant, and costs ~2,100 gas to read ($0.00002). No external API dependency.

---

#### [LOW-1] wBTC 8-decimal buffer of 8 satoshis may become insufficient

- **Location**: Plan lines 436-437
- **Description**: The fixed buffer for wBTC is 8 satoshis (~$0.005). If BTC price rises significantly or gas costs increase, this buffer may become insufficient. The fixed buffer approach has no dynamic adjustment mechanism.
- **Recommendation**: Implement a periodic review of buffer adequacy (monthly) and a mechanism to update buffers without redeploying contracts. Consider a backend-configurable buffer that can be adjusted without client updates.

---

#### [LOW-2] No delegation revocation documentation for users

- **Location**: Entire plan (absent)
- **Description**: Users are not informed that their EOA will have smart account code delegated to it, or that revoking this delegation requires ETH and a specific transaction.
- **Recommendation**: Add a user-facing FAQ entry and in-app disclosure explaining EIP-7702 delegation and how to revoke it.

---

#### [LOW-3] tBTC liquidity risk dismissed too quickly

- **Location**: Plan line 801 (Risk #5)
- **Description**: The plan dismisses tBTC low liquidity because "no liquidity needed for transfers." This is true for direct transfers, but the gas buffer treasury will accumulate tBTC that needs to be swapped to ETH for paymaster replenishment. If tBTC has no liquidity on Arbitrum DEXes, this accumulated tBTC becomes stranded.
- **Recommendation**: Verify that Uniswap V3 or Camelot has sufficient tBTC/ETH or tBTC/USDT liquidity for the expected swap volume (~$50/month at 10K txs). If not, consider holding tBTC buffers as-is and funding paymaster separately.

---

#### [LOW-4] No image integrity verification for Docker images

- **Location**: Plan line 689
- **Description**: No checksum verification, no Cosign/Notary signing, no Trivy scan mentioned before deployment.
- **Recommendation**: Add image scanning to CI/CD, pin digest, and verify GPG signatures if available.

---

#### [LOW-5] No documented paymaster deposit replenishment strategy

- **Location**: Plan line 602 ("Fund paymaster deposit: 0.1 ETH")
- **Description**: The plan funds 0.1 ETH once and mentions "auto-replenish from treasury" but no implementation details. If the treasury wallet is empty or the replenishment fails, the paymaster depletes.
- **Recommendation**: Document the replenishment runbook: who triggers it, from which wallet, at what threshold, and with what approval process.

---

#### [INFO-1] Positive: Coinbase VerifyingPaymaster is a strong base contract

The choice of an audited, MIT-licensed, production-tested paymaster contract is excellent. It eliminates an entire class of custom contract vulnerabilities.

#### [INFO-2] Positive: Fixed buffer avoids oracle complexity

The decision to use fixed per-token buffers instead of real-time oracle pricing is a good trade-off for Arbitrum's sub-cent gas environment. This eliminates oracle manipulation, staleness, and decimal precision bugs.

#### [INFO-3] Positive: User signs locally

The architecture correctly ensures the user's private key never leaves the device. UserOp signing happens in the client, and only the signed UserOp is sent to the backend.

---

### Trust Model Analysis

| Component | Trusts | Attack Surface |
|-----------|--------|----------------|
| **User's device** | Private key storage, app code integrity | XSS, device compromise, malware |
| **Svelte frontend** | ethers.js, RPC endpoint | Supply chain (npm), MITM on RPC |
| **NestJS backend** | JWT auth, Alto endpoint, paymaster signer key | Auth bypass, SSRF, key exfiltration |
| **Alto bundler** | EntryPoint contract, RPC node | Malicious UserOps, RPC manipulation |
| **VerifyingPaymaster** | Backend signer, EntryPoint | Signature forgery, EntryPoint bugs |
| **EntryPoint v0.8** | Smart account implementations | Implementation bugs (NOT BitTasker's risk) |
| **Docker host** | All keys (env vars), all services | Host compromise = full system compromise |

**Critical trust chain**: User → Frontend → Backend → Alto → EntryPoint → Paymaster
**Weakest link**: Backend (holds paymaster signing key AND controls what gets sponsored)

---

### Recommendations Summary

**Must fix before implementation (CRITICAL):**
1. Fix paymaster signature placement (`paymasterAndData`, not `signature`)
2. Implement correct VerifyingPaymaster hash computation from contract source
3. Add gas parameter validation and callData validation on backend
4. Define complete user key management lifecycle

**Should fix before production (HIGH):**
1. Pin Alto Docker image to digest
2. Network-isolate Alto from public internet
3. Implement paymaster gas limits (on-chain and backend)
4. Document EIP-7702 delegation revocation emergency procedure
5. Deploy redundant bundler instances
6. Create and test key rotation runbook

**Fix before shipping (MEDIUM):**
1. Validate callData structure on backend
2. Backend-verify gas buffer sufficiency
3. Implement pre-flight UserOp simulation
4. Migrate secrets from env vars to proper secrets management
5. Document ALTO_UTILITY_PRIVATE_KEY
6. Implement paymaster deposit monitoring with auto-pause
7. Verify USDT0 non-standard ABI handling
8. Use Chainlink on-chain oracle for ETH price

**Overall Assessment:** The architecture is well-conceived and the technology choices (ethers.js, Alto, Coinbase VerifyingPaymaster, EIP-7702) are sound. However, the implementation plan contains fundamental errors in signature handling that would prevent any transactions from succeeding, lacks critical input validation boundaries that expose the paymaster to drain attacks, and omits key management specifications essential for a non-custodial wallet. With the Critical and High findings addressed, this would be a strong 75-85% confidence implementation.
