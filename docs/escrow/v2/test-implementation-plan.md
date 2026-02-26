# Escrow Contract v2 Test Implementation Plan

## Executive Summary

This document defines a comprehensive, version-aware, bias-resistant testing strategy for the BitTasker escrow system. Following TDD principles, tests are written BEFORE implementation to ensure correctness, completeness, and forward compatibility to vn.

**Testing Philosophy:**

- **TDD First**: Write tests → fix existing issues → reach 90% coverage → implement production code
- **Version-Agnostic Core**: Tests validate behaviors and invariants, not implementation details
- **Bias Resistance**: Parameterized tests across versions prevent single-case optimization
- **Real-World Focus**: Tests model actual usage patterns, adversarial inputs, and edge cases
- **Scalability**: Test architecture scales seamlessly to v3, v4, vn

---

## 1. Strategic Decision: Version-Agnostic vs Version-Specific Tests

### 1.1 Architectural Reasoning

**Question**: Should we write:

- **Option A**: Version-specific test suites (`v1.test.ts`, `v2.test.ts`, `v3.test.ts`...)
- **Option B**: Version-agnostic global tests that run across all versions

**Decision: HYBRID APPROACH (Primary: Version-Agnostic, Secondary: Version-Specific)**

### 1.2 Justification

#### Why Hybrid is Optimal

**Version-Agnostic Tests (Primary - 80% of tests):**

- ✅ **Scalability**: New versions require minimal test additions
- ✅ **Maintainability**: Single test validates all versions
- ✅ **Regression Prevention**: Version updates can't break invariants
- ✅ **Behavioral Focus**: Tests enforce "what" not "how"
- ✅ **Bias Resistance**: Naturally covers multi-version scenarios

**Version-Specific Tests (Secondary - 20% of tests):**

- ✅ **Feature Coverage**: New version features tested in isolation
- ✅ **ABI Verification**: Specific function signatures validated
- ✅ **Migration Testing**: Version-specific upgrade paths verified
- ❌ **Duplication Risk**: Can create maintenance burden if overused

#### Example: Version-Agnostic Test Design

```typescript
describe('Escrow Lifecycle (All Versions)', () => {
	test.each(['v1', 'v2'])('should complete full happy path for %s', async (version) => {
		// Arrange
		const contract = await createTestContract(version);

		// Act & Assert - same flow for all versions
		await completeTask(contract);
		expect(await getStatus(contract)).toBe(EscrowStatus.Completed);

		await acceptTask(contract);
		expect(await getStatus(contract)).toBe(EscrowStatus.FundsReleased);
	});
});
```

#### Example: Version-Specific Test Design

```typescript
describe('V2 No-Show Feature', () => {
	it('should mark no-show after start time', async () => {
		// This feature only exists in v2+
		const contract = await createTestContract('v2');

		await advanceTime(startTime + 1);
		await markNoShow(contract);

		expect(await getStatus(contract)).toBe(EscrowStatus.NoShow);
	});
});
```

### 1.3 Test Architecture Decision Matrix

| Test Type              | Version-Agnostic | Version-Specific | Reasoning                    |
| ---------------------- | ---------------- | ---------------- | ---------------------------- |
| **State Transitions**  | ✅ Primary       | ⚪ Optional      | Invariant across versions    |
| **Event Parsing**      | ✅ Primary       | ✅ Verify ABI    | Different events per version |
| **Enum Mapping**       | ✅ Primary       | ⚪ None          | Unified enum across versions |
| **Error Translation**  | ✅ Primary       | ✅ Custom errors | v2 adds custom errors        |
| **Permission Logic**   | ✅ Primary       | ✅ New perms     | v2 adds new permissions      |
| **Contract Creation**  | ✅ Primary       | ✅ New params    | v2 adds parameters           |
| **Version Detection**  | ✅ Primary       | ⚪ None          | Core version logic           |
| **Multi-Contract**     | ✅ Primary       | ⚪ None          | Real-world usage             |
| **V2 No-Show**         | ❌ N/A           | ✅ Required      | V2-only feature              |
| **V2 Upfront Deposit** | ❌ N/A           | ✅ Required      | V2-only feature              |

---

## 2. Preventing Test Bias

### 2.1 The Bias Problem

