# Escrow v2 Test Implementation Plan

## Executive Summary

This document defines the exact tests required for multi-version escrow support. Tests are written before implementation (TDD). The focus is on what tests to write, how they're structured, and how they scale to vn.

**Core Approach**: Version-agnostic behavioral tests with minimal version-specific supplements.

---

## 1. Core Architectural Decision

### Decision: Version-Agnostic Behavioral Tests (Primary)

**Rationale:**

Version-agnostic tests validate that all versions satisfy the same behavioral contract. This is the correct approach because:

1. **Scalability**: Adding v3 requires zero test changes to existing suite
2. **Duplication Prevention**: Single test validates all versions
3. **Regression Prevention**: Breaking changes to any version fail the test suite
4. **Bias Resistance**: Cannot optimize for single version
5. **Behavioral Focus**: Tests enforce "what" (outcomes) not "how" (implementation)

**Implementation Pattern:**

```typescript
// Single test validates all versions
describe('createEscrow', () => {
	test.each(['v1', 'v2', 'v3'])('creates escrow for version %s', async (version) => {
		const result = await createEscrow(version, { amount: '1.0' });

		// Behavioral assertion - must hold for ALL versions
		expect(result.escrowId).toMatch(/^\d+$/);
		expect(result.status).toBe('pending');
	});
});
```

**Version-Specific Supplements** (only when absolutely necessary):

- New features exclusive to version (e.g., v2 no-show)
- ABI signature verification
- Event name verification

**Scaling to vn:**

```typescript
// Add v3 to test matrix
const SUPPORTED_VERSIONS = ['v1', 'v2', 'v3'] as const;

// All existing tests automatically cover v3
test.each(SUPPORTED_VERSIONS)('...');
```

**Alternative Rejected:** Version-specific suites (v1.test.ts, v2.test.ts) create:

- Linear duplication (3 versions = 3x code)
- Maintenance burden (change behavior = update N files)
- Version bias (easy to skip testing older versions)

---

## 2. Test Categories

### A. Behavioral Contract Tests (Version-Agnostic)

#### A.1 createEscrow

**Test Matrix:**

```typescript
describe('createEscrow (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('creates valid escrow [%s]', async (version) => {
		const result = await createEscrow(version, {
			tasker: '0x123',
			taskee: '0x456',
			amount: '1.0',
			startTime: futureTimestamp(),
			endTime: futureTimestamp() + 3600
		});

		expect(result.escrowId).toMatch(/^\d+$/);
		expect(result.status).toBe('pending');
		expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
	});

	// Invalid inputs
	test.each(versions)('rejects zero amount [%s]', async (version) => {
		await expect(createEscrow(version, { amount: '0' })).rejects.toThrow(
			'Amount must be greater than zero'
		);
	});

	test.each(versions)('rejects negative amount [%s]', async (version) => {
		await expect(createEscrow(version, { amount: '-1' })).rejects.toThrow();
	});

	test.each(versions)('rejects invalid taskee address [%s]', async (version) => {
		await expect(createEscrow(version, { taskee: 'invalid' })).rejects.toThrow();
	});

	test.each(versions)('rejects past start time [%s]', async (version) => {
		await expect(createEscrow(version, { startTime: pastTimestamp() })).rejects.toThrow();
	});

	test.each(versions)('rejects end time before start time [%s]', async (version) => {
		const start = futureTimestamp();
		await expect(
			createEscrow(version, {
				startTime: start,
				endTime: start - 1
			})
		).rejects.toThrow();
	});

	// Version-specific parameters
	test('creates escrow with v2 parameters', async () => {
		const result = await createEscrow('v2', {
			amount: '1.0',
			cancellationFee: '0.1',
			upfrontDeposit: '0.2'
		});

		expect(result.escrowId).toBeDefined();
	});
});
```

#### A.2 loadEscrowDetails

**Test Matrix:**

