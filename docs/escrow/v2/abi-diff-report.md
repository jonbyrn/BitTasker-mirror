# Escrow Contract ABI Diff Report (v1 → v2)

## 1. Summary

| Component       | v1 Count      | v2 Count    | Change                |
| --------------- | ------------- | ----------- | --------------------- |
| **Functions**   | 20            | 25          | +5 new functions      |
| **Events**      | 10            | 5           | -5 events removed     |
| **Errors**      | 5             | 51          | +46 new custom errors |
| **Constructor** | 1 (no params) | 1 (1 param) | Modified              |

**Overall Change Type**: **BREAKING** - Major interface changes with new features, removed events, and modified signatures.

---

## 2. New in v2

### 2.1 New Functions

#### **claimNoShowRefund**

```solidity
function claimNoShowRefund(uint32 escrowId) external nonpayable
```

- **Purpose**: Claim refund after no-show is marked
- **Inputs**: `escrowId` (uint32)
- **Outputs**: None
- **State Mutability**: nonpayable

#### **claimUpfrontDeposit**

```solidity
function claimUpfrontDeposit(uint32 escrowId) external nonpayable
```

- **Purpose**: Claim upfront deposit
- **Inputs**: `escrowId` (uint32)
- **Outputs**: None
- **State Mutability**: nonpayable

#### **getEscrowState**

```solidity
function getEscrowState(uint32 escrowId) external view returns (uint8 state, bool exists)
```

- **Purpose**: Get escrow state and existence flag
- **Inputs**: `escrowId` (uint32)
- **Outputs**: `state` (uint8), `exists` (bool)
- **State Mutability**: view

#### **getEstimatedCompletionTime**

```solidity
function getEstimatedCompletionTime(uint32 escrowId) external view returns (uint32)
```

- **Purpose**: Get estimated completion timestamp
- **Inputs**: `escrowId` (uint32)
- **Outputs**: `uint32` timestamp
- **State Mutability**: view

#### **getEstimatedStartTime**

```solidity
function getEstimatedStartTime(uint32 escrowId) external view returns (uint32)
```

- **Purpose**: Get estimated start timestamp
- **Inputs**: `escrowId` (uint32)
- **Outputs**: `uint32` timestamp
- **State Mutability**: view

#### **getTimelockEnd**

```solidity
function getTimelockEnd(uint32 escrowId) external view returns (uint32)
```

- **Purpose**: Get timelock end timestamp
- **Inputs**: `escrowId` (uint32)
- **Outputs**: `uint32` timestamp
- **State Mutability**: view

#### **isTrustedForwarder**

```solidity
function isTrustedForwarder(address forwarder) external view returns (bool)
```

- **Purpose**: Check if address is trusted forwarder (EIP-2771 meta-transactions)
- **Inputs**: `forwarder` (address)
- **Outputs**: `bool`
- **State Mutability**: view

#### **markNoShow**

```solidity
function markNoShow(uint32 escrowId) external nonpayable
```

- **Purpose**: Mark counterparty as no-show
- **Inputs**: `escrowId` (uint32)
- **Outputs**: None
- **State Mutability**: nonpayable

#### **markWorkInProgress**

```solidity
function markWorkInProgress(uint32 escrowId) external nonpayable
```

- **Purpose**: Mark work as actively in progress
- **Inputs**: `escrowId` (uint32)
- **Outputs**: None
- **State Mutability**: nonpayable

#### **trustedForwarder**

```solidity
function trustedForwarder() external view returns (address)
```

- **Purpose**: Get trusted forwarder address
- **Inputs**: None
- **Outputs**: `address`
- **State Mutability**: view

### 2.2 New Constants

#### **CANCELLATION_WINDOW**

```solidity
function CANCELLATION_WINDOW() external view returns (uint32)
```

- **Purpose**: Get cancellation window duration
- **State Mutability**: view

#### **DISPUTE_WINDOW**

```solidity
function DISPUTE_WINDOW() external view returns (uint32)
```