**Common Test Biases:**

1. **Happy-Path Bias**: Only testing expected flows
2. **Single-Version Bias**: Optimizing for one version only
3. **Implementation Bias**: Testing "how" instead of "what"
4. **Recency Bias**: Over-testing newest features
5. **Success Bias**: Not testing failure modes

### 2.2 Bias Resistance Strategy

#### 2.2.1 Parameterized Testing

**Pattern**: Run same test across all versions.

```typescript
describe('Version-Agnostic Contract Operations', () => {
	const versions: EscrowVersion[] = ['v1', 'v2']; // Add v3, v4 here

	test.each(versions)('createEscrow should emit creation event [%s]', async (version) => {
		const result = await escrow.escrowOps.createEscrow(/* params */);

		expect(result.status).toBe('pending');
		expect(result.escrowId).toBeDefined();

		// Version-specific assertions
		if (version === 'v1') {
			expect(eventName).toBe('EscrowCreated');
		} else if (version === 'v2') {
			expect(eventName).toBe('PaymentContractCreated');
		}
	});
});
```

#### 2.2.2 Invariant-Based Testing

**Pattern**: Assert properties that must hold regardless of version.

```typescript
describe('Escrow Invariants', () => {
	test.each(versions)('funds must never exceed deposit [%s]', async (version) => {
		const contract = await createTestContract(version, { amount: '1.0' });

		const escrowData = await loadEscrowDetails(contract);

		// Invariant: total released funds ≤ original deposit
		expect(parseFloat(escrowData.totalAmount)).toBeLessThanOrEqual(1.0);
	});

	test.each(versions)('status transitions must be monotonic [%s]', async (version) => {
		const contract = await createTestContract(version);
		const history: EscrowStatus[] = [];

		// Collect status changes
		await completeTask(contract);
		history.push(await getStatus(contract));

		await acceptTask(contract);
		history.push(await getStatus(contract));

		// Invariant: no backward state transitions
		expect(isFinalState(history[history.length - 1])).toBe(true);
	});
});
```

#### 2.2.3 Property-Based Testing

**Pattern**: Generate random inputs and verify properties hold.

```typescript
import { fc } from 'fast-check';

describe('Property-Based Tests', () => {
	it('should handle arbitrary valid escrow IDs', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 1, max: 4294967295 }), // uint32 range
				async (escrowId) => {
					const contract = await createMockContract('v2', { escrowId: String(escrowId) });

					// Property: loading details should never throw for valid IDs
					const details = await escrow.escrowOps.loadEscrowDetails(contract);
					expect(details.id).toBe(String(escrowId));
				}
			)
		);
	});
});
```

#### 2.2.4 Adversarial Input Testing

**Pattern**: Test malformed, edge-case, and malicious inputs.

```typescript
describe('Adversarial Inputs', () => {
	test.each(versions)('should reject escrowId > uint32 max [%s]', async (version) => {
		const oversizedId = '4294967296'; // uint32 max + 1

		await expect(async () => {
			await validatePaymentId(oversizedId);
		}).rejects.toThrow('exceeds uint32 maximum');
	});

	test.each(versions)('should handle missing Nostr version tag [%s]', async (version) => {
		const eventWithoutVersion = createMockNostrEvent({
			tags: [] // No ['v', 'v2'] tag
		});

		const detectedVersion = escrow.getVersionFromContract(eventWithoutVersion);

		// Invariant: missing version defaults to v1
		expect(detectedVersion).toBe('v1');
	});
});
```

#### 2.2.5 Real-World Usage Patterns

**Pattern**: Test scenarios that reflect actual user behavior.

```typescript
describe('Real-World Patterns', () => {
	it('should handle mixed v1/v2 contracts in same session', async () => {
		// Create v1 contract
		const v1Contract = await createTestContract('v1');

		// Create v2 contract
		const v2Contract = await createTestContract('v2');

		// Load both contracts
		const contracts = await escrow.contractOps.getContracts();

		expect(contracts).toHaveLength(2);
		expect(contracts[0].version).toBe('v1');
		expect(contracts[1].version).toBe('v2');
	});

	it('should handle concurrent contract operations', async () => {
		const contract1 = await createTestContract('v2');
		const contract2 = await createTestContract('v2');

		// Concurrent operations
		await Promise.all([completeTask(contract1), completeTask(contract2)]);

		// Both should succeed independently
		expect(await getStatus(contract1)).toBe(EscrowStatus.Completed);
		expect(await getStatus(contract2)).toBe(EscrowStatus.Completed);
	});
});
```

