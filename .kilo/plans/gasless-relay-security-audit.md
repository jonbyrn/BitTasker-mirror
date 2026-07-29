# Gasless Relay Security Audit — Complete Issue List

**Files Audited:** 11 files, ~1,200 lines  
**Date:** 2026-06-17  
**Verdict:** NOT PRODUCTION-READY — 5 CRITICAL, 7 HIGH, 7 MEDIUM, 6 LOW

---

## Per-Dimension Scores

| Dimension | Weight | Score | Rationale |
|-----------|--------|-------|-----------|
| **Security** | 30% | 35/100 | Sender ownership bypass, incomplete paymaster hash, no rate limiting, no input validation, wildcard CORS, JWT body fallback |
| **Correctness** | 25% | 28/100 | paymasterAndData never reaches bundler, wrong address prefix, wrong encoding, non-blocking simulation, duplicate fee transfers |
| **Error Handling** | 20% | 58/100 | Controller-level try/catch is solid, deposit monitor fails closed, but double-throw in catch, generic parseRevertReason, no error context propagation |
| **CF Worker Compatibility** | 15% | 78/100 | No Node.js APIs, Web Crypto correct, AbortSignal on Alto calls, but ethers provider has no timeout, module state on isolate recycle, bundle size risk |
| **Production Readiness** | 10% | 45/100 | Unstructured logging, empty env var defaults cause runtime failures, no rate limiting, no startup validation, testnet config incompatible with mainnet token addresses |

**Weighted Overall: 35×0.30 + 28×0.25 + 58×0.20 + 78×0.15 + 45×0.10 = 10.5 + 7.0 + 11.6 + 11.7 + 4.5 = 45.3/100**

---

## CRITICAL Issues (5)

### C-1: `paymasterAndData` never sent to Alto bundler

**File:** `src/services/gasless.js`, lines 44–64  
**Dimension:** Correctness  
**Description:** `toAltoUserOp()` constructs the Alto-format UserOp but omits the `paymasterAndData` field entirely. After the paymaster signature is computed and assigned on line 176, `sendWithFallback()` calls `toAltoUserOp()` which strips it. The bundler receives a UserOp without paymaster data. The EntryPoint will either reject it or treat it as self-paying (sender must fund gas), completely defeating the "gasless" purpose.

**Fix:**
```js
// src/services/gasless.js, line 44-64
function toAltoUserOp(userOp) {
    const toHex = (v) => (typeof v === 'string' && v.startsWith('0x') ? v : '0x' + BigInt(v).toString(16));
    const altoOp = {
        sender: userOp.sender,
        nonce: toHex(userOp.nonce),
        callData: userOp.callData,
        callGasLimit: toHex(userOp.callGasLimit),
        verificationGasLimit: toHex(userOp.verificationGasLimit),
        preVerificationGas: toHex(userOp.preVerificationGas),
        maxFeePerGas: toHex(userOp.maxFeePerGas),
        maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
        paymasterAndData: userOp.paymasterAndData || '0x',  // ← ADD THIS
        signature: userOp.signature || '0x',
    };
    if (userOp.factory) {
        altoOp.factory = userOp.factory;
    }
    if (userOp.factoryData) {
        altoOp.factoryData = userOp.factoryData;
    }
    return altoOp;
}
```

---

### C-2: `paymasterAndData` uses ENTRY_POINT_ADDRESS instead of PAYMASTER_ADDRESS

**File:** `src/services/gasless.js`, line 177  
**Dimension:** Correctness  
**Description:** The first 20 bytes of `paymasterAndData` must be the paymaster contract address. The code uses `ENTRY_POINT_ADDRESS` (the ERC-4337 EntryPoint at `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`). The EntryPoint will interpret this as "paymaster = EntryPoint itself" which will fail — the EntryPoint has no `validatePaymasterUserOp` function.

**Fix:**
```js
// src/services/gasless.js, line 176-179
const paymasterAddress = env.PAYMASTER_ADDRESS;
if (!paymasterAddress) {
    throw { status: 500, message: 'PAYMASTER_ADDRESS not configured' };
}
userOpForSign.paymasterAndData = ethers.concat([
    paymasterAddress,
    // ... (see C-3 for encoding fix)
]);
```

---

### C-3: Paymaster signature ABI-encoded instead of raw bytes

