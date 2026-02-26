# Behavior-Driven Test Strategy for Escrow System

## Escrow State Machine

### State Space

```
INITIAL → FUNDED → {RELEASED, CANCELLED, DISPUTED}
INITIAL → CANCELLED (before funding)
DISPUTED → {RELEASED, CANCELLED} (after resolution)
```

### Terminal States

- `RELEASED`: Funds transferred to taskee, immutable
- `CANCELLED`: Funds returned to tasker, immutable
- `DISPUTED`: Awaiting arbitration, mutable only to terminal states

### Actors

- **Tasker**: Funding authority, cancellation authority (before funding), dispute initiator
- **Taskee**: Release beneficiary, dispute responder
- **Arbiter**: Dispute resolver (external to contract, implicit in resolution)

### Core Invariants

#### I1: Single Terminal Transition

Each escrow reaches exactly one terminal state. No escrow can transition from `RELEASED` to `CANCELLED` or vice versa.

#### I2: Monotonic Funding

Funding amount cannot decrease. Either zero (unfunded) or a positive fixed amount (funded).

#### I3: Release Requires Funding

State cannot transition to `RELEASED` unless funding has occurred.

#### I4: Double-Spend Prevention

Once funds released, subsequent release operations must fail. Once funds cancelled, subsequent cancellation operations must fail.

#### I5: Version Determinism

Given identical nostr event version tag, system must route to identical contract version. No randomness, no fallback ambiguity.

#### I6: Event Ordering Independence (Eventual Consistency)

Given all events for an escrow, final state must be identical regardless of event arrival order, except for race conditions on terminal transitions (which must fail deterministically).

#### I7: Dispute State Protection

Disputed escrows cannot transition to `RELEASED` or `CANCELLED` without explicit resolution event.

#### I8: Pre-Funding Cancellation

Escrows can be cancelled before funding without constraint. Post-funding cancellation requires explicit conditions (timeout, mutual agreement, dispute resolution).

#### I9: Immutable Escrow Identity

Escrow ID + contract address + version tag form unique identity. Duplicate events for same identity must not create new escrow instances.

#### I10: Balance Conservation

Sum of all escrow balances across all versions must equal total locked on-chain. No funds appear or disappear.

---

## Test Philosophy

### Principles

#### P1: Test State, Not Methods

Tests assert escrow state transitions, not which internal function was called. A test validates "escrow is now RELEASED with correct balance" not "releaseEscrow() was invoked".

#### P2: Test Invariants, Not Implementations

Tests enforce invariants I1-I10, not specific code paths. If invariant holds, implementation details are irrelevant.

#### P3: Version Parameterization

Tests parameterize version tag as input data, not hardcoded constants. Test logic must work for v1, v2, vN without modification.

#### P4: Adversarial Inputs

Tests include malformed events, missing fields, invalid signatures, conflicting states, race conditions, replay attacks.

#### P5: Sequence Randomization

Tests validate invariants hold under arbitrary event orderings, not just happy-path sequences.

#### P6: Black-Box Escrow

Tests interact through public interface (event logs, state queries). No access to private fields, internal caches, or implementation structure.

#### P7: Observable Behavior Only

Tests assert on: state transitions, emitted events, balance changes, error conditions. Never assert on: function call counts, internal variable values, cache hits.

#### P8: Unpredictable Realism

Tests simulate: concurrent operations, network delays, partial data, reconnections, version mismatches, corrupted logs.

---

## Unit Testing Strategy

Unit tests validate atomic behavioral contracts.

### State Transition Validation

**Invariant Enforced**: I1, I3, I7

**Test Requirement**:
For each valid state transition, assert:

- Precondition state
- Trigger event
- Postcondition state
- State change callback invoked exactly once with correct parameters

For each invalid transition, assert:

- Precondition state
- Invalid trigger event
- State unchanged
- Error emitted with specific code
- No state change callback

**Adversarial Cases**:

- Attempt release on unfunded escrow (must fail, I3)
- Attempt funding on already-funded escrow (must be idempotent)
- Attempt cancellation on released escrow (must fail, I1)
- Attempt release on disputed escrow (must fail, I7)
- Attempt dispute on cancelled escrow (must fail, I1)
- Double release events (must fail on second, I4)
- Double cancellation events (must fail on second, I4)