### 2.3 Test Smell Detection

**Indicators of biased tests:**

- ❌ Hardcoded version checks: `if (version === 'v1')`
- ❌ Only testing happy paths
- ❌ Mocking version detection instead of using real tags
- ❌ Skipping error cases
- ❌ Testing implementation details (e.g., "function was called") instead of outcomes
- ❌ Single test case per feature

**Good practices:**

- ✅ Parameterized tests across versions
- ✅ Invariant-based assertions
- ✅ Property-based testing
- ✅ Adversarial input coverage
- ✅ Real-world usage scenarios
- ✅ Multiple test cases per feature

---

## 3. Test Architecture

### 3.1 Folder Structure

```
src/lib/tests/
├── unit/
│   └── utils/
│       └── escrow/
│           ├── shared/                          # Version-agnostic tests
│           │   ├── versionDetection.test.ts    # Version from Nostr tags
│           │   ├── enumMapping.test.ts         # Blockchain state → EscrowStatus
│           │   ├── idValidation.test.ts        # ID range validation
│           │   └── errorHandling.test.ts       # Error translation
│           ├── v1/                             # V1-specific tests
│           │   ├── escrow.test.ts              # V1 contract operations
│           │   ├── escrowBid.test.ts           # V1 bid acceptance
│           │   ├── escrowEvents.test.ts        # V1 event parsing
│           │   ├── feeCalculations.test.ts     # V1 fee logic
│           │   └── contractPermissions.test.ts # V1 permissions
│           └── v2/                             # V2-specific tests
│               ├── escrow.test.ts              # V2 contract operations
│               ├── escrowBid.test.ts           # V2 bid acceptance (new params)
│               ├── escrowEvents.test.ts        # V2 event parsing (PaymentContractCreated)
│               ├── noShowFlow.test.ts          # V2 no-show feature
│               ├── upfrontDeposit.test.ts      # V2 upfront deposit feature
│               └── customErrors.test.ts        # V2 custom error parsing
│
├── integration/
│   └── escrow/
│       ├── shared/                             # Multi-version integration tests
│       │   ├── escrowManager.test.ts           # EscrowManager version routing
│       │   ├── multiVersionContracts.test.ts   # Mixed v1/v2 contracts
│       │   ├── versionUpgrade.test.ts          # V1 → V2 migration scenarios
│       │   └── concurrentContracts.test.ts     # Multiple contracts active
│       ├── v1/                                 # V1 integration tests
│       │   ├── escrowLifecycle.test.ts         # Full lifecycle (create → release)
│       │   ├── escrowDisputes.test.ts          # Dispute flows
│       │   ├── escrowBidAcceptance.test.ts     # Bid acceptance flow
│       │   └── escrowPermissions.test.ts       # Permission system
│       └── v2/                                 # V2 integration tests
│           ├── escrowLifecycle.test.ts         # Full lifecycle with v2 features
│           ├── escrowDisputes.test.ts          # V2 dispute flows
│           ├── escrowNoShow.test.ts            # No-show → refund flow
│           └── escrowUpfrontDeposit.test.ts    # Upfront deposit → claim flow
│
└── e2e/
    └── escrow/
        ├── realWorldUsage.test.ts              # E2E user journeys
        └── performanceBenchmarks.test.ts       # Performance validation
```

### 3.2 Test Naming Convention

**Pattern**: `[scope].[feature].[scenario].test.ts`

**Examples:**

- `shared.versionDetection.missingTag.test.ts`
- `v2.escrow.createWithUpfrontDeposit.test.ts`
- `integration.multiVersionContracts.mixedV1V2.test.ts`

### 3.3 Mocking Strategy

**Principle**: Mock external dependencies, test real version logic.

#### 3.3.1 What to Mock

- ✅ **Blockchain RPC calls** (ethers.js provider responses)
- ✅ **Nostr relay connections** (pool.subscribe)
- ✅ **Wallet interactions** (signature requests)
- ✅ **Time-dependent operations** (block timestamps)