**File:** `src/services/gasless.js`, lines 176–179  
**Dimension:** Correctness  
**Description:** The signature is wrapped in `ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [paymasterSignature])` which adds 64 bytes of ABI overhead (32-byte offset + 32-byte length). Standard paymasters expect raw 65-byte ECDSA signature appended directly. The encoded result is 129 bytes instead of the expected 65 bytes, causing on-chain signature verification to fail.

Additionally, Coinbase VerifyingPaymaster (referenced in the hash comment) expects `validUntil` (uint48) and `validAfter` (uint48) before the signature, for a total paymasterAndData of 97 bytes (20 + 6 + 6 + 65).

**Fix:**
```js
// src/services/gasless.js, replace lines 174-179
const userOpForSign = { ...userOp };
const paymasterSignature = await signPaymasterData(userOpForSign, env);

const paymasterAddress = env.PAYMASTER_ADDRESS;
if (!paymasterAddress) {
    throw { status: 500, message: 'PAYMASTER_ADDRESS not configured' };
}

// Coinbase VerifyingPaymaster format: address(20) + validUntil(6) + validAfter(6) + sig(65)
const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
const validAfter = 0n;
const validityData = ethers.solidityPacked(
    ['uint48', 'uint48'],
    [validUntil, validAfter]
);
userOpForSign.paymasterAndData = ethers.concat([
    paymasterAddress,
    validityData,
    paymasterSignature  // raw 65 bytes, NOT ABI-encoded
]);
```

---

### C-4: Sender ownership check bypassed when JWT lacks `walletAddress`

**File:** `src/services/gasless.js`, lines 144–149  
**Dimension:** Security  
**Description:** The sender ownership check is `if (walletAddress) { ... }`. If the JWT payload doesn't include a `walletAddress` claim (or it's `undefined`/`null`/empty), the check is skipped entirely. An attacker with any valid JWT (even one without `walletAddress`) can relay UserOps for arbitrary sender addresses, including other users' smart accounts.

**Fix:**
```js
// src/services/gasless.js, lines 143-149
// 1. Sender ownership check
if (!walletAddress) {
    console.error(`[gasless] JWT missing walletAddress claim for user ${userId}`);
    throw { status: 403, message: 'Authentication token missing wallet claim — cannot verify sender' };
}
if (sender.toLowerCase() !== walletAddress.toLowerCase()) {
    console.warn(`[gasless] Sender mismatch: user ${userId} wallet=${walletAddress} tried relay for sender=${sender}`);
    throw { status: 403, message: 'Sender address does not match authenticated user' };
}
```

---

### C-5: Paymaster hash omits gas parameters — signatures are malleable

**File:** `src/gasless/paymasterSigner.js`, lines 44–57  
**Dimension:** Security  
**Description:** `computePaymasterHash` only signs `(sender, nonce, keccak256(callData), entryPoint, chainId)`. It does NOT include `callGasLimit`, `verificationGasLimit`, `preVerificationGas`, `maxFeePerGas`, or `maxPriorityFeePerGas`. This means:

1. If the on-chain paymaster contract verifies against a different hash (e.g., the EntryPoint's `getUserOpHash` which includes all fields), signatures will NEVER match — the relay is completely broken.
2. Even if the contract uses this exact hash, an attacker can modify gas limits AFTER the signature is produced. They could set `callGasLimit` to 5M gas and `maxFeePerGas` to the maximum, causing the paymaster to pay enormous gas fees for a simple operation.

**Fix:** The hash MUST match the on-chain contract exactly. If using Coinbase VerifyingPaymaster, sign the EntryPoint's UserOp hash:
```js
// src/gasless/paymasterSigner.js, replace lines 44-57
export function computePaymasterHash(userOp, entryPointAddress, chainId) {
    // Pack gas limits and fees as they appear in the UserOp struct
    const accountGasLimits = ethers.solidityPacked(
        ['uint128', 'uint128'],
        [BigInt(userOp.verificationGasLimit), BigInt(userOp.callGasLimit)]
    );
    const gasFees = ethers.solidityPacked(
        ['uint128', 'uint128'],
        [BigInt(userOp.maxPriorityFeePerGas), BigInt(userOp.maxFeePerGas)]
    );

    // Compute UserOp hash matching EntryPoint's internal hash
    const userOpHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes'],
            [
                userOp.sender,
                BigInt(userOp.nonce),
                ethers.keccak256(ethers.getBytes(userOp.initCode || '0x')),
                ethers.keccak256(ethers.getBytes(userOp.callData)),
                accountGasLimits,
                BigInt(userOp.preVerificationGas),
                gasFees,
                ethers.keccak256(ethers.getBytes(userOp.paymasterAndData || '0x')),
            ]
        )
    );

    // Final hash with entryPoint and chainId
    return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'address', 'uint256'],
            [userOpHash, entryPointAddress, chainId]
        )
    );
}
```

**NOTE:** The on-chain paymaster contract MUST be verified to use the same hash scheme. If it's a custom contract, read its `validatePaymasterUserOp` function to determine the exact hash it verifies. The above matches the standard ERC-4337 `getUserOpHash` pattern.

---

## HIGH Issues (7)

### H-1: Preflight simulation is non-blocking — invalid UserOps pass through

**File:** `src/services/gasless.js`, lines 163–168  
**Dimension:** Security  
**Description:** If `simulateUserOp` throws, the error is caught and logged as a warning, but the relay proceeds to sign and submit the UserOp. If the UserOp would actually revert on-chain, the paymaster deposit is charged for gas with no user action completed. This is a griefing vector: an attacker can repeatedly submit invalid UserOps that fail simulation, draining the paymaster via gas costs on the bundler.

**Fix:**
```js
// src/services/gasless.js, lines 163-168
// Remove the try/catch — let simulation failure abort the relay
await simulateUserOp(userOp, env);
```

---

### H-2: Simulation runs without paymaster data

**File:** `src/services/gasless.js`, lines 163–168 and `src/gasless/preflightSimulation.js`, line 40  
**Dimension:** Correctness  
**Description:** The simulation (step 5) runs BEFORE the paymaster data is signed (step 7). The UserOp's `paymasterAndData` is `'0x'` at simulation time. This means the EntryPoint simulation validates without paymaster context — it won't catch paymaster-specific rejections (e.g., wrong signer, expired validity window). The simulation result is unreliable for the final submission.

**Fix:** Reorder the relay flow: re-estimate → sign paymaster → simulate → submit:
```js
// src/services/gasless.js, in relayUserOp(), replace steps 5-8:
// 5. Relay-time fee re-estimation
await reEstimateFeeAtRelay(userOp, env);

// 6. Sign paymaster data
const userOpForSign = { ...userOp };
const paymasterSignature = await signPaymasterData(userOpForSign, env);
const paymasterAddress = env.PAYMASTER_ADDRESS;
if (!paymasterAddress) {
    throw { status: 500, message: 'PAYMASTER_ADDRESS not configured' };
}
const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
const validAfter = 0n;
const validityData = ethers.solidityPacked(['uint48', 'uint48'], [validUntil, validAfter]);
userOpForSign.paymasterAndData = ethers.concat([
    paymasterAddress, validityData, paymasterSignature
]);

// 7. Pre-flight simulation (now with paymaster data — BLOCKING)
await simulateUserOp(userOpForSign, env);

// 8. Submit to Alto bundler
const userOpHash = await sendWithFallback(userOpForSign, env, eip7702Auth);
```

---

### H-3: Wildcard CORS origin on financial endpoints

**File:** `src/utils/response.js`, line 11  
**Dimension:** Security  
**Description:** `'Access-Control-Allow-Origin': '*'` allows any website to make requests to the relay. A malicious website could trigger authenticated relay requests from a user's browser if the user has a valid JWT stored in a way accessible to JavaScript (e.g., in memory from a prior auth flow). Combined with the JWT body fallback (H-4), this creates a cross-site request forgery surface on financial operations.

**Fix:**
```js
// src/utils/response.js, replace lines 10-14
const ALLOWED_ORIGINS = [
    'https://bittasker.com',
    'https://app.bittasker.com',
    'http://localhost:5173',
    'http://localhost:3000',
];

export function getCorsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : '';
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Request-ID, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin',
    };
}
```
Then update `handleOptions`, `jsonResponse`, and `errorResponse` to accept and pass through the request origin.

---

### H-4: JWT accepted from request body instead of Authorization header only

**File:** `src/routes.js`, lines 54 and 65  
**Dimension:** Security  
**Description:** `body._auth = request.headers.get('Authorization') || body._auth` falls back to the JWT in the JSON body if the Authorization header is missing. This means:
1. JWTs can be sent in the body, where they may be logged by proxies, CDNs, or access logs
2. A malicious page (see H-3 CORS) could embed the JWT in a fetch body if it somehow obtained it
3. The `_auth` field pollutes the business-logic body object

**Fix:**
```js
// src/routes.js, replace line 54 and 65 with:
const authHeader = request.headers.get('Authorization');
if (!authHeader) {
    return errorResponse('Missing Authorization header', 401);
}
body._auth = authHeader;
```

---

### H-5: No rate limiting on relay or estimate endpoints

**File:** `src/services/gasless.js` and `src/routes.js`  
**Dimension:** Security  
**Description:** No rate limiting on any endpoint. The relay endpoint triggers 4+ RPC calls (deposit check, simulation, re-estimation, Alto submission). A single attacker with a valid JWT can flood the worker, depleting paymaster deposits via failed-but-submitted UserOps and driving up RPC costs on the Arbitrum node.

**Fix:** Use Cloudflare's built-in rate limiting (configured in the CF dashboard for the `tx-relay.bittasker.com` zone) targeting:
- `/gasless/relay`: 10 requests/minute per IP
- `/gasless/estimate`: 30 requests/minute per IP
- `/gasless/balance`: 60 requests/minute per IP

Alternatively, implement an in-memory token bucket (resets on isolate recycle, so approximate):
```js
// src/gasless/rateLimiter.js (new file)
const buckets = new Map();
const WINDOW_MS = 60_000;

export function checkRateLimit(key, maxRequests) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (bucket && now - bucket.start < WINDOW_MS) {
        if (bucket.count >= maxRequests) return false;
        bucket.count++;
    } else {
        buckets.set(key, { start: now, count: 1 });
    }
    return true;
}
```

---

### H-6: No input validation on address format or amount values

**File:** `src/gasless/gaslessController.js`, lines 86–88, 112–114, 139–141  
**Dimension:** Security  
**Description:** The controller only checks for field presence (`!token || !amount || !recipient`) but does not validate:
- `token` is a valid 20-byte Ethereum address
- `recipient` / `sender` are valid addresses
- `amount` / `feeBuffer` are valid positive integer strings
- `userOp` contains all required ERC-4337 fields with correct types

Invalid inputs propagate deep into the call chain, producing confusing ethers.js errors that could leak internal state.

**Fix:** Add a validation utility and call it at the controller boundary:
```js
// src/gasless/validation.js (new file)
export function isValidAddress(addr) {
    return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function isValidBigIntString(val) {
    try { return typeof val === 'string' && BigInt(val) >= 0n; } catch { return false; }
}

export function validateUserOpFields(userOp) {
    const required = ['sender', 'nonce', 'callData', 'callGasLimit', 'verificationGasLimit',
                      'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'];
    for (const field of required) {
        if (userOp[field] === undefined || userOp[field] === null) {
            throw { status: 400, message: `userOp missing required field: ${field}` };
        }
    }
    if (!isValidAddress(userOp.sender)) throw { status: 400, message: 'userOp.sender is not a valid address' };
    if (!userOp.callData.startsWith('0x')) throw { status: 400, message: 'userOp.callData must be hex' };
}
```

Then in `handleEstimate`:
```js
if (!isValidAddress(token)) return errorResponse('Invalid token address', 400);
if (!isValidAddress(recipient)) return errorResponse('Invalid recipient address', 400);
if (!isValidBigIntString(amount)) return errorResponse('Invalid amount', 400);
```

And in `handleRelay`:
```js
if (!isValidAddress(sender)) return errorResponse('Invalid sender address', 400);
validateUserOpFields(userOp);
```

---

### H-7: `checkBalance` catch block can double-throw

**File:** `src/services/gasless.js`, lines 212–219  
**Dimension:** Error Handling  
**Description:** The catch block attempts `BigInt(body.amount) + BigInt(body.feeBuffer)`. If the original error was caused by invalid BigInt strings, this will throw again inside the catch, resulting in an unhandled promise rejection and a raw 500 to the client.

**Fix:**
```js
// src/services/gasless.js, lines 212-219
} catch (e) {
    console.error(`[gasless] Balance check failed: ${e.message}`);
    let required = '0';
    try {
        required = (BigInt(body.amount) + BigInt(body.feeBuffer)).toString();
    } catch {
        // amount/feeBuffer were invalid — already caught upstream
    }
    return {
        sufficient: false,
        balance: '0',
        required
    };
}
```

---

## MEDIUM Issues (7)

### M-1: ethers JsonRpcProvider has no timeout on Arbitrum RPC calls

**Files:** `src/gasless/chainlinkOracle.js` line 59, `src/gasless/depositMonitor.js` line 28, `src/gasless/preflightSimulation.js` line 23  
**Dimension:** CF Worker Compatibility  
**Description:** All three files create `new ethers.JsonRpcProvider(rpcUrl)` without a timeout. If the Arbitrum RPC node is slow or unresponsive, the worker will hang until the CF Worker execution limit (30 seconds). Unlike the Alto `fetch` call which has `AbortSignal.timeout(10_000)`, these provider calls have no timeout protection.

**Fix:** Configure the provider with a timeout:
```js
const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
    staticNetwork: true,
    batchMaxCount: 1,
    timeout: 10_000, // 10 seconds
});
```

Apply this in all three files where providers are created.

---

### M-2: Dummy UserOp uses `recipient` as `sender` for gas estimation

**File:** `src/services/gasless.js`, line 79  
**Dimension:** Correctness  
**Description:** `buildDummyUserOp(recipient, dummyCallData)` sets the UserOp `sender` to the token transfer recipient. The bundler simulates the UserOp in the context of `sender`. If the recipient isn't a deployed smart account, the estimation fails with AA20 (handled via fallback values, but produces inaccurate estimates). The actual sender (the user's smart account) is available via `userId`/`payload.sub` but is not passed through.