```typescript
describe('loadEscrowDetails (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('loads existing escrow [%s]', async (version) => {
		const created = await createEscrow(version, { amount: '1.0' });

		const details = await loadEscrowDetails(version, created.escrowId);

		expect(details.id).toBe(created.escrowId);
		expect(details.tasker).toMatch(/^0x[a-fA-F0-9]{40}$/);
		expect(details.taskee).toMatch(/^0x[a-fA-F0-9]{40}$/);
		expect(details.baseAmount).toBe('1.0');
		expect(details.status).toBeDefined();
	});

	// Invalid inputs
	test.each(versions)('rejects non-existent escrow [%s]', async (version) => {
		await expect(loadEscrowDetails(version, '999999')).rejects.toThrow();
	});

	test.each(versions)('rejects invalid escrow ID format [%s]', async (version) => {
		await expect(loadEscrowDetails(version, 'invalid')).rejects.toThrow();
	});

	// V2 uint32 constraint
	test('rejects escrowId > uint32 max [v2]', async () => {
		await expect(loadEscrowDetails('v2', '4294967296')).rejects.toThrow('exceeds uint32 maximum');
	});
});
```

#### A.3 completeTask

**Test Matrix:**

```typescript
describe('completeTask (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('completes funded escrow [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		const result = await completeTask(version, escrow.id);

		expect(result.status).toBe('pending');
		expect(result.hash).toBeDefined();
	});

	// Invalid state
	test.each(versions)('rejects if not funded [%s]', async (version) => {
		const escrow = await createEscrow(version, { amount: '1.0' });

		await expect(completeTask(version, escrow.id)).rejects.toThrow('Invalid state');
	});

	test.each(versions)('rejects if already completed [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);
		await completeTask(version, escrow.id);

		await expect(completeTask(version, escrow.id)).rejects.toThrow();
	});

	// Permission check
	test.each(versions)('rejects if caller not taskee [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		await expect(completeTask(version, escrow.id, { from: wrongAddress })).rejects.toThrow(
			'Only taskee'
		);
	});
});
```

#### A.4 acceptTask

**Test Matrix:**

```typescript
describe('acceptTask (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('accepts completed task [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);
		await completeTask(version, escrow.id);

		const result = await acceptTask(version, escrow.id);

		expect(result.status).toBe('pending');
	});

	// Invalid state
	test.each(versions)('rejects if not completed [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		await expect(acceptTask(version, escrow.id)).rejects.toThrow('Task not completed');
	});

	// Permission check
	test.each(versions)('rejects if caller not tasker [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);

		await expect(acceptTask(version, escrow.id, { from: wrongAddress })).rejects.toThrow(
			'Only tasker'
		);
	});
});
```

#### A.5 cancelEscrow

**Test Matrix:**

```typescript
describe('cancelEscrow (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('cancels funded escrow [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		const result = await cancelEscrow(version, escrow.id);

		expect(result.status).toBe('pending');
	});

	// Timing constraint
	test.each(versions)('rejects cancellation after start time [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);
		await advanceTimeToStart(escrow);

		await expect(cancelEscrow(version, escrow.id)).rejects.toThrow('Cannot cancel at this time');
	});

	// Permission check
	test.each(versions)('rejects if caller not party [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		await expect(cancelEscrow(version, escrow.id, { from: wrongAddress })).rejects.toThrow(
			'Only parties'
		);
	});
});
```

#### A.6 disputeTask

**Test Matrix:**

```typescript
describe('disputeTask (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Happy path
	test.each(versions)('disputes completed task [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);

		const result = await disputeTask(version, escrow.id);

		expect(result.status).toBe('pending');
	});

	// Timing constraint
	test.each(versions)('rejects if dispute window expired [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);
		await advanceTimeBeyondDisputeWindow(escrow);

		await expect(disputeTask(version, escrow.id)).rejects.toThrow('Dispute window expired');
	});

	// State constraint
	test.each(versions)('rejects if not completed [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);

		await expect(disputeTask(version, escrow.id)).rejects.toThrow('Cannot dispute at this time');
	});
});
```

#### A.7 Status Transitions

**Test Matrix:**