**Version Parameterization**:
Each transition test runs with version tag as parameter:

```typescript
testTransition({ version: 'v1', from: 'INITIAL', event: 'fund', to: 'FUNDED' });
testTransition({ version: 'v2', from: 'INITIAL', event: 'fund', to: 'FUNDED' });
testTransition({ version: 'vN', from: 'INITIAL', event: 'fund', to: 'FUNDED' });
```

All must pass. No version-specific branches unless behavioral divergence documented.

### Event Parsing Correctness

**Invariant Enforced**: I5, I9

**Test Requirement**:
For each event type, assert:

- Well-formed event → structured data with all required fields
- Malformed event → error with diagnostic info
- Missing version tag → deterministic fallback or error (no randomness)
- Invalid version tag → error with specific code
- Duplicate event ID → idempotent handling (no double-processing)

**Adversarial Cases**:

- Empty event log
- Event with null fields
- Event with extra unknown fields (must ignore gracefully)
- Event with mismatched types (string amount instead of bigint)
- Event with negative amounts
- Event with zero address
- Event with future timestamp (must accept or reject deterministically)
- Event with past timestamp on already-terminated escrow (must reject)

**Unpredictable Inputs**:

- Fuzz version tags: "v99", "beta", "0x1234", null, undefined, object, array
- Fuzz escrow IDs: empty string, very long string, special chars, unicode, null
- Fuzz amounts: 0, negative, MAX_UINT256, fractional (must reject), NaN, Infinity

### Error Translation Invariants

**Invariant Enforced**: All (via error semantics)

**Test Requirement**:
For each blockchain error condition:

- Assert specific error code emitted
- Assert error message contains diagnostic info
- Assert state unchanged after error
- Assert no partial state corruption

Error codes must be stable across versions unless behavioral change documented.

**Adversarial Cases**:

- Simulate blockchain disconnect during operation
- Simulate transaction revert with various reasons
- Simulate gas exhaustion
- Simulate nonce conflict
- Simulate signature validation failure

### Enum Normalization Invariants

**Invariant Enforced**: I6 (via consistent state representation)

**Test Requirement**:
For each status enum value:

- Assert canonical form (e.g., "FUNDED" not "funded" or "Funded")
- Assert case-insensitive input normalization
- Assert unknown values rejected with error
- Assert version-specific enum extensions handled consistently

**Adversarial Cases**:

- Mixed case status strings
- Numeric status codes (if backend sends integers)
- Status values from future versions
- Typos in status strings

### Version Routing Determinism

**Invariant Enforced**: I5

**Test Requirement**:
For each version tag:

- Assert always routes to same contract interface
- Assert routing decision independent of external state
- Assert routing failure explicit and deterministic

**Adversarial Cases**:

- Missing version tag (must default or fail explicitly)
- Version tag with no registered handler (must fail explicitly)
- Concurrent initialization of multiple versions
- Version tag mutation mid-flight (must be immutable after parse)

---

## Integration Testing Strategy

Integration tests validate multi-component interactions and system-wide invariants.

### Multi-Escrow State Isolation

**Invariant Enforced**: I9, I10

**Test Requirement**:
Given N escrows active simultaneously:

- Operations on escrow A must not affect state of escrow B
- Balance changes must sum correctly across all escrows
- State callbacks must fire for correct escrow only
- No cross-escrow event leakage

**Scenario**:
Create 10 escrows, fund 5, release 3, cancel 2, dispute 1. Assert:

- Each escrow in correct independent state
- Sum of funded escrows equals total locked
- Released escrows no longer in active pool
- Cancelled escrows funds returned
- Disputed escrow balance still locked

### Mixed Version Coexistence

**Invariant Enforced**: I5, I9, I10

**Test Requirement**:
Given escrows on v1, v2, vN:

- Each escrow routed to correct version handler
- No version interference or shared mutable state
- Balance tracking correct across version boundaries
- Event streams correctly demultiplexed by version