#### 3.3.2 What NOT to Mock

- ❌ **Version detection logic** (use real Nostr tags)
- ❌ **EscrowManager routing** (test real version handler selection)
- ❌ **Enum mapping functions** (test real blockchain state → enum)
- ❌ **ABI interaction** (test real ethers.js contract interface)

#### 3.3.3 Mock Implementations

```typescript
// Mock provider responses
export function mockProviderCall(contractAddress: string, version: EscrowVersion) {
	const mockProvider = {
		call: vi.fn().mockImplementation(async (tx) => {
			if (tx.data.startsWith('0x...')) {
				// getPaymentContract selector
				return encodeMockContractData(version);
			}
		}),
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt(1000000000) // 1 gwei
		})
	};
	return mockProvider;
}

// Mock Nostr events with real version tags
export function createMockNostrEvent(
	version: EscrowVersion,
	overrides?: Partial<NostrEvent>
): NostrEvent {
	return {
		id: 'mock-event-id',
		pubkey: 'mock-pubkey',
		created_at: Math.floor(Date.now() / 1000),
		kind: KINDS.CONTRACT,
		tags: [
			['d', '123'],
			['v', version], // REAL version tag
			['n', 'testnet']
		],
		content: JSON.stringify({
			escrowId: '123',
			taskId: 'task-123',
			...overrides
		}),
		sig: 'mock-sig'
	};
}
```

---

## 4. Refactoring Existing V1 Tests

### 4.1 Current Test Issues (Verified)

**Existing v1 tests have:**

- ❌ Linting errors
- ❌ TypeScript type issues
- ❌ Fragile assertions (implementation-dependent)
- ❌ No version parameterization
- ❌ Missing edge case coverage

### 4.2 Refactoring Strategy

#### Phase 1: Fix Linting & TypeScript Errors

```bash
# Run linter to identify issues
npm run lint

# Fix type errors
npm run check
```

**Common Issues:**

- Missing type imports
- Incorrect type assertions
- Unused variables
- Async/await inconsistencies

#### Phase 2: Convert to Parameterized Tests

**Before (v1-only):**

```typescript
describe('Escrow Operations', () => {
	it('should create escrow', async () => {
		const result = await v1.escrow.createEscrow(/* params */);
		expect(result.escrowId).toBeDefined();
	});
});
```

**After (version-agnostic):**

```typescript
describe('Escrow Operations (All Versions)', () => {
	test.each(['v1', 'v2'])('should create escrow [%s]', async (version) => {
		const handler = getVersionHandler(version);
		const result = await handler.escrow.createEscrow(/* params */);
		expect(result.escrowId).toBeDefined();
	});
});
```

#### Phase 3: Convert Brittle Assertions to Invariants

**Before (brittle):**

```typescript
expect(contract.interface.functions).toHaveProperty('createEscrow');
```

**After (invariant):**

```typescript
// Test outcome, not implementation
const result = await createEscrow(/* params */);
expect(result.status).toBe('pending');
expect(result.escrowId).toMatch(/^\d+$/);
```

#### Phase 4: Add Missing Edge Cases

```typescript
describe('Edge Cases', () => {
	test.each(versions)('should handle zero amount gracefully [%s]', async (version) => {
		await expect(async () => {
			await createEscrow(version, { amount: '0' });
		}).rejects.toThrow('Amount must be greater than zero');
	});

	test.each(versions)('should handle very large amounts [%s]', async (version) => {
		const largeAmount = '1000000'; // 1M RBTC
		const result = await createEscrow(version, { amount: largeAmount });
		expect(result.escrowId).toBeDefined();
	});
});
```

### 4.3 Refactoring Checklist

- [ ] Run linter and fix all warnings
- [ ] Fix all TypeScript errors
- [ ] Convert tests to parameterized format
- [ ] Replace implementation assertions with invariant checks
- [ ] Add edge case coverage
- [ ] Verify tests pass for v1
- [ ] Ensure tests are ready for v2 extension

---

## 5. Unit Tests

### 5.1 EscrowManager Tests