```typescript
describe('Status Transitions (All Versions)', () => {
	const versions = ['v1', 'v2'];

	// Valid transitions
	test.each(versions)('transitions Funded → Completed [%s]', async (version) => {
		const escrow = await createFundedEscrow(version);
		expect(await getStatus(version, escrow.id)).toBe(EscrowStatus.Funded);

		await completeTask(version, escrow.id);
		await waitForConfirmation();

		expect(await getStatus(version, escrow.id)).toBe(EscrowStatus.Completed);
	});

	test.each(versions)('transitions Completed → FundsReleased [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);

		await acceptTask(version, escrow.id);
		await waitForConfirmation();

		expect(await getStatus(version, escrow.id)).toBe(EscrowStatus.FundsReleased);
	});

	test.each(versions)('transitions Completed → InDispute [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);

		await disputeTask(version, escrow.id);
		await waitForConfirmation();

		expect(await getStatus(version, escrow.id)).toBe(EscrowStatus.InDispute);
	});

	// Invariant: no backward transitions
	test.each(versions)('prevents backward transitions [%s]', async (version) => {
		const escrow = await createCompletedEscrow(version);
		await acceptTask(version, escrow.id);

		// Status is FundsReleased - cannot go back to Funded
		await expect(completeTask(version, escrow.id)).rejects.toThrow();
	});
});
```

#### A.8 Concurrent Contract Operations

**Test Matrix:**

```typescript
describe('Concurrent Contracts (All Versions)', () => {
	const versions = ['v1', 'v2'];

	test.each(versions)('handles multiple contracts independently [%s]', async (version) => {
		const escrow1 = await createFundedEscrow(version);
		const escrow2 = await createFundedEscrow(version);

		// Operate on both concurrently
		await Promise.all([completeTask(version, escrow1.id), completeTask(version, escrow2.id)]);

		// Both should succeed independently
		expect(await getStatus(version, escrow1.id)).toBe(EscrowStatus.Completed);
		expect(await getStatus(version, escrow2.id)).toBe(EscrowStatus.Completed);
	});

	test.each(versions)('isolates failures between contracts [%s]', async (version) => {
		const validEscrow = await createFundedEscrow(version);
		const invalidEscrow = { id: '999999' };

		// One fails, other succeeds
		await expect(completeTask(version, invalidEscrow.id)).rejects.toThrow();
		await expect(completeTask(version, validEscrow.id)).resolves.toBeDefined();
	});
});
```

---

### B. Version-Specific Tests

#### B.1 V2 No-Show Feature

```typescript
describe('V2 No-Show Feature', () => {
	test('marks no-show after start time', async () => {
		const escrow = await createFundedEscrow('v2');
		await advanceTimePastStart(escrow);

		const result = await markNoShow('v2', escrow.id);

		expect(result.status).toBe('pending');
	});

	test('rejects no-show before start time', async () => {
		const escrow = await createFundedEscrow('v2');

		await expect(markNoShow('v2', escrow.id)).rejects.toThrow('Cannot mark no-show before start');
	});

	test('claims refund after no-show grace period', async () => {
		const escrow = await createNoShowEscrow('v2');
		await advanceTimeBeyondGracePeriod(escrow);

		const result = await claimNoShowRefund('v2', escrow.id);

		expect(result.status).toBe('pending');
	});
});
```

#### B.2 V2 Upfront Deposit

```typescript
describe('V2 Upfront Deposit', () => {
	test('claims upfront deposit', async () => {
		const escrow = await createEscrowWithUpfront('v2', { upfront: '0.2' });

		const result = await claimUpfrontDeposit('v2', escrow.id);

		expect(result.status).toBe('pending');
	});

	test('rejects claim if no upfront deposit', async () => {
		const escrow = await createFundedEscrow('v2');

		await expect(claimUpfrontDeposit('v2', escrow.id)).rejects.toThrow('No upfront deposit');
	});
});
```

#### B.3 V2 Work In Progress