**Fix:** Accept and pass the smart account address:
```js
// src/gasless/gaslessController.js, line 91
const result = await estimateFee({ token, amount, recipient, calls, sender: payload.walletAddress || payload.sub }, payload.sub, env);

// src/services/gasless.js, line 75-79
export async function estimateFee(body, userId, env) {
    const { token, amount, recipient } = body;
    const dummyCallData = buildCallData(token, amount, recipient, env, body.calls);
    const dummyUserOp = buildDummyUserOp(body.sender || recipient, dummyCallData);
```

---

### M-3: Price cache has no maximum size

**File:** `src/gasless/chainlinkOracle.js`, line 16  
**Dimension:** Production Readiness  
**Description:** Module-level `priceCache` Map grows unbounded. Currently only 3 tokens exist, so this is not a practical issue. But if tokens are added dynamically or the token list expands, memory usage grows without bound within the worker isolate.

**Fix:** Add a max-size check after each cache write:
```js
// src/gasless/chainlinkOracle.js, after line 48
const MAX_CACHE_ENTRIES = 20;
if (priceCache.size > MAX_CACHE_ENTRIES) {
    // Evict oldest entry
    const oldest = priceCache.keys().next().value;
    priceCache.delete(oldest);
}
```

---

### M-4: `currentAltoIndex` always starts at 0 on isolate recycle — thundering herd