**Scenario**:
Create 3 escrows: v1, v2, v1. Fund all. Release v1[0], cancel v2, release v1[1]. Assert:

- v1[0] released via v1 handler
- v2 cancelled via v2 handler
- v1[1] released via v1 handler
- No v1 operation routed to v2 handler

**Adversarial Cases**:

- Event with version tag not matching escrow creation version (must reject or reconcile)
- Version handler crash (must not affect other versions)
- Version upgrade mid-lifecycle (if supported, must migrate state correctly)

### Missing Nostr Version Tag

**Invariant Enforced**: I5

**Test Requirement**:
Given event log without version tag:

- System must apply deterministic default (e.g., v1) OR reject explicitly
- No random fallback behavior
- Same result every replay of identical events

**Scenario**:
Create escrow without version tag. Fund it. Release it. Assert:

- Escrow routed to documented default version
- State transitions valid for that version
- Error log contains warning about missing version

### Invalid Version Tag

**Invariant Enforced**: I5

**Test Requirement**:
Given event log with invalid version tag:

- System must reject with specific error code
- No partial escrow creation
- Subsequent valid events must not resurrect failed escrow

**Scenario**:
Create escrow with version "invalid". Assert:

- Escrow creation failed
- Error code indicates version routing failure
- No escrow instance exists in state

### Mixed Valid + Invalid Event Streams

**Invariant Enforced**: I6, I9

**Test Requirement**:
Given event stream containing:

- Valid escrow creation
- Invalid event (malformed log)
- Valid funding
- Duplicate funding event
- Invalid release (e.g., wrong signature)
- Valid release

Assert:

- Escrow processes valid events correctly
- Invalid events logged and skipped
- Final state = RELEASED with correct balance
- No state corruption from invalid events

**Adversarial Cases**:

- 50% of events invalid
- All events invalid except terminal event
- Invalid events for escrow IDs that don't exist
- Invalid events with valid structure but nonsense data

### Partial Transaction Data

**Invariant Enforced**: I3, I10

**Test Requirement**:
Given transaction log missing fields:

- Missing amount → error, no state change
- Missing from address → error, no state change
- Missing to address → error, no state change
- Missing timestamp → use current time or error

Assert:

- Escrow state unchanged on parse failure
- Error diagnostic identifies missing field

### Race-Like Scenarios

**Invariant Enforced**: I1, I4

**Test Requirement**:
Simulate concurrent terminal operations:

- Two release operations submitted simultaneously
- Two cancellation operations submitted simultaneously
- Release + cancellation operations simultaneously

Assert:

- Exactly one succeeds
- Second operation fails with specific error
- Final state deterministic (whichever won the race)
- No double-spend

**Implementation Note**:
Tests simulate race by processing events in rapid sequence, not true concurrency. Blockchain prevents true race via transaction ordering; tests validate client-side handling.

---

## E2E Testing Strategy

E2E tests validate complete user workflows through observable system behavior.

### Full Lifecycle: Create → Fund → Release

**Invariant Enforced**: All

**Flow**:

1. Create escrow (version parameterized)
2. Assert state = INITIAL
3. Fund escrow
4. Assert state = FUNDED, balance correct
5. Release escrow
6. Assert state = RELEASED, balance transferred

**Validation**:

- State transitions valid
- Events emitted in correct order
- Balances sum correctly
- No errors logged

### Cancellation Before Funding

**Invariant Enforced**: I8

**Flow**:

1. Create escrow
2. Assert state = INITIAL
3. Cancel escrow
4. Assert state = CANCELLED

**Validation**:

- No funding required for cancellation
- No balance changes
- Escrow removed from active pool

### Dispute Flow

**Invariant Enforced**: I7

**Flow**:

1. Create escrow
2. Fund escrow
3. Initiate dispute
4. Assert state = DISPUTED
5. Attempt release → must fail
6. Attempt cancellation → must fail
7. Resolve dispute (external)
8. Release or cancel based on resolution
9. Assert terminal state

**Validation**:

- Dispute blocks non-resolution operations
- Resolution deterministic
- Final state valid terminal state