```typescript
describe('V2 Work In Progress', () => {
	test('marks work in progress after start time', async () => {
		const escrow = await createFundedEscrow('v2');
		await advanceTimeToStart(escrow);

		const result = await markWorkInProgress('v2', escrow.id);

		expect(result.status).toBe('pending');
	});

	test('transitions WorkInProgress → Completed', async () => {
		const escrow = await createWorkInProgressEscrow('v2');

		await completeTask('v2', escrow.id);
		await waitForConfirmation();

		expect(await getStatus('v2', escrow.id)).toBe(EscrowStatus.Completed);
	});
});
```

#### B.4 ABI Signature Verification

```typescript
describe('ABI Signatures', () => {
	test('v1 uses createEscrow ABI function', () => {
		const v1ABI = getABI('v1');
		const createFunc = v1ABI.find((f) => f.name === 'createEscrow');

		expect(createFunc).toBeDefined();
		expect(createFunc.inputs).toHaveLength(5);
	});

	test('v2 uses createPaymentContract ABI function', () => {
		const v2ABI = getABI('v2');
		const createFunc = v2ABI.find((f) => f.name === 'createPaymentContract');

		expect(createFunc).toBeDefined();
		expect(createFunc.inputs).toHaveLength(7); // Includes cancellationFee, upfrontDeposit
	});

	test('v1 uses getEscrow view function', () => {
		const v1ABI = getABI('v1');
		const getFunc = v1ABI.find((f) => f.name === 'getEscrow');

		expect(getFunc).toBeDefined();
		expect(getFunc.stateMutability).toBe('view');
	});

	test('v2 uses getPaymentContract view function', () => {
		const v2ABI = getABI('v2');
		const getFunc = v2ABI.find((f) => f.name === 'getPaymentContract');

		expect(getFunc).toBeDefined();
		expect(getFunc.stateMutability).toBe('view');
	});
});
```

---

### C. EscrowManager Tests

```typescript
describe('EscrowManager', () => {
	// Version routing
	test('routes v1 operations to v1 handler', async () => {
		const contract = createMockContract('v1');

		const version = escrow.getVersionFromContract(contract);

		expect(version).toBe('v1');
	});

	test('routes v2 operations to v2 handler', async () => {
		const contract = createMockContract('v2');

		const version = escrow.getVersionFromContract(contract);

		expect(version).toBe('v2');
	});

	test('defaults to v1 for missing version tag', () => {
		const contract = createMockContractWithoutVersion();

		const version = escrow.getVersionFromContract(contract);

		expect(version).toBe('v1');
	});

	test('defaults to v1 for unknown version', () => {
		const contract = createMockContract('v999');

		const version = escrow.getVersionFromContract(contract);

		expect(version).toBe('v1');
	});

	// Handler retrieval
	test('retrieves v1 handler', () => {
		const handler = escrow['getHandler']('v1');

		expect(handler).toBeDefined();
		expect(handler.escrow).toBeDefined();
		expect(handler.escrowBid).toBeDefined();
	});

	test('retrieves v2 handler', () => {
		const handler = escrow['getHandler']('v2');

		expect(handler).toBeDefined();
		expect(handler.escrow).toBeDefined();
	});

	// Multi-version handling
	test('handles mixed v1/v2 contracts', async () => {
		const v1Contract = createMockContract('v1');
		const v2Contract = createMockContract('v2');

		const v1Version = escrow.getVersionFromContract(v1Contract);
		const v2Version = escrow.getVersionFromContract(v2Contract);

		expect(v1Version).toBe('v1');
		expect(v2Version).toBe('v2');
	});

	// Capability checks
	test('detects v2-only features exist', () => {
		const v2Contract = createMockContract('v2');

		expect(escrow.hasFeature(v2Contract, 'markNoShow')).toBe(true);
	});

	test('detects v2-only features absent in v1', () => {
		const v1Contract = createMockContract('v1');

		expect(escrow.hasFeature(v1Contract, 'markNoShow')).toBe(false);
	});

	// No hardcoded branching
	test('does not use hardcoded version checks', () => {
		const sourceCode = readSourceFile('src/lib/utils/escrow/index.ts');

		// Should NOT contain: if (version === 'v1')
		expect(sourceCode).not.toMatch(/if\s*\(\s*version\s*===\s*['"]v1['"]\s*\)/);
		expect(sourceCode).not.toMatch(/if\s*\(\s*version\s*===\s*['"]v2['"]\s*\)/);
	});
});
```

