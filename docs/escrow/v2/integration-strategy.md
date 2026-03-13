# Escrow Contract v2 Integration Strategy

## Executive Summary

This document provides a precise integration strategy for supporting Escrow Contract v2 alongside existing v1 contracts. The architecture focuses on forward-compatible version abstraction, minimal code changes, simultaneous multi-version support, and **gasless-default transaction flow** with direct fallback.

**Core Principles:**

- Version detection via Nostr tags only (defaults to v1 if missing)
- ABI changes isolated from internal function naming
- Version abstraction layer already exists - extend, don't replace
- All contract versions loadable simultaneously
- Frontend-only scope (no deployment logic)
- No hardcoded version checks (`if version === 'v1'`)
- **Gasless-default:** For v2 non-payable writes, try relay first; fall back to direct calls when relay fails or user has rBTC

---

## Implementation Progress (Master Checklist)

_Check off items as you complete them. Use the detailed phase checklists in [§6 Implementation Checklist](#6-implementation-checklist) for granular tracking._

### Phase Overview

| Phase | Description                 | Status |
| ----- | --------------------------- | ------ |
| 1     | Core Module Setup           | [x]    |
| 2     | Gasless / Relay Integration | [x]    |
| 3     | Core Function Adaptations   | [ ]    |
| 4     | New v2 Features             | [ ]    |
| 5     | Error Handling              | [ ]    |
| 6     | Nostr Integration           | [ ]    |
| 7     | Type Updates                | [ ]    |
| 8     | Store Integration           | [ ]    |
| 9     | Permission System           | [ ]    |
| 10    | UI Integration              | [ ]    |
| 11    | Testing                     | [ ]    |
| 12    | Environment Configuration   | [ ]    |
| 13    | Final Verification          | [ ]    |

### Files to Create

| File                                                         | Purpose                                  | Done |
| ------------------------------------------------------------ | ---------------------------------------- | ---- |
| `src/lib/utils/escrow/v2/escrow.ts`                          | Core v2 contract interactions            | [x]  |
| `src/lib/utils/escrow/v2/escrowBid.ts`                       | Bid acceptance for v2                    | [x]  |
| `src/lib/utils/escrow/v2/escrowEvents.ts`                    | Transaction lifecycle, Nostr             | [x]  |
| `src/lib/utils/escrow/v2/escrow.enum.ts`                     | v2 EscrowStatus enum                     | [x]  |
| `src/lib/utils/escrow/v2/nostrContract.ts`                   | Nostr sync for v2                        | [x]  |
| `src/lib/utils/escrow/v2/index.ts`                           | v2 module exports                        | [x]  |
| `src/lib/utils/escrow/relayClient.ts` (or `escrowSubmit.ts`) | Gasless relay client / submitEscrowWrite | [x]  |

### Files to Modify

| File                                                  | Changes                                               | Done |
| ----------------------------------------------------- | ----------------------------------------------------- | ---- |
| `src/lib/utils/escrow/index.ts`                       | Register v2 handler, `LATEST_ESCROW_VERSION`          | [ ]  |
| `src/lib/utils/wallet/contractErrorHandler.ts`        | v2 custom error parsing                               | [ ]  |
| `src/lib/utils/helpers/contractPermissions.ts`        | v2 permissions, timing helpers                        | [ ]  |
| `src/lib/types/wallet.d.ts` (or contract types)       | EscrowData, NostrContract v2 fields                   | [ ]  |
| `locales/*/dashboard/contracts.json`                  | v2 error translation keys                             | [ ]  |
| `src/lib/components/contracts/ContractActions.svelte` | v2 action handlers (optional, if not via permissions) | [ ]  |

### Gasless Integration Checklist

| Task                                                | Done |
| --------------------------------------------------- | ---- |
| Relay client module created                         | [x]  |
| Meta-tx building (encode data, sign EIP-191)        | [x]  |
| `POST /relay` with retries                          | [x]  |
| Receipt polling for relay txHash                    | [x]  |
| Fallback to direct on relay failure                 | [x]  |
| `submitEscrowWrite` wired into v2 write functions   | [x]  |
| `createPaymentContract` kept direct-only            | [x]  |
| `VITE_RELAY_URL` configured (added to .env.example) | [x]  |
| Gasless path tested end-to-end                      | [ ]  |

---

## 1. Current v1 Integration Architecture

### 1.1 Module Structure

```
src/lib/utils/escrow/v1/
├── abi.json                    # Contract ABI definition
├── escrow.enum.ts              # EscrowStatus enum
├── escrow.ts                   # Core contract interactions
├── escrowBid.ts                # Bid acceptance logic
├── escrowEvents.ts             # Transaction lifecycle management
├── nostrContract.ts            # Nostr synchronization
└── index.ts                    # Public exports
```

**Key Exports:**

```typescript
export const escrow = {
	ensureEscrowReady,
	createEscrow, // Internal name != ABI name
	completeTask,
	acceptTask,
	cancelEscrow,
	disputeTask,
	proposeResolution,
	acceptProposal,
	resolveAfterTimelock,
	estimateContractGas,
	loadEscrowDetails, // Internal name != ABI name
	getDisputeProposal,
	isContractPaused,
	checkEscrowFundingStatus,
	resetCachedContract
};
```

### 1.2 Contract Interaction Pattern

**ensureEscrowReady() Pattern:**

```typescript
async function ensureEscrowReady(
	contractAddress?: string,
	requireBalance: boolean = true
): Promise<{
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
}> {
	// 1. Initialize wallet if needed
	// 2. Initialize provider if needed
	// 3. Get contract instance (default or legacy address if provided)
	// 4. Validate balance if required
}
```

**Note**: This function is version-agnostic. It loads the correct ABI based on which version module calls it.

**Write Operation Pattern (v2 with Gasless):**

For v2 non-payable lifecycle writes (completeTask, acceptTask, etc.), use a **submitEscrowWrite** abstraction that:

1. Tries **relay (gasless)** first — build meta-tx, POST to relay (see `docs/escrow/v2/gasless-frontend-integration.md`)
2. On relay success (202 + txHash) → return `{ hash: txHash, wait: () => pollReceipt(provider, txHash) }`
3. On relay failure → **fall back to direct** call (user pays gas with rBTC)

```typescript
// Inside submitEscrowWrite or per-write wrapper
const { hash, wait } = await submitEscrowWrite({
	method: 'completeTask',
	args: [paymentId],
	contract,
	wallet,
	provider,
	relayBaseUrl: VITE_RELAY_URL,
	useGasless: true // default
});

return { hash, escrowId: paymentId, status: 'pending' };
wait().then(async (receipt) => {
	/* Nostr, stores */
});
```

**Direct-only:** `createPaymentContract` — always direct (payable).

**Read Operation Pattern:**

```typescript
async function loadEscrowDetails(escrowId: string, contractAddress?: string): Promise<EscrowData> {
	const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);

	// Call view function (ABI name: getEscrow for v1)
	const escrowData = await targetContract.getEscrow(escrowId);

	// Transform to application types
	return {
		id: escrowId,
		tasker: escrowData.tasker.toLowerCase(), // Field renamed from 'client'
		taskee: escrowData.taskee.toLowerCase(), // Field renamed from 'freelancer'
		baseAmount: ethers.formatEther(escrowData.amount),
		status: mapBlockchainStateToEnum(escrowData.state)
		// ... remaining fields
	};
}
```

**Terminology Change**: All references to `client` → `tasker`, `freelancer` → `taskee` throughout the codebase.

### 1.3 Version Detection System (Current)

**Location**: Nostr contract event tags

**Current Detection:**

```typescript
// TAG_PATTERNS.contract() creates:
['v', 'v1']; // Version tag
```

**Current Usage in nostrContract.ts:**

```typescript
// When publishing contract
const tags = TAG_PATTERNS.contract(
	params.escrowId,
	params.taskId,
	params.freelancerPubkey,
	clientPubkey,
	network,
	'v1' // Version parameter
);
```

**Detection at Query Time:**

```typescript
// Read version from event tags
const versionTag = event.tags.find((tag) => tag[0] === 'v');
const version = versionTag?.[1] || 'v1'; // Default to v1
```

### 1.4 Event Handling Architecture

**Blockchain Events → Nostr Publishing Flow:**

```typescript
// 1. Parse blockchain event from transaction receipt
const escrowCreatedEvent = receipt.logs.find((log) => {
	const parsedLog = contract.interface.parseLog({
		topics: log.topics,
		data: log.data
	});
	return parsedLog?.name === 'EscrowCreated';
});

// 2. Extract event data
const escrowId = parsedLog.args[0].toString();
const client = parsedLog.args[1];
const freelancer = parsedLog.args[2];
const amount = parsedLog.args[3].toString();

// 3. Publish to Nostr
await handleEscrowCreated({
	escrowId,
	transactionHash: receipt.hash,
	client,
	freelancer,
	amount
});
```

**Nostr Event Structure:**

```typescript
// Contract creation event (KIND 30001)
{
    kind: 30001,
    content: JSON.stringify({
        escrowId: string,
        taskId: string,
        clientPubkey: string,
        freelancerPubkey: string,
        amount: string,
        status: EscrowStatus,
        // ...
        contractAddress: string,
        transactionHash?: string
    }),
    tags: [
        ['d', escrowId],      // Escrow ID
        ['t', taskId],        // Task ID
        ['p', clientPubkey],  // Participant
        ['p', freelancerPubkey], // Participant
        ['n', network],       // Network (mainnet/testnet)
        ['v', 'v1']          // Version tag
    ]
}

// Status update event (KIND 30002)
{
    kind: 30002,
    content: JSON.stringify({
        contractEventId: string,
        escrowId: string,
        action: EscrowStatus,
        message?: string,
        transactionHash?: string,
        // ...
    }),
    tags: [
        ['e', contractEventId], // Reference to contract event
        ['r', escrowId],        // Escrow ID
        ['p', recipientPubkey], // Recipient
        ['a', action],          // Action/status
        ['v', 'v1']            // Version tag
    ]
}
```

### 1.5 Type System

**Core Types:**

```typescript
// EscrowData - unified application type
interface EscrowData {
	id: string;
	client: string;
	freelancer: string;
	baseAmount: string;
	status: EscrowStatus;
	// ... all fields
}

// ContractWithEvents - store type
interface ContractWithEvents {
	contractEvent: ContractEvent;
	statusEvents: ContractStatusEvent[];
	isClient: boolean;
	blockchainStatus: EscrowStatus | null;
	escrowData: EscrowData;
	status: EscrowStatus; // Unified status
	isPending: boolean;
	permissions: ContractPermissions;
	// ...
}
```

---

## 2. ABI Differences Analysis

### 2.1 Critical Distinction: ABI Names vs Internal Names

**Important**: ABI function name changes do NOT require internal function renaming.

**Example - Contract Creation:**

**v1 ABI:**

```solidity
function createEscrow(...) returns (uint256)
```

**v2 ABI:**

```solidity
function createPaymentContract(...) returns (uint32)
```

**Our Internal Function (DOES NOT CHANGE):**

```typescript
// v1 wrapper
export async function createEscrow(...): Promise<ContractTransactionResult> {
    const tx = await contract.createEscrow(...); // ABI name
    return { hash: tx.hash, status: 'pending' };
}

// v2 wrapper (internal name stays the same)
export async function createEscrow(...): Promise<ContractTransactionResult> {
    const tx = await contract.createPaymentContract(...); // ABI name changed
    return { hash: tx.hash, status: 'pending' };
}
```

**Principle**: Internal API stability matters more than matching ABI names.

### 2.2 ABI Function Signature Changes

#### ID Type Change: uint256 → uint32

**v1:**

```solidity
function completeTask(uint256 escrowId)
function acceptTask(uint256 escrowId)
function cancelEscrow(uint256 escrowId)
// ... all functions use uint256
```

**v2:**

```solidity
function completeTask(uint32 paymentId)
function acceptTask(uint32 paymentId)
function cancelPaymentContract(uint32 paymentId)
// ... all functions use uint32
```

**Impact**:

- Parameter validation required (uint32 max: 4,294,967,295)
- Type conversion: `string` → `BigInt` → check range → `number`

#### Data Loading Signature Change

**v1:**

```solidity
function getEscrow(uint256 escrowId) view returns (
    tuple(
        address client,
        address freelancer,
        uint256 amount,
        uint32 estimatedStartTime,
        uint32 estimatedCompletionTime,
        uint32 timelockEnd,
        uint32 createdAt,
        uint8 clientFeeTier,
        uint8 freelancerFeeTier,
        uint8 state,
        uint8 reserved
    )
)
```

**v2:**

```solidity
function getPaymentContract(uint32 paymentId) view returns (
    tuple(
        address tasker,
        uint72 amount,
        uint8 state,
        uint8 taskerFeeTier,
        uint8 taskeeFeeTier,
        address taskee,
        uint32 createdAt,
        uint32 estimatedStartTime,
        uint32 estimatedCompletionTime,
        uint32 timelockEnd,
        bool noShowMarked
    )
)
```

**Key Differences:**

- Field order completely changed
- Field names changed: `client` → `tasker`, `freelancer` → `taskee`
- Amount type: `uint256` → `uint72`
- New field: `noShowMarked` (bool)
- Removed field: `reserved`

#### New Functions in v2

```solidity
function markNoShow(uint32 paymentId)
function claimNoShowRefund(uint32 paymentId)
function markWorkInProgress(uint32 paymentId)
function claimUpfrontDeposit(uint32 paymentId)
function getEstimatedStartTime(uint32 paymentId) view returns (uint32)
function getEstimatedCompletionTime(uint32 paymentId) view returns (uint32)
function getPaymentContractState(uint32 paymentId) view returns (uint8, bool, address, address, bool)
function getTimelockEnd(uint32 paymentId) view returns (uint32)
```

#### Removed Functions in v2

```solidity
// v1 only - NO EQUIVALENT IN v2
function getDisputeProposal(uint256 escrowId) view returns (...)
function getDisputeTimestamp(uint256 escrowId) view returns (uint32)
```

**Impact**: v2 does not store dispute proposals on-chain. Must rely entirely on Nostr events.

#### Contract Creation Signature

**v1:**

```solidity
function createEscrow(
    address freelancer,
    uint32 estimatedStartTime,
    uint32 estimatedCompletionTime,
    uint8 clientFeeTier,
    uint8 freelancerFeeTier
) payable returns (uint256)
```

**v2:**

```solidity
function createPaymentContract(
    address taskee,
    uint32 estimatedStartTime,
    uint32 estimatedCompletionTime,
    uint8 taskerFeeTier,
    uint8 taskeeFeeTier,
    uint72 cancellationFee,
    uint72 upfrontDeposit
) payable returns (uint32)
```

**New Parameters:**

- `cancellationFee` (uint72)
- `upfrontDeposit` (uint72)

### 2.3 Event Structure Changes

#### v1 Events

```solidity
event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount);
event TaskCompleted(uint256 indexed escrowId);
event TaskAccepted(uint256 indexed escrowId);
event TaskDisputed(uint256 indexed escrowId, address indexed disputer);
event DisputeProposed(uint256 indexed escrowId, address indexed proposer, uint256 freelancerAmount);
event DisputeResolved(uint256 indexed escrowId, uint256 clientAmount, uint256 freelancerAmount);
event EscrowCancelled(uint256 indexed escrowId, uint256 clientAmount, uint256 freelancerAmount);
event EscrowResolved(uint256 indexed escrowId, uint256 freelancerAmount, uint256 platformFee);
event Paused(address account);
event Unpaused(address account);
```

#### v2 Events

**VERIFIED from ABI:**

```solidity
event PaymentContractCreated(uint32 indexed paymentContractId);  // CONFIRMED: This is the creation event name
event StateTransition(uint32 indexed paymentContractId, uint8 fromState, uint8 toState, uint32 timestamp);
event UpfrontDepositClaimed(uint32 indexed paymentContractId, address indexed taskee);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
event Paused(address account);
event Unpaused(address account);
```

**Critical: v2 does NOT emit `EscrowCreated`. The creation event is `PaymentContractCreated`.**

#### State Transition Event Clarification

**Important**: `StateTransition` does NOT replace all state tracking mechanisms.

**What StateTransition Does:**

- Emitted for major blockchain state changes
- Provides `fromState` and `toState` for state machine tracking
- Does NOT emit for every possible state (e.g., pending states are Nostr-only)

**Blockchain States (Emitted via StateTransition):**

```
Funded (0) → WorkInProgress (10) → Completed (4) → FundsReleased (7)
Funded (0) → Cancelled (5)
Completed (4) → InDispute (1) → DisputeResolved (2)
```

**Nostr-Only States (NOT in StateTransition):**

```
PendingFunding (100)
PendingCompletion (101)
PendingAcceptance (103)
PendingDispute (104)
// ... all pending states 100+
```

**Coexistence Model:**

- `StateTransition` provides blockchain state history
- Nostr events provide pending/optimistic UI states
- Application combines both for unified status
- `StateTransition` is **event-driven** (real-time) but does not cover pending states

**IMPORTANT: Contract creation does NOT emit StateTransition. It only emits `PaymentContractCreated`.**

**Event Data Loss in v2:**

**v1 `EscrowCreated` (VERIFIED - v1 only):**

```solidity
event EscrowCreated(
    uint256 indexed escrowId,
    address indexed tasker,
    address indexed taskee,
    uint256 amount
);
```

**v2 `PaymentContractCreated` (VERIFIED - actual event name):**

```solidity
event PaymentContractCreated(
    uint32 indexed paymentContractId
);
```

**Lost Data:**

- Participant addresses (tasker, taskee)
- Amount

**Critical Implication**: Must call `getPaymentContract(paymentId)` immediately after receiving `PaymentContractCreated` event to fetch full contract data.

### 2.4 Error Handling (Verified Change)

**v1 Error Pattern:**

- Uses generic `require()` statements with string messages
- Reverts with strings like `"Insufficient balance"`
- Parsed via error message string matching

**v2 Error Pattern:**

- Uses custom errors (Solidity 0.8.4+)
- Example: `revert OnlyTasker();`, `revert InvalidState();`
- Error selectors encoded in revert data
- More gas-efficient, better debugging

**Error List (v2 adds 35 new custom errors):**

```solidity
// Access control
error OnlyParties();
error OnlyTaskee();
error OnlyTasker();
error OnlyTaskerCanAccept();
error OnlyTaskerCanResolveDisputes();

// Validation
error AmountMustBeGreaterThanZero();
error InvalidFeeTier();
error InvalidState();
error InvalidPaymentContractId();
// ... 30 more

// Existing from v1
error EnforcedPause();
error ExpectedPause();
error OwnableInvalidOwner(address owner);
error OwnableUnauthorizedAccount(address account);
error ReentrancyGuardReentrantCall();
```

**Required Change**: Error parsing utility must handle both patterns.

**Location**: `src/lib/utils/wallet/contractErrorHandler.ts` already exists and uses `$t(...)` from i18n for all error messages.

---

## 3. Required Code Changes

### 3.1 Escrow Enum Updates

**Current v2 enum** (`src/lib/utils/escrow/v2/escrow.enum.ts`):

- Currently a placeholder based on v1 structure
- Needs complete rewrite for v2 blockchain states

**Required Changes:**

```typescript
/**
 * Escrow Status Enum - V2
 *
 * BLOCKCHAIN STATES (0-10): Source of truth from smart contract
 * NOSTR STATES (100+): UI/UX states for pending transactions
 */
export enum EscrowStatus {
	// ============================================
	// BLOCKCHAIN STATES (0-10)
	// ============================================

	Funded = 0, // Escrow funded on blockchain
	InDispute = 1, // Task disputed
	DisputeResolved = 2, // Dispute resolved (FINAL)
	DisputeUnresolved = 3, // Dispute timelock expired (FINAL)
	Completed = 4, // Task completed by freelancer
	Cancelled = 5, // Escrow cancelled (FINAL)
	Refunded = 6, // Funds refunded to client (FINAL)
	FundsReleased = 7, // Funds released to freelancer (FINAL)
	FundsClaimed = 8, // Freelancer claimed after timelock (FINAL)
	NoShow = 9, // No-show marked
	WorkInProgress = 10, // Work actively in progress

	// ============================================
	// NOSTR STATES (100+)
	// ============================================

	PendingFunding = 100,
	PendingCompletion = 101,
	PendingCancellation = 102,
	PendingAcceptance = 103,
	PendingDispute = 104,
	PendingResolutionProposal = 105,
	PendingProposalAcceptance = 106,
	PendingTimelockResolution = 107,
	PendingMarkWorkInProgress = 108,
	PendingMarkNoShow = 109,
	PendingClaimNoShowRefund = 110,
	PendingClaimUpfrontDeposit = 111,
	DisputeResolutionProposed = 112
}

/**
 * Map blockchain state numbers to enum
 */
export function mapBlockchainStateToEnum(blockchainState: number): EscrowStatus {
	const mapping: Record<number, EscrowStatus> = {
		0: EscrowStatus.Funded,
		1: EscrowStatus.InDispute,
		2: EscrowStatus.DisputeResolved,
		3: EscrowStatus.DisputeUnresolved,
		4: EscrowStatus.Completed,
		5: EscrowStatus.Cancelled,
		6: EscrowStatus.Refunded,
		7: EscrowStatus.FundsReleased,
		8: EscrowStatus.FundsClaimed,
		9: EscrowStatus.NoShow,
		10: EscrowStatus.WorkInProgress
	};

	return mapping[blockchainState] ?? EscrowStatus.Funded;
}

export function isBlockchainState(status: EscrowStatus): boolean {
	return status >= 0 && status <= 10;
}

export function isPendingState(status: EscrowStatus): boolean {
	return status >= 100 && status <= 111;
}

export function isFinalState(status: EscrowStatus): boolean {
	return [
		EscrowStatus.DisputeResolved,
		EscrowStatus.DisputeUnresolved,
		EscrowStatus.Cancelled,
		EscrowStatus.Refunded,
		EscrowStatus.FundsReleased,
		EscrowStatus.FundsClaimed
	].includes(status);
}
```

**Removed States:**

- `InProgress = 7` (v1) → replaced by `WorkInProgress = 10` (v2 blockchain state)
- All Nostr states shifted from 6+ to 100+

### 3.2 Core escrow.ts Changes

**File**: `src/lib/utils/escrow/v2/escrow.ts`

**Changes Required:**

#### 3.2.1 ID Validation Utility

```typescript
/**
 * Validate payment ID is within uint32 range
 */
function validatePaymentId(id: string): void {
	const idNum = BigInt(id);
	if (idNum > 4294967295n) {
		throw new Error(`Payment ID ${id} exceeds uint32 maximum (4294967295)`);
	}
	if (idNum < 0n) {
		throw new Error(`Payment ID ${id} must be non-negative`);
	}
}
```

#### 3.2.2 Contract Creation (Internal Function - NO RENAME)

```typescript
// Internal function name stays: createEscrow
// ABI function name changes: createPaymentContract

async function createEscrow(
	freelancerAddress: string,
	baseAmount: string,
	estimatedStartTime: number,
	estimatedCompletionTime: number,
	clientFeeTier: FeeTier,
	freelancerFeeTier: FeeTier,
	cancellationFee?: string, // NEW - optional
	upfrontDeposit?: string // NEW - optional
): Promise<ContractTransactionResult> {
	try {
		const { contract, provider } = await ensureEscrowReady();

		// Convert address (same as v1)
		const freelancerAddressEip55 = ethers.getAddress(freelancerAddress.toLowerCase());

		const baseAmountWei = ethers.parseEther(baseAmount);
		const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

		// Convert optional v2 parameters
		const cancellationFeeWei = cancellationFee ? ethers.parseEther(cancellationFee) : 0n;
		const upfrontDepositWei = upfrontDeposit ? ethers.parseEther(upfrontDeposit) : 0n;

		// Fetch gas price
		const feeDataForEstimate = await provider.getFeeData();
		const gasPriceForEstimate = feeDataForEstimate.gasPrice || BigInt(0);

		// Estimate gas - ABI NAME CHANGED
		const gasEstimate = await contract.createPaymentContract.estimateGas(
			freelancerAddressEip55,
			estimatedStartTime,
			estimatedCompletionTime,
			clientFeeTier,
			freelancerFeeTier,
			cancellationFeeWei,
			upfrontDepositWei,
			{ value: totalPayment, gasPrice: gasPriceForEstimate }
		);

		// Execute - ABI NAME CHANGED
		const feeDataForTx = await provider.getFeeData();
		const gasPriceForTx = feeDataForTx.gasPrice || BigInt(0);

		const tx = await contract.createPaymentContract(
			freelancerAddressEip55,
			estimatedStartTime,
			estimatedCompletionTime,
			clientFeeTier,
			freelancerFeeTier,
			cancellationFeeWei,
			upfrontDepositWei,
			{
				value: totalPayment,
				gasLimit: gasEstimate + gasEstimate / 10n,
				gasPrice: gasPriceForTx
			}
		);

		const result: ContractTransactionResult = {
			hash: tx.hash,
			status: 'pending'
		};

		// Async confirmation handling (similar to v1)
		Promise.race([
			tx.wait(),
			new Promise<null>((_, reject) =>
				setTimeout(() => reject(new Error('Transaction timeout')), 5 * 60 * 1000)
			)
		])
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();

					// EVENT PARSING CHANGE
					const paymentCreatedEvent = receipt.logs.find((log) => {
						try {
							const parsedLog = contract.interface.parseLog({
								topics: log.topics,
								data: log.data
							});
							return parsedLog?.name === 'PaymentContractCreated';
						} catch {
							return false;
						}
					});

					if (paymentCreatedEvent) {
						const parsedLog = contract.interface.parseLog({
							topics: paymentCreatedEvent.topics,
							data: paymentCreatedEvent.data
						});

						if (parsedLog) {
							const paymentId = parsedLog.args[0].toString();
							result.escrowId = paymentId;

							// MUST FETCH FULL DATA (event doesn't contain it)
							const contractData = await contract.getPaymentContract(paymentId);

							await EscrowNostrEvent.handleEscrowCreated({
								escrowId: paymentId,
								transactionHash: receipt.hash,
								client: contractData.tasker,
								freelancer: contractData.taskee,
								amount: ethers.formatUnits(contractData.amount, 18)
							});
						}
					} else {
						console.warn('PaymentContractCreated event not found');
						EscrowNostrEvent.cleanupPendingContractByTxHash(receipt.hash);
					}
				} else {
					result.status = 'failed';
					if (result.hash) {
						EscrowNostrEvent.cleanupPendingContractByTxHash(result.hash);
					}
				}
			})
			.catch((error: unknown) => {
				console.error('Transaction failed or timed out:', error);
				result.status = 'failed';
				if (result.hash) {
					EscrowNostrEvent.cleanupPendingContractByTxHash(result.hash);
				}
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
```

#### 3.2.3 Data Loading (Internal Function - NO RENAME)

```typescript
// Internal function name stays: loadEscrowDetails
// ABI function name changes: getPaymentContract

async function loadEscrowDetails(escrowId: string, contractAddress?: string): Promise<EscrowData> {
	const loadStartTime = performance.now();

	// Validate ID range for v2
	validatePaymentId(escrowId);

	const MAX_RETRIES = 2;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);

			if (!targetContract) {
				throw new Error('Contract not found');
			}

			// ABI FUNCTION NAME CHANGED
			const escrowData = await targetContract.getPaymentContract(escrowId);

			// STRUCT MAPPING CHANGED
			const escrow: EscrowData = {
				id: escrowId,
				client: escrowData.tasker?.toLowerCase() || '', // Field name changed
				freelancer: escrowData.taskee?.toLowerCase() || '', // Field name changed
				baseAmount: ethers.formatUnits(escrowData.amount, 18), // uint72, not uint256
				clientFee: '0',
				freelancerFee: '0',
				totalAmount: ethers.formatUnits(escrowData.amount, 18),
				status: mapBlockchainStateToEnum(escrowData.state),
				estimatedStartTime: Number(escrowData.estimatedStartTime),
				estimatedCompletionTime: Number(escrowData.estimatedCompletionTime),
				completionTime: 0,
				timelockExpiry: Number(escrowData.timelockEnd),
				clientFeeTier: escrowData.taskerFeeTier as FeeTier, // Name changed
				freelancerFeeTier: escrowData.taskeeFeeTier as FeeTier, // Name changed
				createdAt: Number(escrowData.createdAt) * 1000,
				lastUpdated: Date.now(),

				// V2-SPECIFIC FIELDS
				noShowMarked: escrowData.noShowMarked
			};

			return escrow;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			lastError = error instanceof Error ? error : new Error(String(error));

			// Same retry logic as v1
			const isProviderError =
				errorMessage.includes('provider') || errorMessage.includes('provider destroyed');

			if (isProviderError && attempt < MAX_RETRIES) {
				resetCachedContract();
				await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
				continue;
			}

			throw new Error(`Failed to load escrow details for ID ${escrowId}: ${errorMessage}`);
		}
	}

	if (lastError) throw lastError;
	throw new Error(`Failed to load escrow details for ID ${escrowId}: Unknown error`);
}
```

#### 3.2.4 Other Write Functions (Pattern)

```typescript
// All write functions: validate ID, then execute
// Internal names stay the same

async function completeTask(escrowId: string, ...): Promise<ContractTransactionResult> {
    validatePaymentId(escrowId);

    const { contract, provider } = await ensureEscrowReady();

    // ... same gas logic as v1

    // ABI function name stays the same in this case
    const tx = await contract.completeTask(escrowId, { ... });

    // ... same confirmation handling
}

async function acceptTask(escrowId: string, ...): Promise<ContractTransactionResult> {
    validatePaymentId(escrowId);
    // ... same pattern
}

async function cancelEscrow(escrowId: string, ...): Promise<ContractTransactionResult> {
    validatePaymentId(escrowId);

    const { contract, provider } = await ensureEscrowReady();

    // ABI function name changed: cancelEscrow → cancelPaymentContract
    const gasEstimate = await contract.cancelPaymentContract.estimateGas(escrowId, { ... });
    const tx = await contract.cancelPaymentContract(escrowId, { ... });

    // ... same confirmation handling
}
```

#### 3.2.5 New v2 Functions

```typescript
// New functions for v2-specific features

async function markNoShow(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	validatePaymentId(escrowId);

	const { contract, provider } = await ensureEscrowReady();

	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || BigInt(0);

	const gasEstimate = await contract.markNoShow.estimateGas(escrowId, { gasPrice });
	const tx = await contract.markNoShow(escrowId, {
		gasLimit: gasEstimate + gasEstimate / 10n,
		gasPrice: gasPrice
	});

	const result: ContractTransactionResult = {
		hash: tx.hash,
		escrowId,
		status: 'pending'
	};

	if (contractEventId) {
		await EscrowNostrEvent.publishEscrowStatus({
			escrowId,
			contractEventId,
			transactionHash: tx.hash,
			status: EscrowStatus.PendingMarkNoShow
		});
	}

	// Async confirmation
	tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
		if (receipt && contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: receipt.hash,
				status: EscrowStatus.NoShow
			});
		}
	});

	return result;
}

async function claimNoShowRefund(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	validatePaymentId(escrowId);
	// ... similar pattern
}

async function markWorkInProgress(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	validatePaymentId(escrowId);
	// ... similar pattern
}

async function claimUpfrontDeposit(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	validatePaymentId(escrowId);
	// ... similar pattern
}
```

#### 3.2.6 Removed Function Handling

```typescript
// v2 does not support dispute proposal queries
async function getDisputeProposal(
	escrowId: string,
	contractAddress?: string
): Promise<DisputeProposal | null> {
	// v2 contracts do not store proposals on-chain
	// Return null - application must rely on Nostr events
	return null;
}
```

### 3.3 Error Handling Utility

**File**: `src/lib/utils/wallet/contractErrorHandler.ts` (VERIFIED - already exists)

**Current Implementation**: Already uses `$t(...)` from svelte-i18n for all error messages.

**Required Changes for v2 Support:**

```typescript
/**
 * Add v2 custom error detection to existing extractContractError()
 * Insert this logic BEFORE the existing string-based error matching
 */

// Inside extractContractError() function:

// NEW: Try v2 custom error decoding first (if error has .data property)
if (error instanceof Error && 'data' in error) {
	const errorWithData = error as Error & { data?: string };

	if (errorWithData.data) {
		// V2 custom error mapping (without contract.interface)
		const customErrorMap: Record<string, string> = {
			// Access control
			OnlyTasker: _('dashboard.contracts.errors.only_tasker'),
			OnlyTaskee: _('dashboard.contracts.errors.only_taskee'),
			OnlyParties: _('dashboard.contracts.errors.only_parties'),
			OnlyTaskerCanAccept: _('dashboard.contracts.errors.only_tasker_accept'),
			OnlyTaskerCanResolveDisputes: _('dashboard.contracts.errors.only_tasker_resolve'),

			// Validation
			AmountMustBeGreaterThanZero: _('dashboard.contracts.errors.amount_zero'),
			InvalidFeeTier: _('dashboard.contracts.errors.invalid_fee_tier'),
			InvalidState: _('dashboard.contracts.errors.invalid_state'),
			InvalidPaymentContractId: _('dashboard.contracts.errors.invalid_payment_id'),
			InvalidTaskee: _('dashboard.contracts.errors.invalid_taskee'),
			InvalidEstimatedTimes: _('dashboard.contracts.errors.invalid_times'),
			StartTimeTooFarInFuture: _('dashboard.contracts.errors.start_too_far'),
			CompletionTimeTooFarInFuture: _('dashboard.contracts.errors.completion_too_far'),
			MustBeAfterEstStartTime: _('dashboard.contracts.errors.before_start_time'),

			// State/Timing
			AlreadyAccepted: _('dashboard.contracts.errors.already_accepted'),
			CannotCancelAtThisTime: _('dashboard.contracts.errors.cannot_cancel'),
			CannotDisputeAtThisTime: _('dashboard.contracts.errors.cannot_dispute'),
			CannotMarkNoShowBeforeStart: _('dashboard.contracts.errors.noshow_before_start'),
			DisputeWindowExpired: _('dashboard.contracts.errors.dispute_expired'),
			TaskNotCompleted: _('dashboard.contracts.errors.task_not_completed'),
			TimelockNotPassed: _('dashboard.contracts.errors.timelock_active'),
			TimeBeforeStart: _('dashboard.contracts.errors.before_start'),
			NotInDispute: _('dashboard.contracts.errors.not_in_dispute'),
			MustWaitForOtherParty: _('dashboard.contracts.errors.wait_for_other'),

			// No-show (v2 only)
			NoShowAlreadyMarked: _('dashboard.contracts.errors.noshow_already_marked'),
			NoShowGracePeriodNotExpired: _('dashboard.contracts.errors.noshow_grace_not_expired'),
			NoShowNotMarked: _('dashboard.contracts.errors.noshow_not_marked'),
			NoShowResponsePeriodExpired: _('dashboard.contracts.errors.noshow_response_expired'),

			// Upfront deposit (v2 only)
			NoUpfrontDeposit: _('dashboard.contracts.errors.no_upfront_deposit'),
			UpfrontDepositAlreadyReleased: _('dashboard.contracts.errors.upfront_already_released'),
			UpfrontDepositGracePeriodNotExpired: _(
				'dashboard.contracts.errors.upfront_grace_not_expired'
			),

			// Transfer/Limits
			CancellationFeeExceedsPaymentContractAmount: _(
				'dashboard.contracts.errors.cancellation_exceeds'
			),
			InsufficientPaymentContractForUpfrontAndFee: _(
				'dashboard.contracts.errors.insufficient_for_upfront'
			),
			TaskeeAmountExceedsPaymentContract: _('dashboard.contracts.errors.taskee_exceeds'),
			ProposalLimitReached: _('dashboard.contracts.errors.proposal_limit'),
			PlatformFeeTransferFailed: _('dashboard.contracts.errors.platform_transfer_failed'),
			TaskeeTransferFailed: _('dashboard.contracts.errors.taskee_transfer_failed'),
			TaskerRefundTransferFailed: _('dashboard.contracts.errors.tasker_refund_failed'),

			// Deposits
			InvalidDeposits: _('dashboard.contracts.errors.invalid_deposits'),
			InvalidPaymentContractAmount: _('dashboard.contracts.errors.invalid_payment_amount'),
			CannotAcceptOwnProposal: _('dashboard.contracts.errors.cannot_accept_own_proposal')
		};

		// Try to extract error name from error data (basic selector matching)
		// This is a simplified approach - full ABI decoding would require ethers.js
		const errorMessage = errorWithData.message || '';
		for (const [errorName, translation] of Object.entries(customErrorMap)) {
			if (errorMessage.includes(errorName)) {
				return {
					userMessage: translation,
					technicalMessage: errorMessage,
					errorCode: errorName
				};
			}
		}
	}
}

// CONTINUE with existing string-based error detection below...
```

**Translation Keys Required** (add to `locales/{lang}/dashboard/contracts.json`):

```json
{
	"errors": {
		"only_tasker": "Only the tasker can perform this action",
		"only_taskee": "Only the taskee can perform this action",
		"only_parties": "Only contract participants can perform this action",
		"only_tasker_accept": "Only the tasker can accept completed work",
		"only_tasker_resolve": "Only the tasker can resolve disputes",
		"amount_zero": "Amount must be greater than zero",
		"invalid_fee_tier": "Invalid fee tier selected",
		"invalid_payment_id": "Invalid payment contract ID",
		"invalid_taskee": "Invalid taskee address",
		"invalid_times": "Invalid start or completion time",
		"start_too_far": "Start time is too far in the future",
		"completion_too_far": "Completion time is too far in the future",
		"already_accepted": "Work has already been accepted",
		"cannot_cancel": "Cannot cancel contract at this time",
		"cannot_dispute": "Cannot dispute at this time",
		"noshow_before_start": "Cannot mark no-show before start time",
		"task_not_completed": "Task must be completed first",
		"before_start": "Cannot perform action before start time",
		"not_in_dispute": "Contract is not in dispute",
		"wait_for_other": "Must wait for other party to respond",
		"noshow_already_marked": "No-show has already been marked",
		"noshow_grace_not_expired": "Grace period for no-show has not expired",
		"noshow_not_marked": "No-show has not been marked",
		"noshow_response_expired": "Response period for no-show has expired",
		"no_upfront_deposit": "No upfront deposit was set",
		"upfront_already_released": "Upfront deposit has already been released",
		"upfront_grace_not_expired": "Grace period for deposit claim has not expired",
		"cancellation_exceeds": "Cancellation fee exceeds contract amount",
		"insufficient_for_upfront": "Insufficient funds for upfront deposit and fees",
		"taskee_exceeds": "Taskee amount exceeds contract amount",
		"proposal_limit": "Maximum number of proposals reached",
		"platform_transfer_failed": "Platform fee transfer failed",
		"taskee_transfer_failed": "Payment to taskee failed",
		"tasker_refund_failed": "Refund to tasker failed",
		"invalid_deposits": "Invalid deposit amounts",
		"invalid_payment_amount": "Invalid contract amount",
		"cannot_accept_own_proposal": "Cannot accept your own proposal"
	}
}
```

**Note**: Existing error handler already uses correct pattern with `const _ = get(t)` and then `_('...')` for translations.

### 3.4 Nostr Contract Changes

**File**: `src/lib/utils/escrow/v2/nostrContract.ts`

**Key Changes:**

#### 3.4.1 Version Tag Publishing

```typescript
// When publishing contract events, use version tag
export async function publishContractEvent(params: CreateContractParams): Promise<void> {
	try {
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const network = import.meta.env.VITE_RSK_NETWORK;
		const contractAddress =
			network === 'mainnet'
				? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
				: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

		const contractData: NostrContract = {
			escrowId: params.escrowId,
			taskId: params.taskId,
			taskTitle: params.taskTitle,
			taskDescription: params.taskDescription,
			freelancerPubkey: params.freelancerPubkey,
			clientPubkey,
			amount: params.amount,
			currency: 'RBTC',
			status: EscrowStatus.Funded,
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash,
			type: 'contract',
			contractAddress,

			// V2-specific fields
			cancellationFee: params.cancellationFee,
			upfrontDeposit: params.upfrontDeposit
		};

		const contractMessage = JSON.stringify(contractData);

		// VERSION TAG: v2
		const tags = TAG_PATTERNS.contract(
			params.escrowId,
			params.taskId,
			params.freelancerPubkey,
			clientPubkey,
			network,
			'v2' // Version identifier
		);

		await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
	} catch (error) {
		console.warn('Error creating contract:', error);
	}
}
```

#### 3.4.2 StateTransition Event Handling

```typescript
// Add StateTransition event parsing for v2
export async function handleContractEvent(event: NostrEvent) {
	// ... existing logic
	// For v2 contracts, also handle StateTransition events if monitoring blockchain
	// This is SUPPLEMENTARY to Nostr status events, not a replacement
}

// Note: StateTransition events are blockchain events, not Nostr events
// They are parsed from transaction receipts, not from Nostr subscriptions
```

### 3.5 Type Definition Updates

**File**: `src/lib/types/wallet.d.ts`

```typescript
export interface EscrowData {
	id: string;
	client: string;
	freelancer: string;
	baseAmount: string;
	clientFee: string;
	freelancerFee: string;
	totalAmount: string;
	status: EscrowStatus;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	completionTime: number;
	timelockExpiry: number;
	clientFeeTier: FeeTier;
	freelancerFeeTier: FeeTier;
	createdAt: number;
	lastUpdated: number;

	// V2-specific fields (optional for backward compatibility)
	noShowMarked?: boolean;
	upfrontDeposit?: string;
	cancellationFee?: string;
}
```

**File**: `src/lib/types/contract.d.ts`

```typescript
export interface NostrContract {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	clientPubkey: string;
	amount: string;
	currency: string;
	status: EscrowStatus;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	type: 'contract';
	transactionHash?: string;
	contractAddress?: string;

	// V2-specific fields
	cancellationFee?: string;
	upfrontDeposit?: string;
}

export interface ContractPermissions {
	canComplete: boolean;
	canAccept: boolean;
	canDispute: boolean;
	canPropose: boolean;
	canAcceptProposal: boolean;
	canCancel: boolean;
	canResolveTimelock: boolean;
	canDelete: boolean;

	// V2-only permissions
	canMarkNoShow?: boolean;
	canClaimNoShowRefund?: boolean;
	canMarkWorkInProgress?: boolean;
	canClaimUpfrontDeposit?: boolean;
}
```

---

## 4. Version Abstraction Architecture

**VERIFIED**: Global abstraction already exists in `src/lib/utils/escrow/index.ts`.

### 4.1 Existing EscrowManager (DO NOT REPLACE)

**Current Implementation** - `EscrowManager` class with static imports:

**Location**: `src/lib/utils/escrow/index.ts`

```typescript
class EscrowManager {
    // Modular operation handlers
    readonly escrowOps = { ... };    // Contract operations
    readonly bidOps = { ... };       // Bid acceptance operations
    readonly contractOps = { ... };  // Nostr contract operations
    readonly eventOps = { ... };     // Event handling operations

    // Version detection from Nostr tags
    getVersionFromContract(contract: ContractWithEvents): string {
        const versionTag = contract.contractEvent.tags.find(tag => tag[0] === 'v');
        return versionTag?.[1] || 'v1'; // Default to v1
    }

    // Internal handler routing
    private getHandler(version: string): IVersionHandler {
        return VERSION_HANDLERS[version] || VERSION_HANDLERS[LATEST_ESCROW_VERSION];
    }
}

export const escrow = new EscrowManager();
```

**Key Design Principles:**

- **Static imports**: All versions loaded at startup (no dynamic imports)
- **Version registry**: `VERSION_HANDLERS` object for version mapping
- **Capability-based API**: UI asks "can I do this?" not "what version?"
- **Forward compatible**: Unknown versions default to LATEST
- **Modular access patterns**: Operations grouped by domain

### 4.2 Version Detection (ALREADY IMPLEMENTED)

**Current System** - version comes from Nostr tags ONLY:

```typescript
// Reading version from Nostr event tags
const versionTag = event.tags.find((tag) => tag[0] === 'v');
const version = versionTag?.[1] || 'v1'; // Default to v1 if missing
```

**This system already exists in EscrowManager. DO NOT replace it.**

### 4.3 Integration with EscrowManager

**Adding v2 Support:**

**Step 1**: Import v2 module in `src/lib/utils/escrow/index.ts`:

```typescript
import * as v1 from './v1';
import * as v2 from './v2'; // ADD THIS

const VERSION_HANDLERS: Record<string, IVersionHandler> = {
	v1: v1,
	v2: v2 // ADD THIS
};

export const LATEST_ESCROW_VERSION: EscrowVersion = 'v2'; // UPDATE THIS
```

**Step 2**: No other changes needed. EscrowManager automatically routes to correct version.

**Usage Pattern (NO CHANGES REQUIRED):**

```typescript
// In UI/components
import { escrow } from '$lib/utils/escrow';

// Create escrow (always uses LATEST version)
await escrow.escrowOps.createEscrow(...);

// Accept task (version-aware from contract)
await escrow.escrowOps.acceptTask(contract);

// Load details (version-aware from contract)
await escrow.escrowOps.loadEscrowDetails(contract);

// V2-specific features (capability checked automatically)
if (contract.permissions.canMarkNoShow) {
    await escrow.escrowOps.markNoShow(contract);
}
```

### 4.4 contract.store Integration

**VERIFIED**: `contract.store.ts` uses `escrow.contractOps.getContracts()`.

**Current Implementation:**

```typescript
// contract.store.ts
async loadContracts() {
    const loadedContracts = await escrow.contractOps.getContracts({
        limit: CONTRACTS_LIMIT
    });
    // ... rest of logic
}
```

**Version extraction happens inside EscrowManager.getContracts():**

- Fetches all contracts from Nostr
- For each contract, extracts version from tags
- Routes to correct version handler
- Returns unified `ContractWithEvents[]`

**No changes needed in contract.store.ts for v2 support.**

### 4.5 contract.store Verification

**VERIFIED**: `contract.store.ts` delegates ALL contract operations to EscrowManager.

**Current Implementation:**

```typescript
// contract.store.ts line 203
const loadedContracts = await escrow.contractOps.getContracts({ limit: CONTRACTS_LIMIT });
```

**Version handling happens INSIDE `escrow.contractOps.getContracts()`:**

- Version extraction from Nostr tags
- Routing to correct version handler
- Data loading per version
- Permission calculation per version
- Returns unified `ContractWithEvents[]`

**ContractWithEvents interface already includes version:**

```typescript
export interface ContractWithEvents {
	contractEvent: ContractEvent;
	statusEvents: ContractStatusEvent[];
	isClient: boolean;
	blockchainStatus: EscrowStatus | null;
	escrowData: EscrowData;
	status: EscrowStatus;
	isPending: boolean;
	permissions: ContractPermissions;
	disputeProposal: DisputeProposal | null;
	completionAttachments: Attachment[] | null;
	version: string; // ALREADY EXISTS (populated by EscrowManager)
}
```

**No changes needed in contract.store.ts.**

**Version Resolution Flow:**

1. `contract.store` calls `escrow.contractOps.getContracts()`
2. `EscrowManager.contractOps.getContracts()` calls handler's `nostrContract.getContracts()`
3. For each Nostr event:
   - Extract version tag: `['v', 'v2']`
   - Route to correct version handler
   - Load blockchain data using versioned ABI
   - Calculate permissions with version context
4. Return `ContractWithEvents[]` with version field populated

### 4.4 Permission System Extension

**File**: `src/lib/utils/helpers/contractPermissions.ts`

**Add version-aware permission calculation:**

```typescript
export function determineContractState(
	blockchainStatus: EscrowStatus | null,
	statusEvents: ContractStatusEvent[],
	contractData: NostrContract,
	escrowData: EscrowData | null,
	disputeProposal: DisputeProposal | null,
	isPending: boolean,
	isClient: boolean,
	isFreelancer: boolean,
	version: string // Version from Nostr tag
): { status: EscrowStatus; permissions: ContractPermissions } {
	// Existing permission logic...

	const permissions: ContractPermissions = {
		canComplete: isFreelancer && blockchainStatus === EscrowStatus.Funded,
		canAccept: isClient && blockchainStatus === EscrowStatus.Completed,
		// ... existing permissions

		// Version-specific permissions (only for v2+)
		canMarkNoShow: version !== 'v1' && isClient && checkNoShowTiming(escrowData),
		canClaimNoShowRefund: version !== 'v1' && checkNoShowRefund(escrowData),
		canMarkWorkInProgress: version !== 'v1' && isFreelancer && checkWorkStartTiming(escrowData),
		canClaimUpfrontDeposit: version !== 'v1' && checkUpfrontDepositClaim(escrowData)
	};

	return { status, permissions };
}

// Helper functions for v2-specific checks
function checkNoShowTiming(escrowData: EscrowData | null): boolean {
	if (!escrowData) return false;
	const now = Math.floor(Date.now() / 1000);
	return now > escrowData.estimatedStartTime && !escrowData.noShowMarked;
}

function checkNoShowRefund(escrowData: EscrowData | null): boolean {
	if (!escrowData) return false;
	return escrowData.noShowMarked === true && escrowData.status === EscrowStatus.NoShow;
}

function checkWorkStartTiming(escrowData: EscrowData | null): boolean {
	if (!escrowData) return false;
	const now = Math.floor(Date.now() / 1000);
	return now >= escrowData.estimatedStartTime && escrowData.status === EscrowStatus.Funded;
}

function checkUpfrontDepositClaim(escrowData: EscrowData | null): boolean {
	if (!escrowData || !escrowData.upfrontDeposit) return false;
	return parseFloat(escrowData.upfrontDeposit) > 0;
}
```

---

## 5. UI Integration

### 5.1 Conditional Feature Rendering

**Pattern**: Check permissions, not version directly.

```svelte
<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';

	let contract = $state<ContractWithEvents>();
</script>

<!-- Permissions control visibility, not version checks -->
{#if contract.permissions.canMarkNoShow}
	<button onclick={() => handleMarkNoShow()}> Mark No-Show </button>
{/if}

{#if contract.permissions.canClaimUpfrontDeposit}
	<button onclick={() => handleClaimDeposit()}> Claim Upfront Deposit </button>
{/if}

{#if contract.permissions.canMarkWorkInProgress}
	<button onclick={() => handleStartWork()}> Start Work </button>
{/if}
```

### 5.2 Action Handlers

```typescript
async function handleMarkNoShow() {
	if (!contract) return;

	try {
		// Dynamic module loading
		const { escrow } = await import(`$lib/utils/escrow/${contract.version}`);

		const result = await escrow.markNoShow(
			contract.contractEvent.content.escrowId,
			contract.contractEvent.id
		);

		if (result.status === 'pending') {
			appStore.showInfoToast('Marking no-show...');
		}
	} catch (error) {
		appStore.showErrorToast('Failed to mark no-show');
	}
}
```

### 5.3 Status Display

**Update status formatter to handle new statuses:**

```typescript
// statusFormatter.ts
export function getStatusDisplay(status: EscrowStatus): {
	label: string;
	color: string;
	icon: string;
} {
	const statusMap: Record<EscrowStatus, { label: string; color: string; icon: string }> = {
		[EscrowStatus.Funded]: { label: 'Funded', color: 'info', icon: 'wallet' },
		[EscrowStatus.WorkInProgress]: { label: 'In Progress', color: 'warning', icon: 'clock' },
		[EscrowStatus.NoShow]: { label: 'No Show', color: 'error', icon: 'user-x' },
		[EscrowStatus.Refunded]: { label: 'Refunded', color: 'neutral', icon: 'arrow-left' },
		[EscrowStatus.FundsReleased]: { label: 'Completed', color: 'success', icon: 'check' },
		[EscrowStatus.FundsClaimed]: { label: 'Claimed', color: 'success', icon: 'check-circle' },
		// ... existing statuses

		// Pending statuses
		[EscrowStatus.PendingMarkNoShow]: {
			label: 'Marking No Show...',
			color: 'warning',
			icon: 'clock'
		},
		[EscrowStatus.PendingMarkWorkInProgress]: {
			label: 'Starting Work...',
			color: 'info',
			icon: 'clock'
		},
		[EscrowStatus.PendingClaimUpfrontDeposit]: {
			label: 'Claiming Deposit...',
			color: 'info',
			icon: 'clock'
		}
		// ... other pending statuses
	};

	return statusMap[status] || { label: 'Unknown', color: 'neutral', icon: 'question' };
}
```

---

## 6. Implementation Checklist (Detailed)

_Use this section for step-by-step tracking. Mark `[ ]` → `[x]` as you complete each item. The [Implementation Progress](#implementation-progress-master-checklist) table above gives a high-level overview._

### Phase 1: Core Module Setup

- [x] Create `src/lib/utils/escrow/v2/` directory structure
- [x] Copy v1 files as base: `escrow.ts`, `escrowBid.ts`, `escrowEvents.ts`, `nostrContract.ts`, `index.ts`
- [x] Update `escrow.enum.ts` with correct v2 states (0-10 blockchain, 100+ Nostr)
- [x] Add `mapBlockchainStateToEnum()` helper function
- [x] v2 `abi.json` exists at `src/lib/utils/escrow/v2/abi.json`

### Phase 2: Gasless / Relay Integration (v2)

- [x] Create relay client or `submitEscrowWrite` module (see `docs/escrow/v2/gasless-frontend-integration.md`)
- [x] Implement meta-tx building: encode `data`, sign EIP-191 over `keccak256(solidityPacked(sender, contract, keccak256(data), chainId))`
- [x] Implement `POST /relay` with retries on 5xx/timeout; fall back to direct on failure
- [x] Implement receipt polling for relay-returned txHash
- [x] Wire `submitEscrowWrite` into each v2 write function:
  - [x] `completeTask`
  - [x] `acceptTask`
  - [x] `cancelPaymentContract` (cancelEscrow)
  - [x] `disputeTask`
  - [x] `proposeResolution`
  - [x] `acceptProposal`
  - [x] `resolveAfterTimelock`
  - [ ] `refundTasker` (not yet exported from v2 escrow)
  - [x] `markNoShow`
  - [x] `markWorkInProgress`
  - [x] `claimNoShowRefund`
  - [x] `claimUpfrontDeposit`
- [x] Keep `createPaymentContract` always direct (payable)
- [x] Configure `VITE_RELAY_URL` per environment (added to .env.example)

### Phase 3: Core Function Adaptations

- [ ] Add `validatePaymentId()` utility function
- [ ] Update `createEscrow()` internal function (keep internal name):
  - [ ] Add `cancellationFee` and `upfrontDeposit` optional parameters
  - [ ] Change ABI call from `createEscrow()` to `createPaymentContract()`
  - [ ] Update event parsing for `PaymentContractCreated` (NOT `EscrowCreated`)
  - [ ] Add `getPaymentContract()` call to fetch full data after event
- [ ] Update `loadEscrowDetails()` internal function (keep internal name):
  - [ ] Add ID validation call
  - [ ] Change ABI call from `getEscrow()` to `getPaymentContract()`
  - [ ] Update struct field mapping: `client` → `tasker`, `freelancer` → `taskee`
  - [ ] Handle `uint72` amount (not `uint256`)
  - [ ] Add `noShowMarked` field handling
- [ ] Update `cancelEscrow()` internal function (keep internal name):
  - [ ] Change ABI call from `cancelEscrow()` to `cancelPaymentContract()`
- [ ] Add ID validation to all write functions

### Phase 4: New v2 Features

- [ ] Implement `markNoShow()` function
- [ ] Implement `claimNoShowRefund()` function
- [ ] Implement `markWorkInProgress()` function
- [ ] Implement `claimUpfrontDeposit()` function
- [ ] Update `getDisputeProposal()` to return null (v2 doesn't support)

### Phase 5: Error Handling

- [ ] **VERIFIED**: Error handler exists at `src/lib/utils/wallet/contractErrorHandler.ts`
- [ ] **VERIFIED**: Already uses `const _ = get(t)` and `_('...')` pattern
- [ ] Add v2 custom error detection logic to `extractContractError()`
- [ ] Add custom error name mapping (35+ v2 errors) with i18n keys
- [ ] Add translation keys to `locales/{lang}/dashboard/contracts.json`
- [ ] Test error parsing for both v1 strings and v2 custom errors

### Phase 6: Nostr Integration

Implement this phase incrementally. Do **not** try to land the whole Nostr architecture rewrite in one pass.

#### Phase 6A: Event Model Foundations

- [ ] Adopt the architecture in `docs/escrow/v2/nostr-event-architecture.md`
- [x] **VERIFIED**: Keep task events addressable by stable `d` tag and always update tasks by stable task id
- [x] Update `publishContractEvent()` to use `v2` version tag and treat `paymentId` / `escrowId` as the canonical contract identity
- [x] Add `cancellationFee` and `upfrontDeposit` to Nostr contract data
- [x] Keep contract root event keyed by `d = paymentId`, but publish it only when `paymentId` is known (after creation confirmation)

#### Phase 6B: Submit-Time Nostr Publishing

- [x] Update contract status events to treat `r = paymentId` as the primary lifecycle join key and `e = contractEventId` as secondary linkage
- [x] Update status event publishing for new pending states (108-111)
- [x] Move task status updates from confirm-time callbacks to submit-time (immediately after `txHash` is available)
- [ ] Apply submit-time task updates for the main lifecycle actions:
  - [x] `createPaymentContract` -> task `IN_PROGRESS`
  - [x] `acceptTask` -> task `COMPLETED`
  - [x] `disputeTask` -> task `DISPUTED`
  - [x] `proposeResolution` -> task `DISPUTE_PROPOSAL`
  - [x] `acceptProposal` / `resolveAfterTimelock` -> task `COMPLETED` when applicable

#### Phase 6C: Querying and Loading

- [ ] Query root contract by `#d = paymentId`
- [ ] Query contract status history by `#r = paymentId`
- [ ] Keep `#e = contractEventId` as a secondary link / follow-up convenience
- [ ] Verify `StateTransition` event handling (if needed)

#### Phase 6D: Reliability and Recovery

- [ ] Add a persistent tx sync queue keyed by `txHash` so Nostr task/contract updates survive app close or disconnect
- [ ] Track per-tx sync state:
  - [ ] task event updated
  - [ ] pending contract status published
  - [ ] confirmed contract status published
  - [ ] root contract event published (creation only)
- [ ] Add startup / load reconciliation for submitted txs that may have missed Nostr updates
- [ ] Reconcile task state when blockchain already advanced but Nostr updates were missed

### Phase 7: Type Updates

- [ ] Execute the plan in `docs/escrow/v2/status-typing-refactor-plan.md`
- [x] Normalize shared status types so cross-version models do not assume v1-only `EscrowStatus`
- [x] Remove hidden v1 status assumptions from shared helpers
- [x] Split contract state resolution into explicit v1 / v2 paths
- [ ] Clean up shared escrow barrel exports so status imports are version-aware
- [ ] Add v2-specific fields to `EscrowData` interface (optional fields)
- [ ] Add v2 fields to `NostrContract` interface
- [ ] Add v2 permissions to `ContractPermissions` interface
- [ ] **VERIFIED**: `ContractWithEvents.version` field already exists

### Phase 8: Store Integration

- [ ] **VERIFIED**: `contract.store.ts` uses `escrow.contractOps.getContracts()`
- [ ] **VERIFIED**: Version handling delegated to EscrowManager
- [ ] **VERIFIED**: `ContractWithEvents.version` field already exists
- [ ] Register v2 in EscrowManager's `VERSION_HANDLERS`
- [ ] Update `LATEST_ESCROW_VERSION` to 'v2'
- [ ] Test multi-version contract loading

### Phase 9: Permission System

- [ ] Add version parameter to `determineContractState()`
- [ ] Implement v2-specific permission checks:
  - [ ] `canMarkNoShow`
  - [ ] `canClaimNoShowRefund`
  - [ ] `canMarkWorkInProgress`
  - [ ] `canClaimUpfrontDeposit`
- [ ] Add timing helper functions for v2 permissions

### Phase 10: UI Integration

- [ ] Add action handlers for v2 features with dynamic imports
- [ ] Update status display formatter with v2 states
- [ ] Add conditional rendering based on permissions (not version)
- [ ] Test all v2 action buttons

### Phase 11: Testing

- [ ] Unit tests:
  - [ ] ID validation (`validatePaymentId`)
  - [ ] Error parsing (v2 custom errors)
  - [ ] v2 functions (create, load, write operations)
- [ ] Integration tests:
  - [ ] Version detection / EscrowManager routing
  - [ ] Permission system
- [ ] Fork tests (blockchain):
  - [ ] v2 lifecycle (create → complete → accept)
  - [ ] No-show flow
  - [ ] Upfront deposit flow
- [ ] Gasless tests (see `docs/escrow/v2/tests-implementation-plan.md` §B.5):
  - [ ] Relay path success
  - [ ] Fallback to direct on relay failure
  - [ ] createPaymentContract never uses relay
- [ ] Nostr architecture tests (see `docs/escrow/v2/nostr-event-architecture.md`):
  - [ ] Task status updates are published immediately after tx submission (`txHash` available)
  - [ ] Contract pending status is published at tx submission and confirmed status at receipt
  - [ ] Root contract event is published only after `paymentId` is known
  - [ ] Pending tx sync queue recovers after app reload / disconnect
  - [ ] Reconciliation fixes missed Nostr updates when blockchain already advanced

### Phase 12: Environment Configuration

- [ ] Set/verify environment variables:
  - [ ] `VITE_RSK_CONTRACT_ADDRESS_TESTNET` (v2 contract on Rootstock Testnet)
  - [ ] `VITE_RSK_CONTRACT_ADDRESS_MAINNET` (v2 contract on Rootstock Mainnet)
  - [ ] `VITE_RELAY_URL` — testnet: `https://tx-relay.testnet.bittasker.com`, mainnet: `https://tx-relay.bittasker.com`
- [ ] Verify v1 addresses still accessible if needed (for historical contracts)

### Phase 13: Final Verification

- [ ] Test v1 contracts still work (no regression)
- [ ] Test v2 contracts work with all new features
- [ ] Test mixed v1/v2 contracts in same view
- [ ] Verify version detection from Nostr tags
- [ ] Verify permissions work correctly per version
- [ ] Test error handling for both versions
- [ ] Performance testing with dynamic imports

---

## 7. Critical Constraints Summary

### 7.1 What NOT to Do

❌ **Do NOT rename internal functions to match ABI**

- Keep `createEscrow()`, `loadEscrowDetails()`, `cancelEscrow()` etc.
- Only change ABI call inside: `contract.createPaymentContract()`, `contract.getPaymentContract()`

❌ **Do NOT hardcode version checks**

- No `if (version === 'v1')` branching
- EscrowManager handles version routing automatically

❌ **Do NOT detect version from contract address**

- Version ONLY from Nostr event tags: `['v', 'v2']`
- Default to 'v1' if tag missing

❌ **Do NOT add deployment logic**

- This is frontend-only integration
- No trusted forwarder code
- No contract deployment scripts

❌ **Do NOT create phased rollout timeline**

- Implement everything at once
- No Week 1/Week 2 structure

❌ **Do NOT duplicate existing abstractions**

- EscrowManager already exists - extend it
- contract.store already integrated - no changes needed

❌ **Do NOT modify the ABI**

- v2 ABI already exists at `src/lib/utils/escrow/v2/abi.json`
- DO NOT transform, migrate, or alter ABI structure

❌ **Do NOT use wrong event names**

- v2 creation event is `PaymentContractCreated` NOT `EscrowCreated`
- v2 does NOT emit `EscrowCreated` event

### 7.2 What TO Do

✅ **Use existing EscrowManager abstraction**

- Version routing handled automatically
- Register v2 in `VERSION_HANDLERS`
- Update `LATEST_ESCROW_VERSION` to 'v2'

✅ **Use existing version detection system**

- Read from Nostr tags: `['v', 'v2']`
- Default to 'v1' if missing

✅ **Keep internal function names stable**

- ABI changes don't affect internal API
- Only change ABI calls inside functions:
  - `contract.createPaymentContract()` (not `createEscrow`)
  - `contract.getPaymentContract()` (not `getEscrow`)
  - `contract.cancelPaymentContract()` (not `cancelEscrow`)

✅ **Update escrow.enum with correct v2 states**

- Blockchain states: 0-10
- Nostr states: 100+

✅ **Add version-aware permissions**

- Permissions calculated per version
- V2-only permissions: `canMarkNoShow`, `canClaimUpfrontDeposit`, etc.

✅ **Handle error parsing for both patterns**

- v2 custom errors (decode from error.data)
- v1 string reverts (existing pattern)
- Use `$t(...)` from i18n for all messages

✅ **Use correct event name**

- v2 creation event: `PaymentContractCreated`
- Call `getPaymentContract()` after event to fetch full data

✅ **Support simultaneous multi-version contracts**

- All modules loaded via EscrowManager
- Store version with contract data
- No regression of v1 functionality

✅ **Default to gasless for v2 non-payable writes**

- Use relay first; fall back to direct on failure
- See `docs/escrow/v2/gasless-frontend-integration.md` for relay API and meta-tx building
- `createPaymentContract` always direct (payable)

---

## 8. Related Documents

- **`abi.json`** — `src/lib/utils/escrow/v2/abi.json` (definitive ABI; includes `executeMetaTransaction`, `GAS_REIMBURSEMENT_PER_OP`, gasless-related errors)
- **`docs/escrow/v2/gasless-frontend-integration.md`** — Relay API, meta-tx building, gasless-default flow
- **`docs/escrow/v2/nostr-event-architecture.md`** — Proposed v2 Nostr model: canonical ids, submit-time task updates, recovery, reconciliation
- **`docs/gasless-integration-research-report.md`** — Current transaction flow, Nostr integration, relay plug-in points

---

## 9. Conclusion

This integration strategy provides a precise, forward-compatible approach to supporting Escrow Contract v2 while maintaining full v1 compatibility. The key principles are:

1. **Version abstraction**: EscrowManager handles routing, no hardcoded branching
2. **API stability**: Internal function names unchanged despite ABI differences
3. **Single source of truth**: Version detection via Nostr tags only
4. **Minimal changes**: Extend existing EscrowManager, don't replace
5. **Frontend focus**: No deployment logic, pure integration strategy
6. **Simultaneous support**: All versions loadable and functional via VERSION_HANDLERS

**Implementation Scope:**

- Core module adaptations (~500 lines modified)
- New v2 features (~400 lines new)
- Error handling extensions (~150 lines)
- EscrowManager registration (~5 lines)
- Type updates (~50 lines)
- Test coverage (~800 lines new)
- **Total**: ~1905 lines of code changes

**Key Success Factors:**

- Leverage existing EscrowManager architecture
- Strict adherence to version abstraction principles
- No regression of v1 functionality
- Comprehensive test coverage
- Clean error handling for both versions with i18n
- Correct event name usage (`PaymentContractCreated`)

**Verified Constraints:**

- ✅ ABI exists at `src/lib/utils/escrow/v2/abi.json` - includes `executeMetaTransaction`, gasless-related constants/errors; no ERC2771 TrustedForwarder
- ✅ Error handler already exists - extend with v2 errors
- ✅ EscrowManager already exists - register v2 handler
- ✅ contract.store already integrated - no changes needed
- ✅ Version detection already implemented - reuse pattern

**Risk Level**: LOW

- Well-defined scope
- Clear architectural patterns already in place
- Existing version system fully leveraged
- No deployment dependencies
- Minimal surface area for changes
- Comprehensive testing strategy

**Recommendation**: PROCEED with implementation following this strategy.