**File**: `src/lib/tests/unit/utils/escrow/shared/escrowManager.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { escrow } from '$lib/utils/escrow';

describe('EscrowManager', () => {
	describe('Version Detection', () => {
		it('should detect v1 from Nostr tag', () => {
			const contract = createMockContract('v1');
			const version = escrow.getVersionFromContract(contract);
			expect(version).toBe('v1');
		});

		it('should detect v2 from Nostr tag', () => {
			const contract = createMockContract('v2');
			const version = escrow.getVersionFromContract(contract);
			expect(version).toBe('v2');
		});

		it('should default to v1 when version tag missing', () => {
			const contract = createMockContract(null); // No version tag
			const version = escrow.getVersionFromContract(contract);
			expect(version).toBe('v1');
		});

		it('should handle malformed version tags', () => {
			const contract = createMockContract('invalid');
			const version = escrow.getVersionFromContract(contract);
			expect(version).toBe('v1'); // Falls back to latest supported
		});
	});

	describe('Handler Routing', () => {
		it('should route to correct handler for v1', () => {
			const handler = escrow['getHandler']('v1');
			expect(handler).toBeDefined();
			expect(handler.escrow).toBeDefined();
		});

		it('should route to correct handler for v2', () => {
			const handler = escrow['getHandler']('v2');
			expect(handler).toBeDefined();
			expect(handler.escrow).toBeDefined();
		});
	});

	describe('Capability Checks', () => {
		it('should detect v2-only features', () => {
			const v2Contract = createMockContract('v2');
			expect(escrow.hasFeature(v2Contract, 'markNoShow')).toBe(true);
		});

		it('should return false for v1 on v2-only features', () => {
			const v1Contract = createMockContract('v1');
			expect(escrow.hasFeature(v1Contract, 'markNoShow')).toBe(false);
		});
	});
});
```

### 5.2 Version Detection Tests

**File**: `src/lib/tests/unit/utils/escrow/shared/versionDetection.test.ts`

```typescript
describe('Version Detection', () => {
	test.each([
		{ tags: [['v', 'v1']], expected: 'v1' },
		{ tags: [['v', 'v2']], expected: 'v2' },
		{ tags: [], expected: 'v1' }, // Missing tag
		{ tags: [['x', 'v2']], expected: 'v1' }, // Wrong tag key
		{ tags: [['v', 'v999']], expected: 'v1' } // Unsupported version
	])('should detect version correctly: $expected', ({ tags, expected }) => {
		const event = createMockNostrEvent({ tags });
		const contract = { contractEvent: event } as ContractWithEvents;

		const version = escrow.getVersionFromContract(contract);
		expect(version).toBe(expected);
	});
});
```

### 5.3 Enum Mapping Tests

**File**: `src/lib/tests/unit/utils/escrow/shared/enumMapping.test.ts`

```typescript
import { mapBlockchainStateToEnum, EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

describe('Enum Mapping (V2)', () => {
	const testCases = [
		{ blockchainState: 0, expected: EscrowStatus.Funded },
		{ blockchainState: 1, expected: EscrowStatus.InDispute },
		{ blockchainState: 2, expected: EscrowStatus.DisputeResolved },
		{ blockchainState: 4, expected: EscrowStatus.Completed },
		{ blockchainState: 5, expected: EscrowStatus.Cancelled },
		{ blockchainState: 7, expected: EscrowStatus.FundsReleased },
		{ blockchainState: 9, expected: EscrowStatus.NoShow },
		{ blockchainState: 10, expected: EscrowStatus.WorkInProgress }
	];

	test.each(testCases)(
		'should map $blockchainState to $expected',
		({ blockchainState, expected }) => {
			const result = mapBlockchainStateToEnum(blockchainState);
			expect(result).toBe(expected);
		}
	);

	it('should handle unknown blockchain states', () => {
		const result = mapBlockchainStateToEnum(999);
		expect(result).toBe(EscrowStatus.Funded); // Default fallback
	});
});
```

### 5.4 ID Validation Tests

**File**: `src/lib/tests/unit/utils/escrow/shared/idValidation.test.ts`

