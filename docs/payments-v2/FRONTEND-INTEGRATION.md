# BitTasker Gasless Transactions — Frontend Integration Guide

This document provides everything the BitTasker frontend needs to integrate with the meta-transaction relay for gasless transactions on SecurePaymentContract (RGB).

---

## Prerequisites

- **abi.json** — A complete copy of the compiled SecurePaymentContract ABI (full JSON including constructor, functions, events, errors). Use this for building calldata and creating the contract instance.
- **ethers.js v6** (or compatible)
- User wallet (MetaMask, etc.) connected to RGB

---

## Overview

The relay lets users submit **gasless meta-transactions** to the SecurePaymentContract. The user signs a message off-chain; the relay pays gas and submits the transaction on their behalf. The contract reimburses the relay from the payment amount.

**Flow:**

1. **Frontend** builds `(sender, data, signature)` and POSTs to the relay.
2. **Relay** validates, simulates via `eth_call`, then submits the transaction.
3. **Contract** runs `executeMetaTransaction(sender, data, signature)` and reimburses the relay.

There is no ERC2771 TrustedForwarder — the contract has inlined meta-tx support. The relay **simulates before submitting** so it never pays gas for requests that would revert.

---

## Relay API Endpoints

### Base URLs by Environment

| Environment | Base URL                                    | Chain                           |
| ----------- | ------------------------------------------- | ------------------------------- |
| **Testnet** | `https://tx-relay.testnet.bittasker.com`    | RGB Testnet (chainId: 31) |
| **Mainnet** | `https://tx-relay.bittasker.com`            | RGB Mainnet (chainId: 30) |
| **Local**   | `http://localhost:8787` (via `npm run dev`) | Hardhat (31337) or Testnet      |

---

### GET /health

Health check — returns relay status and relay wallet address.

**Response (200):**

```json
{
	"status": "ok",
	"wallet": "0x...",
	"timestamp": "2026-03-02T..."
}
```

**Use case:** Pre-flight check before showing gasless option, or monitoring.

---

### GET /info

Returns data needed to build and sign meta-transactions.

**Response (200):**

```json
{
	"securePaymentAddress": "0x...",
	"chainId": "31"
}
```

**Important:** Always fetch `/info` before building a meta-tx. Use the returned `securePaymentAddress` and `chainId` — they may differ per environment (testnet vs mainnet).

---

### POST /relay

Submit a meta-transaction. Body must be `{ sender, data, signature }`.

**Request:**

```json
{
	"sender": "0x...",
	"data": "0x...",
	"signature": "0x..."
}
```

**Success (202 Accepted):**

```json
{
	"txHash": "0x...",
	"status": "submitted"
}
```

The relay returns **as soon as** the transaction is submitted to the network. It does **not** wait for block confirmation. Poll `eth_getTransactionReceipt` for confirmation if needed.

**Simulation failed (400):**

```json
{
	"error": "SIMULATION_FAILED",
	"message": "OnlyTaskee"
}
```

The `message` field contains the revert reason (e.g. `OnlyTaskee`, `TaskNotCompleted`, `InvalidState`).

**Submission failed (502):**

```json
{
	"error": "SUBMISSION_FAILED",
	"message": "RPC error or timeout"
}
```

**Validation error (400):**

```json
{
	"error": "Missing or invalid sender address"
}
```

---

## Building the Meta-Transaction (Frontend Code)

### Step 1: Fetch Relay Info

```javascript
const response = await fetch('https://tx-relay.testnet.bittasker.com/info');
const { securePaymentAddress, chainId } = await response.json();
```

### Step 2: Build Calldata

The `data` is **normal ABI-encoded calldata** — the same bytes as if the user called the function directly.

**Using ethers.js v6:**

```javascript
import { ethers } from 'ethers';
import abi from './abi.json'; // Full SecurePaymentContract ABI (from compiled contract)

const contract = new ethers.Contract(securePaymentAddress, abi);

// Example: completeTask(5)
const data = contract.interface.encodeFunctionData('completeTask', [5]);

// Example: acceptTask(5)
const data = contract.interface.encodeFunctionData('acceptTask', [5]);
```

### Step 3: Build the Message Hash and Sign

We use a **simple hash** (not EIP-712). The user signs with `signMessage` (EIP-191).