---

### D. contract.store Tests

```typescript
describe('contract.store', () => {
	// Version resolution
	test('getContracts returns versioned instances', async () => {
		mockNostrEvent('v1', { escrowId: '1' });
		mockNostrEvent('v2', { escrowId: '2' });

		const contracts = await escrow.contractOps.getContracts();

		expect(contracts).toHaveLength(2);
		expect(contracts[0].version).toBe('v1');
		expect(contracts[1].version).toBe('v2');
	});

	test('defaults to v1 when version tag missing', async () => {
		mockNostrEventWithoutVersion({ escrowId: '1' });

		const contracts = await escrow.contractOps.getContracts();

		expect(contracts[0].version).toBe('v1');
	});

	test('handles unknown version gracefully', async () => {
		mockNostrEvent('v999', { escrowId: '1' });

		const contracts = await escrow.contractOps.getContracts();

		// Should default to v1
		expect(contracts[0].version).toBe('v1');
	});

	// Multi-version coexistence
	test('multiple contracts coexist without interference', async () => {
		mockNostrEvent('v1', { escrowId: '1' });
		mockNostrEvent('v2', { escrowId: '2' });
		mockNostrEvent('v1', { escrowId: '3' });

		const contracts = await escrow.contractOps.getContracts();

		expect(contracts).toHaveLength(3);
		expect(contracts[0].escrowData.id).toBe('1');
		expect(contracts[1].escrowData.id).toBe('2');
		expect(contracts[2].escrowData.id).toBe('3');
	});

	// No cross-version leakage
	test('v1 contract does not receive v2 permissions', async () => {
		mockNostrEvent('v1', { escrowId: '1' });

		const contracts = await escrow.contractOps.getContracts();

		expect(contracts[0].permissions.canMarkNoShow).toBeUndefined();
		expect(contracts[0].permissions.canClaimUpfrontDeposit).toBeUndefined();
	});

	test('v2 contract receives v2 permissions', async () => {
		mockNostrEvent('v2', { escrowId: '2' });

		const contracts = await escrow.contractOps.getContracts();

		expect(contracts[0].permissions.canMarkNoShow).toBeDefined();
		expect(contracts[0].permissions.canClaimUpfrontDeposit).toBeDefined();
	});

	// Filter by escrowId
	test('filters by escrowId correctly', async () => {
		mockNostrEvent('v1', { escrowId: '1' });
		mockNostrEvent('v2', { escrowId: '2' });

		const contracts = await escrow.contractOps.getContracts({
			escrowIds: ['2']
		});

		expect(contracts).toHaveLength(1);
		expect(contracts[0].escrowData.id).toBe('2');
		expect(contracts[0].version).toBe('v2');
	});
});
```

---

### E. Enum & Status Mapping Tests

```typescript
describe('Enum Mapping', () => {
	// Blockchain state → EscrowStatus mapping
	test('maps v2 blockchain state 0 to Funded', () => {
		expect(mapBlockchainStateToEnum(0)).toBe(EscrowStatus.Funded);
	});

	test('maps v2 blockchain state 10 to WorkInProgress', () => {
		expect(mapBlockchainStateToEnum(10)).toBe(EscrowStatus.WorkInProgress);
	});

	test('maps v2 blockchain state 9 to NoShow', () => {
		expect(mapBlockchainStateToEnum(9)).toBe(EscrowStatus.NoShow);
	});

	test('defaults unknown blockchain state to Funded', () => {
		expect(mapBlockchainStateToEnum(999)).toBe(EscrowStatus.Funded);
	});

	// Blockchain vs Nostr states
	test('blockchain states are 0-10', () => {
		const blockchainStates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

		blockchainStates.forEach((state) => {
			const status = mapBlockchainStateToEnum(state);
			expect(status).toBeGreaterThanOrEqual(0);
			expect(status).toBeLessThanOrEqual(10);
		});
	});

	test('nostr states are >= 100', () => {
		expect(EscrowStatus.PendingFunding).toBeGreaterThanOrEqual(100);
		expect(EscrowStatus.PendingCompletion).toBeGreaterThanOrEqual(100);
		expect(EscrowStatus.PendingMarkNoShow).toBeGreaterThanOrEqual(100);
	});

	test('no overlap between blockchain and nostr states', () => {
		const blockchainMax = 10;
		const nostrMin = 100;

		expect(nostrMin).toBeGreaterThan(blockchainMax);
	});

	// Removed states validation
	test('InProgress state removed from v2', () => {
		// v1 had InProgress = 7, v2 replaced with WorkInProgress = 10
		const v2Enum = EscrowStatus;

		// @ts-expect-error - InProgress should not exist
		expect(v2Enum.InProgress).toBeUndefined();
	});

	test('WorkInProgress state added in v2', () => {
		expect(EscrowStatus.WorkInProgress).toBe(10);
	});

	test('NoShow state added in v2', () => {
		expect(EscrowStatus.NoShow).toBe(9);
	});
});
```