```typescript
import { validatePaymentId } from '$lib/utils/escrow/v2/escrow';

describe('ID Validation (V2)', () => {
	describe('Valid IDs', () => {
		test.each([
			'1',
			'12345',
			'4294967295' // uint32 max
		])('should accept valid ID: %s', (id) => {
			expect(() => validatePaymentId(id)).not.toThrow();
		});
	});

	describe('Invalid IDs', () => {
		it('should reject ID exceeding uint32 max', () => {
			expect(() => validatePaymentId('4294967296')).toThrow('exceeds uint32 maximum');
		});

		it('should reject negative ID', () => {
			expect(() => validatePaymentId('-1')).toThrow('must be non-negative');
		});

		it('should reject non-numeric ID', () => {
			expect(() => validatePaymentId('abc')).toThrow();
		});
	});
});
```

### 5.5 Error Handling Tests

**File**: `src/lib/tests/unit/utils/escrow/shared/errorHandling.test.ts`

```typescript
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';

describe('Error Handling', () => {
	describe('V2 Custom Errors', () => {
		it('should parse OnlyTasker error', () => {
			const error = new Error('OnlyTasker');
			const result = extractContractError(error);

			expect(result.errorCode).toBe('OnlyTasker');
			expect(result.userMessage).toContain('tasker');
		});

		it('should parse NoShowAlreadyMarked error', () => {
			const error = new Error('NoShowAlreadyMarked');
			const result = extractContractError(error);

			expect(result.errorCode).toBe('NoShowAlreadyMarked');
			expect(result.userMessage).toContain('already marked');
		});
	});

	describe('V1 String Reverts', () => {
		it('should parse string revert messages', () => {
			const error = new Error('Only client can accept');
			const result = extractContractError(error);

			expect(result.userMessage).toBeDefined();
		});
	});

	describe('Generic Errors', () => {
		it('should handle insufficient funds error', () => {
			const error = new Error('insufficient funds for transaction');
			const result = extractContractError(error);

			expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
		});

		it('should handle user rejection', () => {
			const error = new Error('user rejected transaction');
			const result = extractContractError(error);

			expect(result.errorCode).toBe('USER_REJECTED');
		});
	});
});
```

### 5.6 Event Parsing Tests (Version-Specific)

**File**: `src/lib/tests/unit/utils/escrow/v2/escrowEvents.test.ts`

```typescript
describe('V2 Event Parsing', () => {
	it('should parse PaymentContractCreated event', async () => {
		const mockReceipt = {
			logs: [
				{
					topics: [
						'0x...', // PaymentContractCreated selector
						'0x...' // paymentContractId (indexed)
					],
					data: '0x...'
				}
			]
		};

		const parsedEvent = parseContractEvent(mockReceipt, v2ABI);

		expect(parsedEvent.name).toBe('PaymentContractCreated');
		expect(parsedEvent.args.paymentContractId).toBeDefined();
	});

	it('should parse StateTransition event', async () => {
		const mockReceipt = {
			logs: [
				{
					topics: [
						'0x...', // StateTransition selector
						'0x...' // paymentContractId
					],
					data: '0x...' // fromState, toState, timestamp
				}
			]
		};

		const parsedEvent = parseContractEvent(mockReceipt, v2ABI);

		expect(parsedEvent.name).toBe('StateTransition');
		expect(parsedEvent.args.fromState).toBeDefined();
		expect(parsedEvent.args.toState).toBeDefined();
	});
});
```

---

## 6. Integration Tests

### 6.1 Multi-Version Contract Tests

**File**: `src/lib/tests/integration/escrow/shared/multiVersionContracts.test.ts`

```typescript
describe('Multi-Version Contracts', () => {
	it('should load mixed v1/v2 contracts simultaneously', async () => {
		// Create v1 contract
		mockNostrEvent('v1', { escrowId: '1' });

		// Create v2 contract
		mockNostrEvent('v2', { escrowId: '2' });

		// Load all contracts
		const contracts = await escrow.contractOps.getContracts();

		expect(contracts).toHaveLength(2);
		expect(contracts.find((c) => c.version === 'v1')).toBeDefined();
		expect(contracts.find((c) => c.version === 'v2')).toBeDefined();
	});

	it('should handle operations on different versions concurrently', async () => {
		const v1Contract = await createTestContract('v1');
		const v2Contract = await createTestContract('v2');

		// Concurrent operations
		const [v1Result, v2Result] = await Promise.all([
			escrow.escrowOps.completeTask(v1Contract),
			escrow.escrowOps.completeTask(v2Contract)
		]);

		expect(v1Result.status).toBe('pending');
		expect(v2Result.status).toBe('pending');
	});
});
```