- **Purpose**: Get dispute window duration
- **State Mutability**: view

#### **GRACE_PERIOD**

```solidity
function GRACE_PERIOD() external view returns (uint32)
```

- **Purpose**: Get grace period duration
- **State Mutability**: view

#### **NO_SHOW_RESPONSE_PERIOD**

```solidity
function NO_SHOW_RESPONSE_PERIOD() external view returns (uint32)
```

- **Purpose**: Get no-show response period duration
- **State Mutability**: view

### 2.3 New Event

#### **StateTransition**

```solidity
event StateTransition(
    uint32 indexed escrowId,
    uint8 fromState,
    uint8 toState,
    uint32 timestamp
)
```

- **Purpose**: Emitted on every state change
- **Indexed Fields**: `escrowId`
- **Non-Indexed Fields**: `fromState`, `toState`, `timestamp`

### 2.4 New Custom Errors (46 total)

**Access Control Errors:**

- `AlreadyAccepted()` - Proposal already accepted
- `OnlyClient()` - Caller must be client
- `OnlyFreelancer()` - Caller must be freelancer
- `OnlyParties()` - Caller must be a party
- `OnlyClientCanAccept()` - Only client can accept
- `OnlyClientCanResolveDisputes()` - Only client can resolve disputes
- `CannotAcceptOwnProposal()` - Cannot accept own proposal

**Validation Errors:**

- `AmountMustBeGreaterThanZero()` - Amount must be > 0
- `InvalidFeeTier()` - Invalid fee tier
- `InvalidClientFeeTier()` - Invalid client fee tier
- `InvalidFreelancerFeeTier()` - Invalid freelancer fee tier
- `InvalidEscrowId()` - Invalid escrow ID
- `InvalidFreelancer()` - Invalid freelancer address
- `InvalidState()` - Invalid state for operation

**Timing Errors:**

- `CannotCancelAtThisTime()` - Cannot cancel at this time
- `CannotDisputeAtThisTime()` - Cannot dispute at this time
- `CannotMarkNoShowBeforeStart()` - Cannot mark no-show before start time
- `CompletionMustBeAfterStart()` - Completion time must be after start time
- `CompletionTimeTooFarInFuture()` - Completion time too far in future
- `DisputeWindowExpired()` - Dispute window has expired
- `EstStartNotInFuture()` - Estimated start time must be in future
- `MustBeAfterEstStartTime()` - Must be after estimated start time
- `MustWaitForOtherParty()` - Must wait for other party
- `StartTimeTooFarInFuture()` - Start time too far in future
- `TimeBeforeBase()` - Time before base time
- `TimeBeforeStart()` - Time before start time
- `TimelockNotPassed()` - Timelock not passed

**Deposit Errors:**

- `CancellationFeeExceedsBase()` - Cancellation fee exceeds base amount
- `DepositsExceedBaseAmount()` - Deposits exceed base amount
- `DepositsExceedEscrowAmount()` - Deposits exceed escrow amount
- `UpfrontDepositExceedsBase()` - Upfront deposit exceeds base amount
- `UpfrontDepositAlreadyReleased()` - Upfront deposit already released
- `UpfrontDepositGracePeriodNotExpired()` - Grace period not expired
- `NoUpfrontDeposit()` - No upfront deposit set

**No-Show Errors:**

- `NoShowAlreadyMarked()` - No-show already marked
- `NoShowGracePeriodNotExpired()` - Grace period not expired
- `NoShowNotMarked()` - No-show not marked
- `NoShowResponsePeriodExpired()` - Response period expired

**Transfer Errors:**

- `ClientRefundTransferFailed()` - Client refund transfer failed
- `FreelancerTransferFailed()` - Freelancer transfer failed
- `PlatformFeeTransferFailed()` - Platform fee transfer failed
- `TaskeePayoutTransferFailed()` - Taskee payout transfer failed
- `TaskerRefundTransferFailed()` - Tasker refund transfer failed