**File:** `src/services/gasless.js`, line 26  
**Dimension:** CF Worker Compatibility  
**Description:** Module-level `currentAltoIndex = 0` resets to 0 when a CF Worker isolate is recycled. If many isolates start simultaneously (e.g., after a deploy), all initial requests hit Alto URL index 0, creating a thundering herd.

**Fix:**
```js
// src/services/gasless.js, line 26
// Randomize initial index to distribute load on cold start
const altoUrls = []; // Will be populated from env
let currentAltoIndex = -1; // -1 signals "not yet initialized"

function getAltoIndex(env) {
    const urls = getAltoUrls(env);
    if (currentAltoIndex < 0 || currentAltoIndex >= urls.length) {
        currentAltoIndex = Math.floor(Math.random() * urls.length);
    }
    return currentAltoIndex;
}
```

---

### M-5: `buildCallData` appends duplicate fee transfer when client provides `calls`

**File:** `src/services/gasless.js`, lines 348–379  
**Dimension:** Correctness  
**Description:** When the client provides a `calls` array (line 348), the function maps them into `callsArray` and then unconditionally appends another fee transfer (lines 372–379). If the client's last call was already a fee transfer to the treasury, there will be two fee transfers, doubling the fee charged to the user.

**Fix:** Skip the appended fee transfer if the client already included one:
```js
// src/services/gasless.js, lines 343-393
function buildCallData(token, amount, recipient, env, calls) {
    const gasTreasury = env.GAS_TREASURY || ethers.ZeroAddress;
    const dummyFeeBuffer = '1000000000000000';

    let callsArray;
    if (calls && calls.length > 0) {
        callsArray = calls.map(c => [c.to, c.value || '0', c.data]);
        // Check if the last call is already a fee transfer to this token
        const lastCall = calls[calls.length - 1];
        const lastCallSelector = lastCall.data?.slice(0, 10)?.toLowerCase();
        const isAlreadyFeeTransfer =
            lastCall.to?.toLowerCase() === token.toLowerCase() &&
            lastCallSelector === '0xa9059cbb';
        if (!isAlreadyFeeTransfer) {
            callsArray.push([
                token, '0',
                '0xa9059cbb' +
                    ethers.AbiCoder.defaultAbiCoder()
                        .encode(['address', 'uint256'], [gasTreasury, dummyFeeBuffer])
                        .slice(2)
            ]);
        }
    } else {
        callsArray = [
            [token, '0', '0xa9059cbb' +
                ethers.AbiCoder.defaultAbiCoder()
                    .encode(['address', 'uint256'], [recipient, amount]).slice(2)],
            [token, '0', '0xa9059cbb' +
                ethers.AbiCoder.defaultAbiCoder()
                    .encode(['address', 'uint256'], [gasTreasury, dummyFeeBuffer]).slice(2)]
        ];
    }

    return (
        '0x8d80ff0a' +
        ethers.AbiCoder.defaultAbiCoder()
            .encode(
                ['address[]', 'uint256[]', 'bytes[]'],
                [callsArray.map(c => c[0]), callsArray.map(c => c[1]), callsArray.map(c => c[2])]
            ).slice(2)
    );
}
```