### 6.2 Version Resolution Tests

**File**: `src/lib/tests/integration/escrow/shared/versionResolution.test.ts`

```typescript
describe('Version Resolution', () => {
	it('should resolve correct handler for v1 contract', async () => {
		const contract = createMockContract('v1');

		const escrowData = await escrow.escrowOps.loadEscrowDetails(contract);

		// Verify v1 ABI was used (field names)
		expect(escrowData.tasker).toBeDefined(); // v1 uses 'client' → mapped to 'tasker'
	});

	it('should resolve correct handler for v2 contract', async () => {
		const contract = createMockContract('v2');

		const escrowData = await escrow.escrowOps.loadEscrowDetails(contract);

		// Verify v2 ABI was used
		expect(escrowData.noShowMarked).toBeDefined(); // V2-only field
	});

	it('should default to v1 for contracts without version tag', async () => {
		const contract = createMockContract(null);

		const version = escrow.getVersionFromContract(contract);

		expect(version).toBe('v1');
	});
});
```

### 6.3 Permission System Tests

**File**: `src/lib/tests/integration/escrow/shared/permissionSystem.test.ts`

```typescript
describe('Permission System', () => {
	describe('V1 Permissions', () => {
		it('should grant standard permissions for v1', async () => {
			const contract = createMockContract('v1', {
				status: EscrowStatus.Funded,
				isClient: false
			});

			expect(contract.permissions.canComplete).toBe(true);
			expect(contract.permissions.canAccept).toBe(false);
			expect(contract.permissions.canMarkNoShow).toBeUndefined();
		});
	});

	describe('V2 Permissions', () => {
		it('should grant v2-specific permissions', async () => {
			const contract = createMockContract('v2', {
				status: EscrowStatus.Funded,
				isClient: true
			});

			expect(contract.permissions.canMarkNoShow).toBe(true);
			expect(contract.permissions.canMarkWorkInProgress).toBe(false);
		});
	});
});
```

### 6.4 Real-Time Event Handling

**File**: `src/lib/tests/integration/escrow/shared/realtimeEvents.test.ts`

```typescript
describe('Real-Time Event Handling', () => {
	it('should handle incoming v2 contract creation event', async () => {
		const mockEvent = createMockNostrEvent('v2', {
			escrowId: '123',
			transactionHash: '0xabc...'
		});

		await escrow.contractOps.handleContractEvent(mockEvent);

		// Verify contract was added
		const contracts = await escrow.contractOps.getContracts();
		expect(contracts.find((c) => c.escrowData.id === '123')).toBeDefined();
	});

	it('should handle status update events for correct version', async () => {
		const contract = createMockContract('v2');

		const mockStatusEvent = createMockStatusEvent('v2', {
			escrowId: contract.escrowData.id,
			status: EscrowStatus.Completed
		});

		await escrow.contractOps.handleStatusEvent(mockStatusEvent);

		// Verify status was updated
		const updated = await escrow.contractOps.getContracts({
			escrowIds: [contract.escrowData.id]
		});
		expect(updated[0].status).toBe(EscrowStatus.Completed);
	});
});
```

---

## 7. Coverage Strategy

### 7.1 Coverage Targets

**Global Minimum**: 90% line coverage

**Critical Paths Minimum**: 100% coverage required for:

- Version detection (`getVersionFromContract`)
- Event parsing (all events, all versions)
- Enum mapping (`mapBlockchainStateToEnum`)
- Error translation (`extractContractError`)
- EscrowManager routing (`getHandler`)

### 7.2 Coverage Measurement

```bash
# Run coverage report
npm run test:coverage

# Generate HTML report
npm run test:coverage:report
```

### 7.3 Coverage Exclusions

**Files excluded from coverage:**

- Mock utilities (`*.mock.ts`)
- Test fixtures (`*.fixture.ts`)
- Type definitions (`*.d.ts`)
- Storybook stories (`*.stories.ts`)

### 7.4 Mutation Testing (Optional - Recommended)

**Tool**: Stryker Mutator