**Other Errors:**

- `CannotEscrowWithContract()` - Cannot escrow with contract address
- `CannotEscrowWithSelf()` - Cannot escrow with self
- `FreelancerAmountExceedsEscrow()` - Freelancer amount exceeds escrow
- `NotInDispute()` - Not in dispute state
- `OwnershipRenunciationDisabled()` - Ownership renunciation disabled
- `OwnershipTransferDisabled()` - Ownership transfer disabled
- `ProposalLimitReached()` - Proposal limit reached
- `TaskNotCompleted()` - Task not completed

---

## 3. Removed from v1

### 3.1 Removed Functions

#### **escrows** (public state variable accessor)

```solidity
function escrows(uint256) external view returns (
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
```

- **Replacement**: Use `getEscrow(uint32)` instead
- **Impact**: Breaking - clients must update to new getter

#### **getCompletionTimestamp**

```solidity
function getCompletionTimestamp(uint256 escrowId) external view returns (uint32)
```

- **Replacement**: Use `getEstimatedCompletionTime(uint32)` instead
- **Impact**: Breaking - function renamed

#### **getDisputeProposal**

```solidity
function getDisputeProposal(uint256 escrowId) external view returns (
    address proposer,
    uint256 freelancerAmount,
    uint256 timestamp,
    bool accepted
)
```

- **Replacement**: None - feature removed or internalized
- **Impact**: Breaking - no direct replacement

#### **getDisputeTimestamp**

```solidity
function getDisputeTimestamp(uint256 escrowId) external view returns (uint32)
```

- **Replacement**: None - removed
- **Impact**: Breaking - no direct replacement

### 3.2 Removed Events

#### **DisputeProposed**

```solidity
event DisputeProposed(
    uint256 indexed escrowId,
    address indexed proposer,
    uint256 freelancerAmount
)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking - clients must adapt to new event pattern

#### **DisputeResolved**

```solidity
event DisputeResolved(
    uint256 indexed escrowId,
    uint256 clientAmount,
    uint256 freelancerAmount
)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking - loss of amount details in event

#### **EscrowCancelled**

```solidity
event EscrowCancelled(
    uint256 indexed escrowId,
    uint256 clientAmount,
    uint256 freelancerAmount
)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking - loss of amount details in event

#### **EscrowResolved**

```solidity
event EscrowResolved(
    uint256 indexed escrowId,
    uint256 freelancerAmount,
    uint256 platformFee
)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking - loss of amount details in event

#### **TaskAccepted**

```solidity
event TaskAccepted(uint256 indexed escrowId)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking

#### **TaskCompleted**

```solidity
event TaskCompleted(uint256 indexed escrowId)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking

#### **TaskDisputed**

```solidity
event TaskDisputed(
    uint256 indexed escrowId,
    address indexed disputer
)
```

- **Replacement**: Tracked via `StateTransition` event
- **Impact**: Breaking - loss of disputer address

---

## 4. Modified (Breaking)

### 4.1 Constructor

**v1:**

```solidity
constructor() nonpayable
```

**v2:**

```solidity
constructor(address trustedForwarder) nonpayable
```

**Changes:**

- Added `trustedForwarder` parameter for EIP-2771 meta-transaction support
- **Impact**: BREAKING - deployment scripts must provide forwarder address

### 4.2 Function: createEscrow

**v1:**

```solidity
function createEscrow(
    address freelancer,
    uint32 estimatedStartTime,
    uint32 estimatedCompletionTime,
    uint8 clientFeeTier,
    uint8 freelancerFeeTier
) external payable returns (uint256)
```

**v2:**

```solidity
function createEscrow(
    address freelancer,
    uint32 estimatedStartTime,
    uint32 estimatedCompletionTime,
    uint8 clientFeeTier,
    uint8 freelancerFeeTier,
    uint72 cancellationFee,
    uint72 upfrontDeposit
) external payable returns (uint32)
```