---

### F. Event Parsing Tests

```typescript
describe('Event Parsing', () => {
	// V1 events
	test('parses v1 EscrowCreated event', () => {
		const mockLog = {
			topics: [
				'0x...', // EscrowCreated selector
				'0x...', // escrowId (indexed)
				'0x...', // tasker (indexed)
				'0x...' // taskee (indexed)
			],
			data: '0x...' // amount
		};

		const parsed = parseEvent(mockLog, v1ABI);

		expect(parsed.name).toBe('EscrowCreated');
		expect(parsed.args.escrowId).toBeDefined();
		expect(parsed.args.tasker).toMatch(/^0x/);
		expect(parsed.args.taskee).toMatch(/^0x/);
		expect(parsed.args.amount).toBeDefined();
	});

	// V2 events
	test('parses v2 PaymentContractCreated event', () => {
		const mockLog = {
			topics: [
				'0x...', // PaymentContractCreated selector
				'0x...' // paymentContractId (indexed)
			],
			data: '0x'
		};

		const parsed = parseEvent(mockLog, v2ABI);

		expect(parsed.name).toBe('PaymentContractCreated');
		expect(parsed.args.paymentContractId).toBeDefined();
		// No tasker/taskee/amount in event
	});

	test('parses v2 StateTransition event', () => {
		const mockLog = {
			topics: [
				'0x...', // StateTransition selector
				'0x...' // paymentContractId (indexed)
			],
			data: '0x...' // fromState, toState, timestamp
		};

		const parsed = parseEvent(mockLog, v2ABI);

		expect(parsed.name).toBe('StateTransition');
		expect(parsed.args.fromState).toBeDefined();
		expect(parsed.args.toState).toBeDefined();
		expect(parsed.args.timestamp).toBeDefined();
	});

	// Malformed events
	test('rejects malformed log (missing topics)', () => {
		const malformedLog = { topics: [], data: '0x' };

		expect(() => parseEvent(malformedLog, v2ABI)).toThrow();
	});

	test('rejects unexpected event name', () => {
		const unknownLog = {
			topics: ['0x999999...'],
			data: '0x'
		};

		expect(() => parseEvent(unknownLog, v2ABI)).toThrow();
	});

	// Partial log args
	test('handles partial log gracefully', () => {
		const partialLog = {
			topics: ['0x...'], // Valid selector but missing indexed args
			data: '0x'
		};

		const parsed = parseEvent(partialLog, v2ABI);

		expect(parsed.name).toBeDefined();
		expect(parsed.args).toBeDefined();
	});

	// Multiple logs in same tx
	test('extracts correct event from multiple logs', () => {
		const receipt = {
			logs: [
				{ topics: ['0xOTHER...'], data: '0x' },
				{ topics: ['0xPaymentContractCreated...'], data: '0x' },
				{ topics: ['0xOTHER...'], data: '0x' }
			]
		};

		const creationEvent = extractCreationEvent(receipt, v2ABI);

		expect(creationEvent.name).toBe('PaymentContractCreated');
	});

	// Event misidentification
	test('does not misidentify StateTransition as creation', () => {
		const stateLog = {
			topics: ['0xStateTransition...'],
			data: '0x'
		};

		const parsed = parseEvent(stateLog, v2ABI);

		expect(parsed.name).not.toBe('PaymentContractCreated');
		expect(parsed.name).toBe('StateTransition');
	});
});
```