### Mixed Event Arrival Order

**Invariant Enforced**: I6

**Flow**:
Given events: [Create, Fund, Release]

Test permutations:

- [Create, Fund, Release] ✓
- [Fund, Create, Release] → reject Fund (no escrow), then valid flow
- [Create, Release, Fund] → reject Release (not funded), then valid flow
- [Release, Fund, Create] → reject all until Create, then valid flow

Assert:

- Final state = RELEASED if all events eventually processed
- Invalid orderings logged as errors
- System recovers from out-of-order events

**Adversarial Cases**:

- Events arrive hours apart
- Duplicate events in random order
- Events for multiple escrows interleaved

### Reconnection / Rehydration

**Invariant Enforced**: I9, I10

**Flow**:

1. Create escrow, fund it
2. Simulate disconnect (clear in-memory state)
3. Reconnect (replay event log)
4. Assert state = FUNDED, balance correct
5. Release escrow
6. Assert state = RELEASED

**Validation**:

- State reconstructed correctly from logs
- No duplicate processing of replayed events
- Final state identical to non-disconnect scenario

### Multiple Escrows in Memory

**Invariant Enforced**: I9, I10

**Flow**:

1. Create 10 escrows
2. Fund all
3. Release 5, cancel 3, dispute 2
4. Simulate reconnection (clear state, replay all logs)
5. Assert all escrows in correct states
6. Assert balance conservation

**Validation**:

- No escrow cross-contamination
- Memory usage scales linearly
- Lookup performance acceptable

---

## Property-Based Testing

Property tests validate invariants under randomized inputs and sequences.

### Randomized State Transition Sequences

**Property**: Invariant I1 holds under arbitrary valid sequences.

**Test**:

1. Generate random valid sequence: Create → [Fund | Cancel] → [Release | Cancel | Dispute]
2. Execute sequence
3. Assert escrow in valid state
4. Assert no invalid transitions accepted
5. Repeat 1000 times with different seeds

**Validation**:

- No crashes
- All final states valid
- All intermediate states valid

### Fuzzing Version Tags

**Property**: Invariant I5 holds under arbitrary version tag inputs.

**Test**:

1. Generate random string as version tag
2. Attempt escrow creation
3. Assert either:
   - Valid version → escrow created, routed correctly
   - Invalid version → error, no escrow created
4. Repeat 10,000 times

**Validation**:

- No crashes
- No undefined behavior
- All outcomes deterministic (same input → same output)

### Fuzzing Event Payloads

**Property**: System never enters invalid state regardless of input.

**Test**:

1. Generate random event log (valid structure, random data)
2. Parse event
3. Assert either:
   - Valid event → processed correctly
   - Invalid event → error, state unchanged
4. Repeat 10,000 times

**Adversarial Data**:

- Empty strings
- Very long strings (10MB)
- Special characters
- Unicode edge cases
- Null bytes
- Numeric overflows
- Type mismatches

**Validation**:

- No crashes
- No silent failures
- All errors logged

### Invariant Preservation Under Random Sequences

**Property**: All invariants I1-I10 hold after arbitrary event sequences.

**Test**:

1. Generate random sequence of events (create, fund, release, cancel, dispute)
2. Execute sequence
3. Check all invariants:
   - Single terminal transition (I1)
   - Monotonic funding (I2)
   - Release requires funding (I3)
   - No double-spend (I4)
   - Version determinism (I5)
   - Event ordering independence (I6)
   - Dispute protection (I7)
   - Pre-funding cancellation (I8)
   - Escrow identity immutability (I9)
   - Balance conservation (I10)
4. Repeat 1,000 times

**Validation**:

- Zero invariant violations
- All violations logged and failing test
- System never in undefined state

### Concurrent Operation Simulation

**Property**: Invariant I4 holds under simulated concurrent operations.

**Test**:

1. Create escrow, fund it
2. Generate 10 simultaneous release operations
3. Process in random order with minimal delay
4. Assert exactly one succeeds
5. Assert final balance correct
6. Repeat 100 times

**Validation**:

- No double-spend
- Deterministic winner selection (e.g., first by timestamp)
- All losers receive explicit error

---

## Forbidden Patterns

### F1: Internal Method Assertions

```typescript
// FORBIDDEN
expect(contractInterface.releaseEscrow).toHaveBeenCalled();

// REQUIRED
expect(escrowState.status).toBe('RELEASED');
```

### F2: Version-Specific Branching

```typescript
// FORBIDDEN
if (version === 'v1') {
	expect(result).toBe(oldBehavior);
} else {
	expect(result).toBe(newBehavior);
}

// REQUIRED
testInvariant({ version, expectedBehavior: defineInvariant() });
```

### F3: Implementation Logic Duplication

```typescript
// FORBIDDEN
const expectedFee = amount * 0.01; // duplicating fee calculation

// REQUIRED
const expectedFee = getFeeFromContract(amount); // query actual behavior
```

### F4: Hardcoded Magic Numbers

```typescript
// FORBIDDEN
expect(events.length).toBe(3);

// REQUIRED
expect(events).toContain('Funded');
expect(events).toContain('Released');
```

### F5: Testing Private State

```typescript
// FORBIDDEN
expect(escrowManager.internalCache.size).toBe(5);

// REQUIRED
expect(getEscrowState(id)).toBe('FUNDED');
```

### F6: Coverage-Driven Tests

```typescript
// FORBIDDEN
// Adding test just to hit uncovered line

// REQUIRED
// Adding test to validate behavioral invariant
```

---

## Test Organization

### File Structure

Tests organized by behavioral domain, not code structure:

```
tests/
├── invariants/
│   ├── state-machine.test.ts       # I1, I3, I7
│   ├── balance-conservation.test.ts # I2, I10
│   ├── version-routing.test.ts      # I5
│   └── idempotency.test.ts          # I9
├── integration/
│   ├── multi-escrow.test.ts
│   ├── mixed-versions.test.ts
│   └── event-stream.test.ts
├── e2e/
│   ├── lifecycle-flows.test.ts
│   ├── dispute-resolution.test.ts
│   └── reconnection.test.ts
└── property/
    ├── random-sequences.test.ts
    ├── fuzz-inputs.test.ts
    └── invariant-checker.test.ts
```

### Test Naming Convention

```typescript
describe('Invariant: Single Terminal Transition (I1)', () => {
	test('released escrow rejects subsequent cancellation', () => {});
	test('cancelled escrow rejects subsequent release', () => {});
	test('disputed escrow blocks non-resolution transitions', () => {});
});
```

### Parameterization Strategy

```typescript
const VERSIONS = ['v1', 'v2', 'vN'];

describe.each(VERSIONS)('Version %s: State Transitions', (version) => {
	test('initial → funded', () => {
		const escrow = createEscrow({ version });
		fund(escrow);
		expect(getState(escrow)).toBe('FUNDED');
	});
});
```

---

## Success Criteria

Tests succeed when:

1. All invariants I1-I10 validated across all version permutations
2. Zero crashes under fuzzing (10K+ iterations)
3. Zero undefined states under random sequences (1K+ iterations)
4. All adversarial cases explicitly rejected with error codes
5. State reconstruction from logs always converges to correct state
6. No version-specific branches except documented behavioral divergences
7. All tests pass with version tag as parameter input
8. Property tests discover zero invariant violations

Tests fail when:

1. Any invariant violated under any input sequence
2. Crash on malformed input
3. Silent state corruption (no error logged)
4. Non-deterministic behavior on replayed events
5. Version routing ambiguity
6. Balance accounting mismatch
7. Double-spend possible under any sequence
8. Tests depend on internal implementation details

---

## Measurement

We do not target coverage percentages.

We target **invariant violation rate = 0**.

Metrics:

- **Invariant Violation Count**: Must be 0
- **Undefined State Count**: Must be 0
- **Crash Count Under Fuzz**: Must be 0
- **Non-Deterministic Replay Count**: Must be 0
- **Version Routing Ambiguity Count**: Must be 0

These are binary. Either 0 or failing test.

Coverage is observed, not optimized. If invariants hold, coverage is sufficient.