**Changes:**

- Added `cancellationFee` parameter (uint72)
- Added `upfrontDeposit` parameter (uint72)
- **Return type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - clients must provide new parameters and handle uint32 return

### 4.3 Function: acceptProposal

**v1:**

```solidity
function acceptProposal(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function acceptProposal(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.4 Function: acceptTask

**v1:**

```solidity
function acceptTask(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function acceptTask(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.5 Function: cancelEscrow

**v1:**

```solidity
function cancelEscrow(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function cancelEscrow(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.6 Function: completeTask

**v1:**

```solidity
function completeTask(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function completeTask(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.7 Function: disputeTask

**v1:**

```solidity
function disputeTask(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function disputeTask(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.8 Function: proposeResolution

**v1:**

```solidity
function proposeResolution(
    uint256 escrowId,
    uint256 freelancerAmount
) external nonpayable
```

**v2:**

```solidity
function proposeResolution(
    uint32 escrowId,
    uint72 freelancerAmount
) external nonpayable
```

**Changes:**

- **Input types changed**: `uint256` → `uint32` (escrowId), `uint256` → `uint72` (freelancerAmount)
- **Impact**: BREAKING - type mismatch

### 4.9 Function: resolveAfterTimelock

**v1:**

```solidity
function resolveAfterTimelock(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function resolveAfterTimelock(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.10 Function: getEscrow

**v1:**

```solidity
function getEscrow(uint256 escrowId) external view returns (
    struct EscrowContract.Escrow {
        address client;
        address freelancer;
        uint256 amount;
        uint32 estimatedStartTime;
        uint32 estimatedCompletionTime;
        uint32 timelockEnd;
        uint32 createdAt;
        uint8 clientFeeTier;
        uint8 freelancerFeeTier;
        uint8 state;
        uint8 reserved;
    }
)
```

**v2:**

```solidity
function getEscrow(uint32 escrowId) external view returns (
    struct EscrowContract.EscrowLegacy {
        address client;
        uint72 amount;
        uint8 state;
        uint8 clientFeeTier;
        uint8 freelancerFeeTier;
        address freelancer;
        uint32 createdAt;
        uint32 estimatedStartTime;
        uint32 estimatedCompletionTime;
        uint32 timelockEnd;
        bool noShowMarked;
    }
)
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Struct name changed**: `Escrow` → `EscrowLegacy`
- **Field reordering**: fields in different order
- **Amount type changed**: `uint256` → `uint72`
- **Removed field**: `reserved` (uint8)
- **Added field**: `noShowMarked` (bool)
- **Impact**: BREAKING - struct layout completely different

### 4.11 Function: COMPLETION_TIMELOCK

**v1:**

```solidity
function COMPLETION_TIMELOCK() external view returns (uint256)
```

**v2:**

```solidity
function COMPLETION_TIMELOCK() external view returns (uint32)
```

**Changes:**

- **Return type changed**: `uint256` → `uint32`
- **Impact**: Potentially breaking - narrower type

### 4.12 Function: DISPUTE_TIMELOCK

**v1:**

```solidity
function DISPUTE_TIMELOCK() external view returns (uint256)
```

**v2:**

```solidity
function DISPUTE_TIMELOCK() external view returns (uint32)
```

**Changes:**

- **Return type changed**: `uint256` → `uint32`
- **Impact**: Potentially breaking - narrower type

### 4.13 Function: nextEscrowId

**v1:**

```solidity
function nextEscrowId() external view returns (uint256)
```

**v2:**

```solidity
function nextEscrowId() external view returns (uint32)
```

**Changes:**

- **Return type changed**: `uint256` → `uint32`
- **Impact**: Potentially breaking - narrower type

### 4.14 Function: refundClient

**v1:**

```solidity
function refundClient(uint256 escrowId) external nonpayable
```

**v2:**

```solidity
function refundClient(uint32 escrowId) external nonpayable
```

**Changes:**

- **Input type changed**: `uint256` → `uint32`
- **Impact**: BREAKING - type mismatch

### 4.15 Event: EscrowCreated

**v1:**

```solidity
event EscrowCreated(
    uint256 indexed escrowId,
    address indexed client,
    address indexed freelancer,
    uint256 amount
)
```

**v2:**

```solidity
event EscrowCreated(
    uint32 indexed escrowId
)
```

**Changes:**

- **ID type changed**: `uint256` → `uint32`
- **Removed fields**: `client`, `freelancer`, `amount`
- **Impact**: BREAKING - major data loss in event, must query contract state

### 4.16 Function: renounceOwnership

**v1:**

```solidity
function renounceOwnership() external nonpayable
```

**v2:**

```solidity
function renounceOwnership() external pure
```

**Changes:**

- **State Mutability changed**: `nonpayable` → `pure`
- **Impact**: Function now throws/reverts (ownership renunciation disabled)

### 4.17 Function: transferOwnership

**v1:**

```solidity
function transferOwnership(address newOwner) external nonpayable
```

**v2:**

```solidity
function transferOwnership(address) external pure
```

**Changes:**

- **State Mutability changed**: `nonpayable` → `pure`
- **Parameter name removed**: `newOwner` → unnamed
- **Impact**: Function now throws/reverts (ownership transfer disabled)

---

## 5. Mutability Changes

| Function            | v1         | v2   | Impact                          |
| ------------------- | ---------- | ---- | ------------------------------- |
| `renounceOwnership` | nonpayable | pure | Function now reverts (disabled) |
| `transferOwnership` | nonpayable | pure | Function now reverts (disabled) |

---

## 6. Backward Compatibility Assessment

### 6.1 Non-Breaking Changes

**None** - All changes are breaking in some form.

### 6.2 Potentially Breaking Changes

- **Type Narrowing**: `uint256` → `uint32` for IDs and timestamps

  - **Risk**: Low if values stay within uint32 range (4.2 billion)
  - **Mitigation**: Validate values before calling

- **Constant Type Changes**: Return values narrowed from uint256 to uint32
  - **Risk**: Low - constants unlikely to exceed uint32
  - **Mitigation**: Type cast in client code

### 6.3 Definitely Breaking Changes

**Constructor:**

- New parameter required - deployment scripts break

**All Core Functions:**

- `uint256` → `uint32` parameter changes - all calls require updates

**createEscrow:**

- Two new parameters required
- Return type changed
- All existing calls will fail

**getEscrow:**

- Struct layout completely changed
- Field types changed
- Field order changed
- Parsing code breaks entirely

**Event System:**

- All task/dispute/resolution events removed
- Only `EscrowCreated` and `StateTransition` remain
- `EscrowCreated` no longer contains participant/amount data
- Event listeners must be completely rewritten

**Removed Functions:**

- `getDisputeProposal()` - no replacement
- `getDisputeTimestamp()` - no replacement
- Direct escrow mapping access removed

**Ownership Functions:**

- `renounceOwnership` and `transferOwnership` disabled (pure functions)

### 6.4 Frontend/SDK Risk Implications

**Critical Breaking Changes:**

1. **All contract calls must be updated** due to parameter type changes
2. **Event parsing completely broken** - only 2 events remain vs 10 in v1
3. **Data structures incompatible** - struct field reordering and type changes
4. **No migration path** - v1 and v2 contracts must coexist, cannot upgrade in place

**Migration Strategy Required:**

- Dual-version support in SDK/frontend
- Version detection mechanism (via contract metadata or Nostr tags)
- Separate code paths for v1 and v2 contracts
- Fallback handling for removed features (dispute proposal tracking)

**Data Model Changes:**

- Amount fields: `uint256` → `uint72` (max ~4.7 million ETH/RBTC)
- ID fields: `uint256` → `uint32` (max 4.2 billion escrows)
- Timestamp fields remain `uint32` (valid until year 2106)

---

## 7. Functional Differences (Based on ABI)

### 7.1 New Capabilities in v2

**No-Show Protection:**

- `markNoShow()` - Mark counterparty as absent
- `claimNoShowRefund()` - Claim funds after no-show
- Introduces accountability for participants who fail to engage

**Work Progress Tracking:**

- `markWorkInProgress()` - Signal active work status
- Improves transparency during task execution

**Upfront Deposit System:**

- `cancellationFee` and `upfrontDeposit` parameters in `createEscrow()`
- `claimUpfrontDeposit()` - Release deposit to freelancer
- Enables pre-funding for materials/expenses

**Enhanced Timing Constraints:**

- `CANCELLATION_WINDOW` - Time limit for cancellations
- `DISPUTE_WINDOW` - Time limit for disputes
- `GRACE_PERIOD` - Buffer time for responses
- `NO_SHOW_RESPONSE_PERIOD` - Response time for no-show claims
- More granular control over escrow lifecycle

**Granular State Queries:**

- `getEscrowState()` - State + existence check
- `getEstimatedStartTime()` - Dedicated start time getter
- `getEstimatedCompletionTime()` - Dedicated completion time getter
- `getTimelockEnd()` - Dedicated timelock getter
- Improved state inspection without fetching full struct

**Meta-Transaction Support (EIP-2771):**

- `trustedForwarder` in constructor
- `isTrustedForwarder()` - Forwarder validation
- Enables gasless transactions for users

**Unified State Tracking:**

- `StateTransition` event - Single event for all state changes
- Simplified event parsing (fewer events to handle)
- Easier to build state machines from blockchain data

### 7.2 Removed Capabilities

**Dispute Proposal Visibility:**

- `getDisputeProposal()` removed
- No longer possible to query pending proposals externally
- Must track via events or infer from state

**Dispute Timing:**

- `getDisputeTimestamp()` removed
- Timestamp tracking must be done off-chain

**Event-Based Amount Tracking:**

- Previous events (`DisputeResolved`, `EscrowCancelled`, `EscrowResolved`) contained amounts
- v2 events only contain state transitions, no amounts
- Must query contract state for amount details

**Direct State Access:**

- Public `escrows` mapping removed
- Must use `getEscrow()` function

**Ownership Transfers:**

- `renounceOwnership` and `transferOwnership` disabled
- Contract owner cannot change after deployment

### 7.3 Optimizations

**Gas Efficiency:**

- Custom errors (4 bytes) vs string reverts (expensive)
- Smaller integer types: uint72 for amounts, uint32 for IDs/timestamps
- Reduced event payload sizes (fewer indexed fields)

**Storage Optimization:**

- Tighter packing with uint72/uint32/uint8 fields
- `noShowMarked` bool added without expanding storage slot
- Field reordering for optimal packing

**Contract Size:**

- Custom errors reduce bytecode size
- Unified state event reduces event handling code

### 7.4 Security Improvements

**Better Error Handling:**

- 51 specific custom errors vs generic reverts
- Clearer failure reasons for debugging
- Reduced ambiguity in error states

**Timing Protections:**

- Grace periods prevent hasty actions
- Response periods ensure fairness
- Dispute windows prevent indefinite disputes

**No-Show Protection:**

- Financial consequences for no-shows
- Reduces time wasted on abandoned tasks

**Forwarder Validation:**

- Explicit trusted forwarder mechanism
- Prevents meta-transaction spoofing

---

## Conclusion

The v2 ABI represents a **major breaking upgrade** with:

- **Enhanced functionality**: No-show protection, upfront deposits, work progress tracking
- **Improved efficiency**: Custom errors, smaller types, optimized storage
- **Better security**: Granular timing controls, explicit error types
- **Migration challenge**: Complete incompatibility requires dual-version support

All client code, event listeners, and data models must be updated to support v2. A version detection and routing system is mandatory for supporting both v1 (existing contracts) and v2 (new contracts) simultaneously.