---

### G. Error Translation Tests

```typescript
describe('Error Translation', () => {
	// V2 custom errors
	test('translates OnlyTasker error with $t key', () => {
		const error = new Error('OnlyTasker');

		const result = extractContractError(error);

		expect(result.userMessage).toContain('tasker'); // Not 'client'
		expect(result.errorCode).toBe('OnlyTasker');
	});

	test('translates OnlyTaskee error with $t key', () => {
		const error = new Error('OnlyTaskee');

		const result = extractContractError(error);

		expect(result.userMessage).toContain('taskee'); // Not 'freelancer'
		expect(result.errorCode).toBe('OnlyTaskee');
	});

	test('translates NoShowAlreadyMarked error', () => {
		const error = new Error('NoShowAlreadyMarked');

		const result = extractContractError(error);

		expect(result.userMessage).toContain('already marked');
		expect(result.errorCode).toBe('NoShowAlreadyMarked');
	});

	test('translates InvalidPaymentContractId error', () => {
		const error = new Error('InvalidPaymentContractId');

		const result = extractContractError(error);

		expect(result.userMessage).toBeDefined();
		expect(result.errorCode).toBe('InvalidPaymentContractId');
	});

	// No raw strings
	test('does not return raw error strings', () => {
		const error = new Error('OnlyTasker');

		const result = extractContractError(error);

		// Should use translation, not raw "OnlyTasker"
		expect(result.userMessage).not.toBe('OnlyTasker');
	});

	// Terminology
	test('uses tasker terminology (not client)', () => {
		const error = new Error('OnlyTasker');

		const result = extractContractError(error);

		expect(result.userMessage.toLowerCase()).toContain('tasker');
		expect(result.userMessage.toLowerCase()).not.toContain('client');
	});

	test('uses taskee terminology (not freelancer)', () => {
		const error = new Error('OnlyTaskee');

		const result = extractContractError(error);

		expect(result.userMessage.toLowerCase()).toContain('taskee');
		expect(result.userMessage.toLowerCase()).not.toContain('freelancer');
	});

	// Unknown error fallback
	test('provides fallback for unknown error code', () => {
		const error = new Error('UnknownCustomError');

		const result = extractContractError(error);

		expect(result.userMessage).toBeDefined();
		expect(result.userMessage.length).toBeGreaterThan(0);
	});

	// V1 string reverts (backward compatibility)
	test('handles v1 string revert messages', () => {
		const error = new Error('Only client can accept');

		const result = extractContractError(error);

		expect(result.userMessage).toBeDefined();
	});

	// Generic errors
	test('translates insufficient funds error', () => {
		const error = new Error('insufficient funds for transaction');

		const result = extractContractError(error);

		expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
	});

	test('translates user rejection', () => {
		const error = new Error('user rejected transaction');

		const result = extractContractError(error);

		expect(result.errorCode).toBe('USER_REJECTED');
	});
});
```

---

## 3. Preventing Test Bias

### Parameterized Testing

All behavioral tests use `test.each(versions)` pattern:

```typescript
const versions = ['v1', 'v2'];

test.each(versions)('test description [%s]', async (version) => {
	// Test implementation uses version parameter
});
```

**Why**: Forces test to work for all versions. Cannot optimize for single version.

### Data-Driven Test Cases

Define test data separately from test logic:

```typescript
const invalidAmounts = [
	{ input: '0', expectedError: 'Amount must be greater than zero' },
	{ input: '-1', expectedError: 'Invalid amount' },
	{ input: 'abc', expectedError: 'Invalid amount' }
];

test.each(versions)('rejects invalid amounts [%s]', async (version) => {
	for (const { input, expectedError } of invalidAmounts) {
		await expect(createEscrow(version, { amount: input })).rejects.toThrow(expectedError);
	}
});
```