---

### M-6: Estimation and relay send different UserOp formats to Alto

**File:** `src/services/gasless.js`, lines 86–89 vs 319–322  
**Dimension:** Correctness  
**Description:** The estimation call (line 86) sends the raw `buildDummyUserOp()` output with decimal string values (e.g., `'200000'`, `'100000000'`). The relay call (line 320) uses `toAltoUserOp()` which converts to hex (e.g., `'0x30d40'`, `'0x5f5e100'`). If the Alto bundler expects a specific format, the estimation might produce different results than what the relay actually experiences.

**Fix:** Use `toAltoUserOp` for estimation too:
```js
// src/services/gasless.js, lines 86-89
const altoDummyOp = toAltoUserOp(dummyUserOp);
estimate = await sendToAlto(altoUrls[currentAltoIndex], 'eth_estimateUserOperationGas', [
    altoDummyOp,
    ENTRY_POINT_ADDRESS
]);
```

---

### M-7: Testnet config incompatible with mainnet token addresses

**File:** `wrangler.toml`, lines 39–46 and `src/gasless/config.js`, lines 12–14  
**Dimension:** Production Readiness  
**Description:** The `config.js` file hardcodes Arbitrum One mainnet token addresses (`USDT0_ADDRESS`, `WBTC_ADDRESS`, `TBTC_ADDRESS`) and price feeds (`BTC_USD_FEED`). The testnet environment in `wrangler.toml` uses Arbitrum Sepolia RPC, but the token addresses and price feeds are for mainnet. Deploying to testnet would interact with non-existent contracts on Sepolia, causing all RPC calls to fail.

**Fix:** Make token addresses and price feeds environment-dependent:
```js
// src/gasless/config.js — add env-aware token resolution
export function getTokenAddresses(env) {
    const isTestnet = (env.ARBITRUM_RPC_URL || '').includes('sepolia');
    if (isTestnet) {
        return {
            USDT0: '0x...', // Arbitrum Sepolia USDT0 address
            WBTC: '0x...',  // Arbitrum Sepolia WBTC address
            TBTC: '0x...',  // Arbitrum Sepolia tBTC address
        };
    }
    return {
        USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        TBTC: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
    };
}
```
Or add these as env vars in wrangler.toml per environment.

---

## LOW Issues (6)

### L-1: JWT doesn't validate `iss`, `aud`, or `nbf` claims

**File:** `src/gasless/gaslessController.js`, lines 67–73  
**Dimension:** Security  
**Description:** JWT validation only checks signature and `exp`. Missing:
- `iss` (issuer): A JWT from a different service signed with the same key would be accepted
- `aud` (audience): A JWT issued for a different API endpoint would be accepted
- `nbf` (not-before): Future-dated tokens would be accepted

**Fix:**
```js
// src/gasless/gaslessController.js, after line 71
if (payload.iss && env.JWT_ISSUER && payload.iss !== env.JWT_ISSUER) {
    throw { status: 401, message: 'Invalid token issuer' };
}
if (payload.aud && env.JWT_AUDIENCE && payload.aud !== env.JWT_AUDIENCE) {
    throw { status: 401, message: 'Invalid token audience' };
}
if (payload.nbf && payload.nbf * 1000 > Date.now()) {
    throw { status: 401, message: 'Token not yet valid' };
}
```