```javascript
const innerHash = ethers.keccak256(
	ethers.solidityPacked(
		['address', 'address', 'bytes32', 'uint256'],
		[sender, securePaymentAddress, ethers.keccak256(data), chainId]
	)
);

// User signs with their wallet (adds "\x19Ethereum Signed Message:\n32" automatically)
const signature = await signer.signMessage(ethers.getBytes(innerHash));
```

**Important:** `sender` must be the connected wallet address (`signer.address`). The `chainId` from `/info` is a string (e.g. `"31"`); pass it to `solidityPacked` — ethers will coerce it to `uint256`. Ensure the user's wallet is on the same network (chainId must match).

### Step 4: Submit to Relay

```javascript
const relayResponse = await fetch('https://tx-relay.testnet.bittasker.com/relay', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ sender, data, signature })
});

const result = await relayResponse.json();

if (relayResponse.ok && relayResponse.status === 202) {
	const { txHash } = result;
	// Show "Transaction submitted" — optionally poll for confirmation
} else {
	const { error, message } = result;
	// Show error: e.g. SIMULATION_FAILED with message "OnlyTaskee"
}
```

---

## Complete Example: submitGaslessMetaTx Helper

```javascript
import { ethers } from 'ethers';
import abi from './abi.json'; // Full SecurePaymentContract ABI

async function submitGaslessMetaTx(
	signer,
	relayBaseUrl,
	contractAddress,
	chainId,
	functionName,
	args
) {
	const contract = new ethers.Contract(contractAddress, abi, signer);
	const data = contract.interface.encodeFunctionData(functionName, args);
	const sender = await signer.getAddress();

	const innerHash = ethers.keccak256(
		ethers.solidityPacked(
			['address', 'address', 'bytes32', 'uint256'],
			[sender, contractAddress, ethers.keccak256(data), chainId]
		)
	);
	const signature = await signer.signMessage(ethers.getBytes(innerHash));

	const res = await fetch(`${relayBaseUrl}/relay`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sender, data, signature })
	});

	const json = await res.json();
	if (res.status === 202) return { ok: true, txHash: json.txHash };
	return { ok: false, error: json.error, message: json.message };
}

// Usage:
const { securePaymentAddress, chainId } = await (await fetch(relayBaseUrl + '/info')).json();
const result = await submitGaslessMetaTx(
	signer,
	relayBaseUrl,
	securePaymentAddress,
	chainId,
	'completeTask',
	[paymentId]
);
if (result.ok) {
	console.log('Tx submitted:', result.txHash);
} else {
	console.error(result.error, result.message);
}
```

---

## Meta-Callable Functions

All 12 lifecycle functions can be invoked via the relay. The relay does **not** need to know which function — simulation catches invalid state and permissions.

| Function                                                    | Who Can Call     | Typical Use             |
| ----------------------------------------------------------- | ---------------- | ----------------------- |
| `completeTask(uint32 paymentId)`                            | Taskee           | Mark task as complete   |
| `acceptTask(uint32 paymentId)`                              | Tasker           | Release funds to taskee |
| `disputeTask(uint32 paymentId)`                             | Tasker           | Open dispute            |
| `proposeResolution(uint32 paymentId, uint256 taskeeAmount)` | Tasker or Taskee | Propose resolution      |
| `acceptProposal(uint32 paymentId)`                          | Tasker or Taskee | Accept proposal         |
| `resolveAfterTimelock(uint32 paymentId)`                    | Tasker or Taskee | Resolve after timelock  |
| `cancelPaymentContract(uint32 paymentId)`                   | Tasker or Taskee | Cancel payment          |
| `refundTasker(uint32 paymentId)`                            | Tasker or Taskee | Refund tasker           |
| `markNoShow(uint32 paymentId)`                              | Tasker           | Mark taskee no-show     |
| `markWorkInProgress(uint32 paymentId)`                      | Taskee           | Mark work in progress   |
| `claimNoShowRefund(uint32 paymentId)`                       | Tasker           | Claim no-show refund    |
| `claimUpfrontDeposit(uint32 paymentId)`                     | Taskee           | Claim upfront deposit   |

**Parameter order:** All functions have `paymentId` as first parameter. `proposeResolution` has a second parameter `taskeeAmount`.

---

## Signature Format Reference