**Why**: Separates test data from logic. Easy to add cases without changing test structure.

### Invariant-Based Assertions

Assert properties that must hold regardless of implementation:

```typescript
// ❌ Implementation-dependent (brittle)
expect(contract.interface.functions).toHaveProperty('createEscrow');

// ✅ Invariant-based (robust)
const result = await createEscrow(version, params);
expect(result.escrowId).toMatch(/^\d+$/); // Must be numeric
expect(result.status).toBe('pending'); // Must be pending
```

**Why**: Tests outcomes, not implementation details. Survives refactoring.

### Black-Box Testing

Test external behavior without assuming internal structure:

```typescript
// ❌ White-box (knows internals)
const handler = escrow['getHandler']('v2');
expect(handler.escrow.createEscrow).toBeCalledWith(...);

// ✅ Black-box (tests behavior)
const result = await escrow.escrowOps.createEscrow(...);
expect(result.escrowId).toBeDefined();
```

**Why**: Decouples tests from implementation. Tests remain valid after internal refactoring.

### Version Detection Testing

Avoid mocking version detection. Use real Nostr tag structure:

```typescript
// ❌ Mocked version
const contract = { version: 'v2' };

// ✅ Real version detection
const contract = {
	contractEvent: {
		tags: [['v', 'v2']] // Real Nostr tag structure
	}
};
const version = escrow.getVersionFromContract(contract);
```

**Why**: Tests actual version detection logic. Catches tag parsing bugs.

---

## 4. Test Writing Order

Write tests in this strict order:

### Phase 1: Infrastructure

1. Mock utilities (Nostr events, provider responses)
2. Test fixtures (createMockContract, createFundedEscrow)

### Phase 2: Core Routing

3. EscrowManager.getVersionFromContract tests
4. EscrowManager.getHandler tests
5. Version routing invariants

### Phase 3: Store Integration

6. contract.store.getContracts version resolution
7. Multi-version contract coexistence
8. Version fallback behavior

### Phase 4: Behavioral Contracts

9. createEscrow (all versions)
10. loadEscrowDetails (all versions)
11. completeTask (all versions)
12. acceptTask (all versions)
13. cancelEscrow (all versions)
14. disputeTask (all versions)
15. Status transition flows

### Phase 5: Event & Enum

16. Event parsing (v1 EscrowCreated, v2 PaymentContractCreated)
17. Enum mapping (blockchain state → EscrowStatus)
18. StateTransition event parsing

### Phase 6: Error Handling

19. Custom error translation (v2)
20. String revert translation (v1)
21. Terminology validation (tasker/taskee)

### Phase 7: Version-Specific

22. V2 no-show flow
23. V2 upfront deposit
24. V2 work in progress
25. ABI signature verification

### Phase 8: Integration

26. Concurrent contract operations
27. Multi-version mixed scenarios
28. Permission system validation

---

## 5. Test Implementation Notes

**Mocking Strategy:**

- Mock blockchain RPC responses
- Mock Nostr relay connections
- Do NOT mock version detection
- Do NOT mock EscrowManager routing
- Do NOT mock enum mapping

**Test File Locations:**

```
src/lib/tests/
├── unit/utils/escrow/
│   ├── escrowManager.test.ts
│   ├── versionDetection.test.ts
│   ├── enumMapping.test.ts
│   ├── eventParsing.test.ts
│   └── errorTranslation.test.ts
├── integration/escrow/
│   ├── contractStore.test.ts
│   ├── behavioralContracts.test.ts
│   ├── multiVersion.test.ts
│   └── v2Features.test.ts
```

**Assertion Patterns:**

- Use `.toBe()` for primitives
- Use `.toMatch()` for regex patterns
- Use `.toHaveLength()` for arrays
- Use `.rejects.toThrow()` for errors
- Use `.toBeDefined()` for existence checks

**No Coverage Commands**: Test design complete. Implementation produces coverage naturally.