---

### L-2: `reEstimateFeeAtRelay` duplicates callData parsing logic

**File:** `src/services/gasless.js`, lines 297–341  
**Dimension:** Code Quality  
**Description:** `reEstimateFeeAtRelay` re-parses the callData to extract fee transfer info (lines 299–311), duplicating the same logic from `validateCallData` (lines 252–274). If the parsing logic diverges between the two functions, bugs could be introduced silently.

**Fix:** Extract a shared helper:
```js
// src/services/gasless.js, add before validateCallData
function extractFeeTransferInfo(callData) {
    const selector = callData.slice(0, 10);
    if (selector !== '0x8d80ff0a') throw new Error('Not executeBatch');
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['address[]', 'uint256[]', 'bytes[]'],
        '0x' + callData.slice(10)
    );
    const [dest, , func] = decoded;
    const lastCallData = func[func.length - 1];
    const lastDest = dest[dest.length - 1];
    const [feeRecipient, feeAmount] = ethers.AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        '0x' + lastCallData.slice(10)
    );
    return { feeToken: lastDest, feeRecipient, feeAmount: BigInt(feeAmount) };
}
```
Then use it in both `validateCallData` and `reEstimateFeeAtRelay`.

---

### L-3: `checkBalance` always returns `sufficient: true`

**File:** `src/services/gasless.js`, lines 207–208  
**Dimension:** Correctness  
**Description:** The function always returns `sufficient: true` with a comment saying "Client is responsible for pre-checking balance." This makes the endpoint misleading — callers trust it for balance verification. If the client-side check has a bug, there's no server-side safety net.

**Fix:** Either implement actual on-chain balance checking:
```js
// Option A: Implement real balance check
const provider = new ethers.JsonRpcProvider(env.ARBITRUM_RPC_URL);
const erc20 = new ethers.Contract(tokenInfo.address, [
    'function balanceOf(address) view returns (uint256)'
], provider);
const balance = await erc20.balanceOf(senderAddress);
return {
    sufficient: balance >= required,
    balance: balance.toString(),
    required: required.toString()
};
```
Or rename the endpoint to `calculateRequired` and remove the `sufficient` field to avoid confusion.

---

### L-4: `ETH_USD_FEED` is exported but never used

**File:** `src/gasless/config.js`, line 56  
**Dimension:** Code Quality  
**Description:** `ETH_USD_FEED` is exported but no code references it. It was likely intended for an ETH/USD price feed that was never implemented (the code uses BTC/USD for WBTC/tBTC and a hardcoded $1 for USDT0).

**Fix:** Remove the dead export:
```js
// Delete line 56:
// export const ETH_USD_FEED = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';
```

---

### L-5: Stale price could produce zero-fee or division-by-zero

**File:** `src/gasless/chainlinkOracle.js`, line 66 and `src/gasless/config.js`, line 106  
**Dimension:** Correctness  
**Description:** If the Chainlink oracle returns `answer = 0` (possible during market dislocation, feed migration, or if the round is not settled), `tokenPriceUSD` would be 0. Then `convertToTokenFee` on config.js line 106 divides by `tokenPriceUSD`, causing a division-by-zero error. The staleness check (line 75-80) doesn't catch this because `updatedAt` could be recent while `answer` is 0.

**Fix:** Add a zero-price check in `getBtcPrice`:
```js
// src/gasless/chainlinkOracle.js, after line 66
const answer = BigInt(roundData[0]);
if (answer <= 0n) {
    throw new Error('BTC/USD price feed returned zero or negative answer');
}
```

---

### L-6: Logging uses `console.log/warn/error` — unstructured, no request correlation

**File:** All files  
**Dimension:** Production Readiness  
**Description:** All logging uses raw `console.log/warn/error` which produces unstructured text output. In CF Workers, these appear in the dashboard logs and can be shipped to Logpush. Without structured JSON and request correlation IDs, it's difficult to:
- Filter logs by request
- Set up alerts on specific error patterns
- Aggregate metrics across requests

**Fix:** Create a structured logger:
```js
// src/utils/logger.js (new file)
export function createLogger(context) {
    const base = { context, ts: () => new Date().toISOString() };
    return {
        info: (msg, data = {}) => console.log(JSON.stringify({ ...base, level: 'info', msg, ...data })),
        warn: (msg, data = {}) => console.warn(JSON.stringify({ ...base, level: 'warn', msg, ...data })),
        error: (msg, data = {}) => console.error(JSON.stringify({ ...base, level: 'error', msg, ...data })),
    };
}
```