- **Hash:** `keccak256(solidityPacked(sender, contractAddress, keccak256(data), chainId))`
- **Sign:** `signMessage(getBytes(innerHash))` — EIP-191, 65-byte signature
- **No nonce, no deadline** — replay protection is via state machine (e.g. can't complete twice)

---

## Error Handling

| Error                               | Status | Meaning                                          |
| ----------------------------------- | ------ | ------------------------------------------------ |
| `SIMULATION_FAILED`                 | 400    | Call would revert. Check `message` for reason.   |
| `SUBMISSION_FAILED`                 | 502    | RPC or network issue. Retry.                     |
| `Missing or invalid sender address` | 400    | Bad request body.                                |
| `Invalid calldata format`           | 400    | `data` must be hex string (0x...).               |
| `Invalid signature format`          | 400    | Signature must be 65 bytes (130 hex chars + 0x). |

**Common `SIMULATION_FAILED` reasons:**

- `OnlyTaskee` — Tasker tried to call `completeTask` (only taskee can).
- `OnlyTaskerCanAccept` — Taskee tried to call `acceptTask` (only tasker can).
- `TaskNotCompleted` — `acceptTask` called before task was completed.
- `InvalidState` — State machine doesn't allow this transition.
- `InvalidSignature` — Wrong signer, wrong contract, wrong chainId, or tampered data.
- `InsufficientGasReserve` — Payment amount too low to cover gas reimbursement.

---

## UX Flow and Timing

| Step | Frontend Action                             | UX                                  |
| ---- | ------------------------------------------- | ----------------------------------- |
| 1    | User taps "Complete Task" (gasless)         | Show "Preparing..."                 |
| 2    | Fetch `/info` (if not cached)               | —                                   |
| 3    | Build `data`, prompt wallet to sign         | "Sign in your wallet"               |
| 4    | POST to `/relay`                            | "Submitting..."                     |
| 5    | Receive 202 + `txHash`                      | "Submitted! Confirmations pending." |
| 6    | (Optional) Poll `eth_getTransactionReceipt` | "Confirmed" after 1+ blocks         |

**Timing (RGB):**

- Relay processing: ~2–10 seconds
- Block time: ~14–30 seconds
- 1 confirmation: ~15–30 seconds after inclusion

**Recommendation:** Show "Submitted" as soon as you get `txHash`. Don't block the user waiting for confirmation unless the flow requires it.

---

## Polling for Confirmation (Optional)

```javascript
async function waitForConfirmation(provider, txHash, maxAttempts = 30) {
	for (let i = 0; i < maxAttempts; i++) {
		const receipt = await provider.getTransactionReceipt(txHash);
		if (receipt && receipt.blockNumber) {
			return receipt.status === 1 ? receipt : null; // 1 = success
		}
		await new Promise((r) => setTimeout(r, 5000)); // 5s
	}
	return null;
}
```

---

## Retries and Idempotency

- **Retry on 5xx or timeout:** Use a generous timeout (60–90 s). RGB RPC can be slow.
- **Do not retry on 400:** `SIMULATION_FAILED` means the tx would revert — retrying with the same payload won't help.
- **Same payload = same tx:** If the user retries after a timeout, they may resend the same `(sender, data, signature)`. The relay does not currently enforce idempotency — submitting twice could cause the second to revert (state already changed). For critical flows, consider tracking `txHash` per user action to avoid duplicate submissions.

---

## CORS

The relay returns CORS headers suitable for browser requests. Use `Content-Type: application/json` for POST.

---

## Gas Reserve (User-Side)

The gas reserve is **deducted from the payment amount** on-chain. Users don't pay gas — the payment must have enough `amount` to cover:

- Task value
- `HAPPY_PATH_GAS_RESERVE` (2 × gas reimbursement) for the happy path (e.g. completeTask + acceptTask)

If `payment.amount` is too low, `executeMetaTransaction` reverts with `InsufficientGasReserve`. This is enforced at `createPaymentContract` creation time.

---

## Security Notes

- The relay **simulates before submitting** — it never pays gas for reverting txs.
- The contract verifies the signature on-chain; the relay only forwards.
- No private keys are sent to the relay — only `sender`, `data`, and `signature`.

---

## Summary Checklist for Frontend

- [ ] Fetch `/info` to get `securePaymentAddress` and `chainId`
- [ ] Build calldata with `encodeFunctionData(functionName, args)`
- [ ] Sign with `signMessage(getBytes(keccak256(solidityPacked(...))))`
- [ ] POST `{ sender, data, signature }` to `/relay`
- [ ] Handle 202 (success), 400 (simulation failed), 502 (submission failed)
- [ ] Show `txHash` and optionally poll for receipt
- [ ] Use correct relay URL for testnet vs mainnet