```bash
# Install
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner

# Run mutation tests
npx stryker run
```

**Mutation Score Target**: 80%+

---

## 8. Test Writing Order (TDD Workflow)

### Phase 1: Setup & Refactoring (Week 1)

1. ✅ Fix existing v1 test linting errors
2. ✅ Fix existing v1 test TypeScript errors
3. ✅ Convert brittle v1 tests to invariant-based
4. ✅ Ensure all v1 tests pass
5. ✅ Establish test infrastructure (mocks, fixtures)

### Phase 2: Core Version Logic (Week 1)

6. ✅ Version detection tests (Nostr tags)
7. ✅ EscrowManager routing tests
8. ✅ Enum mapping tests (v2)
9. ✅ ID validation tests (v2)

### Phase 3: V2 Event Parsing (Week 2)

10. ✅ Event parsing tests (`PaymentContractCreated`)
11. ✅ StateTransition event tests
12. ✅ Custom error parsing tests

### Phase 4: V2 Contract Operations (Week 2)

13. ✅ createEscrow tests (new parameters)
14. ✅ loadEscrowDetails tests (ABI changes)
15. ✅ completeTask, acceptTask tests (parameterized)
16. ✅ cancelEscrow tests (ABI name change)

### Phase 5: V2 New Features (Week 3)

17. ✅ markNoShow tests
18. ✅ claimNoShowRefund tests
19. ✅ markWorkInProgress tests
20. ✅ claimUpfrontDeposit tests

### Phase 6: Integration Tests (Week 3)

21. ✅ Multi-version contract loading
22. ✅ Version resolution logic
23. ✅ Permission system with v2 permissions
24. ✅ Concurrent operations

### Phase 7: Edge Cases & Coverage (Week 4)

25. ✅ Adversarial input tests
26. ✅ Property-based tests
27. ✅ Real-world usage scenarios
28. ✅ Reach 90% coverage
29. ✅ Mutation testing

### Phase 8: Implementation (Week 5+)

30. ✅ Implement production code to pass tests
31. ✅ Refactor as needed
32. ✅ Re-run tests continuously

---

## 9. Test Execution Strategy

### 9.1 Local Development

```bash
# Run all tests
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run specific version tests
npm run test -- --grep "v2"

# Watch mode
npm run test:watch
```

### 9.2 CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run type check
        run: npm run check

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json

      - name: Fail if coverage < 90%
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 90" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 90%"
            exit 1
          fi
```

### 9.3 Pre-Commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run lint
npm run check
npm run test:unit
```

---

## 10. Key Testing Principles Summary

### 10.1 Core Principles

1. **TDD First**: Tests written before implementation
2. **Version-Agnostic Core**: Parameterized tests across versions
3. **Invariant-Based**: Assert properties, not implementation
4. **Bias Resistance**: Property-based and adversarial testing
5. **Real-World Focus**: Test actual usage patterns
6. **Forward Compatible**: Scales to v3, v4, vn

### 10.2 Success Criteria

- ✅ 90% global coverage
- ✅ 100% coverage for critical paths
- ✅ All existing v1 tests pass
- ✅ All v2 tests pass
- ✅ Multi-version scenarios validated
- ✅ No linting or TypeScript errors
- ✅ Mutation score > 80%

### 10.3 Anti-Patterns to Avoid

- ❌ Testing implementation details
- ❌ Hardcoded version checks
- ❌ Single-case optimization
- ❌ Mocking version detection
- ❌ Brittle assertions
- ❌ Happy-path-only tests

---

## 11. Conclusion

This test implementation plan provides a robust, version-aware, bias-resistant testing strategy for the BitTasker escrow system. By following TDD principles and emphasizing version-agnostic tests with parameterization, we ensure:

- **Scalability**: New versions require minimal test additions
- **Maintainability**: Tests remain stable across refactors
- **Quality**: High coverage and invariant-based validation
- **Confidence**: Production code proven correct before implementation

**Implementation Timeline**: 5 weeks (4 weeks testing, 1+ week implementation)

**Risk Level**: LOW

- Clear test architecture
- Existing v1 tests as foundation
- Version-agnostic design prevents lock-in
- High coverage targets enforce quality

**Recommendation**: PROCEED with TDD approach as outlined.