---

## Issue Summary Table

| # | Severity | File | Lines | Issue |
|---|----------|------|-------|-------|
| C-1 | CRITICAL | src/services/gasless.js | 44–64 | `paymasterAndData` missing from `toAltoUserOp` — never reaches bundler |
| C-2 | CRITICAL | src/services/gasless.js | 177 | Uses ENTRY_POINT_ADDRESS instead of PAYMASTER_ADDRESS |
| C-3 | CRITICAL | src/services/gasless.js | 178 | Signature ABI-encoded (129 bytes) instead of raw (65 bytes) |
| C-4 | CRITICAL | src/services/gasless.js | 144 | Sender ownership check bypassed when JWT lacks `walletAddress` |
| C-5 | CRITICAL | src/gasless/paymasterSigner.js | 44–57 | Paymaster hash omits gas parameters — signatures malleable or non-functional |
| H-1 | HIGH | src/services/gasless.js | 163–168 | Simulation is non-blocking — invalid UserOps drain paymaster |
| H-2 | HIGH | src/services/gasless.js | 163–168 | Simulation runs without paymaster data |
| H-3 | HIGH | src/utils/response.js | 11 | Wildcard CORS on financial endpoints |
| H-4 | HIGH | src/routes.js | 54, 65 | JWT accepted from request body |
| H-5 | HIGH | src/routes.js + gasless.js | — | No rate limiting on any endpoint |
| H-6 | HIGH | src/gasless/gaslessController.js | 86–88, 112–114, 139–141 | No input validation on addresses or amounts |
| H-7 | HIGH | src/services/gasless.js | 212–219 | `checkBalance` catch block can double-throw |
| M-1 | MEDIUM | chainlinkOracle.js, depositMonitor.js, preflightSimulation.js | 59, 28, 23 | No timeout on ethers JsonRpcProvider |
| M-2 | MEDIUM | src/services/gasless.js | 79 | Dummy UserOp uses `recipient` as `sender` |
| M-3 | MEDIUM | src/gasless/chainlinkOracle.js | 16 | Price cache has no max size |
| M-4 | MEDIUM | src/services/gasless.js | 26 | `currentAltoIndex` always starts at 0 — thundering herd |
| M-5 | MEDIUM | src/services/gasless.js | 348–379 | Duplicate fee transfer when client provides `calls` |
| M-6 | MEDIUM | src/services/gasless.js | 86–89 vs 319–322 | Estimation and relay use different UserOp formats |
| M-7 | MEDIUM | wrangler.toml + config.js | 39–46, 12–14 | Testnet config incompatible with mainnet token addresses |
| L-1 | LOW | src/gasless/gaslessController.js | 67–73 | JWT doesn't validate `iss`, `aud`, `nbf` |
| L-2 | LOW | src/services/gasless.js | 297–341 | Duplicated callData parsing logic |
| L-3 | LOW | src/services/gasless.js | 207–208 | `checkBalance` always returns `sufficient: true` |
| L-4 | LOW | src/gasless/config.js | 56 | `ETH_USD_FEED` exported but never used |
| L-5 | LOW | src/gasless/chainlinkOracle.js | 66 | Zero-price oracle answer causes division by zero |
| L-6 | LOW | All files | — | Unstructured logging, no request correlation |

---

## Recommended Fix Order

| Phase | Issues | Effort | Gate |
|-------|--------|--------|------|
| **Phase 1: Make relay functional** | C-1, C-2, C-3 | 2h | Without these, no UserOp reaches the bundler correctly |
| **Phase 2: Fix signing** | C-5 + H-2 | 4h | Must verify against on-chain paymaster contract; requires contract source |
| **Phase 3: Close auth gaps** | C-4, H-3, H-4, H-6 | 3h | Standard security hardening |
| **Phase 4: Safety rails** | H-1, H-7, M-1, L-5 | 2h | Prevent paymaster drain and RPC hangs |
| **Phase 5: Correctness** | M-2, M-5, M-6, L-2, L-3 | 2h | Accuracy improvements |
| **Phase 6: Production polish** | H-5, M-3, M-4, M-7, L-1, L-4, L-6 | 2h | Rate limiting, logging, config |
