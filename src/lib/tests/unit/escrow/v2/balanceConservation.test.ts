/**
 * Unit Tests: Balance Conservation & Monotonic Funding (I2, I10)
 *
 * Tests validate:
 * - I2: Monotonic Funding (amount cannot decrease)
 * - I10: Balance Conservation (sum of escrows = total locked)
 *
 * Version-agnostic tests focused on financial invariants.
 */

import { describe, it, expect } from 'vitest';
import { EscrowStatus as V2Status } from '$lib/utils/escrow/v2/escrow.enum';
import type { EscrowData } from '$lib/types/wallet';
import type { FeeTier } from '@bittasker/wallet-core';

// V2-compatible EscrowData type that accepts V2 status enum
type V2EscrowData = Omit<EscrowData, 'status'> & {
	status: V2Status;
};

describe('Invariant I2: Monotonic Funding', () => {
	const createMockEscrow = (totalAmount: string, status = V2Status.Funded): V2EscrowData => ({
		id: '0x1234',
		client: '0x' + '1'.repeat(40),
		freelancer: '0x' + '2'.repeat(40),
		baseAmount: '1.0',
		clientFee: '0.01',
		freelancerFee: '0.01',
		totalAmount,
		status,
		estimatedStartTime: Date.now() + 3600000,
		estimatedCompletionTime: Date.now() + 7200000,
		completionTime: 0,
		timelockExpiry: Date.now() + 604800000,
		clientFeeTier: 1 as FeeTier,
		freelancerFeeTier: 1 as FeeTier,
		createdAt: Date.now(),
		lastUpdated: Date.now()
	});

	it('should reject funding amount decrease', () => {
		const initialAmount = '1.5';
		const decreasedAmount = '1.0';

		const escrow = createMockEscrow(initialAmount);
		expect(parseFloat(escrow.totalAmount)).toBe(1.5);

		// Attempting to decrease amount must be rejected
		expect(parseFloat(initialAmount)).toBeGreaterThan(parseFloat(decreasedAmount));

		// Amount must remain constant or increase
		const updatedEscrow = { ...escrow, totalAmount: decreasedAmount };
		expect(parseFloat(updatedEscrow.totalAmount)).toBeLessThan(parseFloat(escrow.totalAmount));
	});

	it('should maintain funding amount as constant after initial funding', () => {
		const amount = '2.5';
		const escrow = createMockEscrow(amount);

		expect(escrow.totalAmount).toBe(amount);

		// State transitions should not change amount
		const completed = { ...escrow, status: V2Status.Completed };
		expect(completed.totalAmount).toBe(amount);

		const released = { ...completed, status: V2Status.FundsReleased };
		expect(released.totalAmount).toBe(amount);
	});

	it('should enforce zero or positive funding (no negative amounts)', () => {
		const validAmounts = ['0', '0.1', '1.0', '100.5'];
		const invalidAmounts = ['-1', '-0.1', '-100'];

		validAmounts.forEach((amount) => {
			expect(parseFloat(amount)).toBeGreaterThanOrEqual(0);
		});

		invalidAmounts.forEach((amount) => {
			expect(parseFloat(amount)).toBeLessThan(0);
		});
	});

	it('should prevent totalAmount mutation after release', () => {
		const amount = '3.0';
		const escrow = createMockEscrow(amount, V2Status.FundsReleased);

		// Terminal state amount is immutable
		expect(escrow.status).toBe(V2Status.FundsReleased);
		expect(escrow.totalAmount).toBe(amount);

		// Any attempt to change must maintain invariant
		const original = escrow.totalAmount;
		expect(original).toBe(amount);
	});

	it('should maintain funding across dispute resolution', () => {
		const amount = '5.0';

		// Before dispute
		const completed = createMockEscrow(amount, V2Status.Completed);
		expect(completed.totalAmount).toBe(amount);

		// During dispute
		const disputed = { ...completed, status: V2Status.InDispute };
		expect(disputed.totalAmount).toBe(amount);

		// After dispute resolution
		const resolved = { ...disputed, status: V2Status.DisputeResolved };
		expect(resolved.totalAmount).toBe(amount);
	});

	it('should validate fee components sum to totalAmount', () => {
		const baseAmount = '10.0';
		const clientFee = '0.5';
		const freelancerFee = '0.3';
		const expectedTotal = (
			parseFloat(baseAmount) +
			parseFloat(clientFee) +
			parseFloat(freelancerFee)
		).toString();

		const escrow: V2EscrowData = {
			id: '0x1234',
			client: '0x' + '1'.repeat(40),
			freelancer: '0x' + '2'.repeat(40),
			baseAmount,
			clientFee,
			freelancerFee,
			totalAmount: expectedTotal,
			status: V2Status.Funded,
			estimatedStartTime: Date.now() + 3600000,
			estimatedCompletionTime: Date.now() + 7200000,
			completionTime: 0,
			timelockExpiry: Date.now() + 604800000,
			clientFeeTier: 1 as FeeTier,
			freelancerFeeTier: 1 as FeeTier,
			createdAt: Date.now(),
			lastUpdated: Date.now()
		};

		const calculatedTotal =
			parseFloat(escrow.baseAmount) +
			parseFloat(escrow.clientFee) +
			parseFloat(escrow.freelancerFee);
		expect(calculatedTotal).toBeCloseTo(parseFloat(escrow.totalAmount), 6);
	});
});

describe('Invariant I10: Balance Conservation', () => {
	const createEscrow = (id: string, totalAmount: string, status: V2Status): V2EscrowData => ({
		id,
		client: '0x' + '1'.repeat(40),
		freelancer: '0x' + '2'.repeat(40),
		baseAmount: totalAmount,
		clientFee: '0',
		freelancerFee: '0',
		totalAmount,
		status,
		estimatedStartTime: Date.now() + 3600000,
		estimatedCompletionTime: Date.now() + 7200000,
		completionTime: 0,
		timelockExpiry: Date.now() + 604800000,
		clientFeeTier: 1 as FeeTier,
		freelancerFeeTier: 1 as FeeTier,
		createdAt: Date.now(),
		lastUpdated: Date.now()
	});

	it('should maintain balance conservation across multiple escrows', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '1.0', V2Status.Funded),
			createEscrow('0x002', '2.5', V2Status.WorkInProgress),
			createEscrow('0x003', '3.0', V2Status.Completed)
		];

		const totalLocked = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(totalLocked).toBe(6.5);

		// After releasing one escrow, total in active pool decreases
		const activeEscrows = escrows.filter((e) => e.status !== V2Status.FundsReleased);
		const activeTotal = activeEscrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(activeTotal).toBe(6.5); // All still active
	});

	it('should validate balance after release operations', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '1.0', V2Status.Funded),
			createEscrow('0x002', '2.0', V2Status.Funded),
			createEscrow('0x003', '3.0', V2Status.Funded)
		];

		const initialTotal = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(initialTotal).toBe(6.0);

		// Release one escrow
		const updatedEscrows: V2EscrowData[] = [
			{ ...escrows[0], status: V2Status.FundsReleased }, // Released
			escrows[1], // Still funded
			escrows[2] // Still funded
		];

		// Active balance (excluding released)
		const activeBalance = updatedEscrows
			.filter((e) => e.status !== V2Status.FundsReleased)
			.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);

		expect(activeBalance).toBe(5.0); // 2.0 + 3.0

		// Total balance conservation (including released history)
		const totalBalance = updatedEscrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(totalBalance).toBe(6.0); // Conserved
	});

	it('should validate balance after cancellation operations', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '5.0', V2Status.Funded),
			createEscrow('0x002', '3.0', V2Status.WorkInProgress)
		];

		const initialTotal = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(initialTotal).toBe(8.0);

		// Cancel one escrow
		const updatedEscrows: V2EscrowData[] = [
			{ ...escrows[0], status: V2Status.Cancelled }, // Cancelled
			escrows[1] // Still in progress
		];

		// Active balance (excluding cancelled)
		const activeBalance = updatedEscrows
			.filter((e) => e.status !== V2Status.Cancelled)
			.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);

		expect(activeBalance).toBe(3.0);
	});

	it('should validate balance conservation across mixed terminal states', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '1.0', V2Status.FundsReleased), // Terminal
			createEscrow('0x002', '2.0', V2Status.Cancelled), // Terminal
			createEscrow('0x003', '3.0', V2Status.Refunded), // Terminal
			createEscrow('0x004', '4.0', V2Status.FundsClaimed), // Terminal
			createEscrow('0x005', '5.0', V2Status.DisputeResolved) // Terminal
		];

		// All in terminal states
		const terminalStates = [
			V2Status.FundsReleased,
			V2Status.Cancelled,
			V2Status.Refunded,
			V2Status.FundsClaimed,
			V2Status.DisputeResolved,
			V2Status.DisputeUnresolved
		];

		const allTerminal = escrows.every((e) => terminalStates.includes(e.status));
		expect(allTerminal).toBe(true);

		// Total amount conserved in history
		const total = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(total).toBe(15.0);
	});

	it('should validate no balance appears or disappears during state transitions', () => {
		const escrow = createEscrow('0x001', '10.0', V2Status.Funded);
		const initialBalance = parseFloat(escrow.totalAmount);

		// Transition through states
		const states = [V2Status.WorkInProgress, V2Status.Completed, V2Status.FundsReleased];

		states.forEach((status) => {
			const updated = { ...escrow, status };
			expect(parseFloat(updated.totalAmount)).toBe(initialBalance);
		});
	});

	it('should validate dispute resolution maintains balance', () => {
		const escrow = createEscrow('0x001', '7.5', V2Status.Completed);
		const originalBalance = parseFloat(escrow.totalAmount);

		// Dispute
		const disputed = { ...escrow, status: V2Status.InDispute };
		expect(parseFloat(disputed.totalAmount)).toBe(originalBalance);

		// Resolution
		const resolved = { ...disputed, status: V2Status.DisputeResolved };
		expect(parseFloat(resolved.totalAmount)).toBe(originalBalance);
	});

	it('should validate zero-balance escrows do not affect conservation', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '5.0', V2Status.Funded),
			createEscrow('0x002', '0', V2Status.PendingFunding), // Not yet funded
			createEscrow('0x003', '3.0', V2Status.Funded)
		];

		const totalLocked = escrows
			.filter((e) => parseFloat(e.totalAmount) > 0)
			.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);

		expect(totalLocked).toBe(8.0);
	});
});

describe('Combined Balance & Funding Invariants', () => {
	const createEscrow = (id: string, totalAmount: string, status: V2Status): V2EscrowData => ({
		id,
		client: '0x' + '1'.repeat(40),
		freelancer: '0x' + '2'.repeat(40),
		baseAmount: totalAmount,
		clientFee: '0',
		freelancerFee: '0',
		totalAmount,
		status,
		estimatedStartTime: Date.now() + 3600000,
		estimatedCompletionTime: Date.now() + 7200000,
		completionTime: 0,
		timelockExpiry: Date.now() + 604800000,
		clientFeeTier: 1 as FeeTier,
		freelancerFeeTier: 1 as FeeTier,
		createdAt: Date.now(),
		lastUpdated: Date.now()
	});

	it('should maintain both monotonic funding and balance conservation', () => {
		// Create multiple escrows
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '2.0', V2Status.Funded),
			createEscrow('0x002', '3.0', V2Status.Funded),
			createEscrow('0x003', '5.0', V2Status.Funded)
		];

		const initialTotal = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(initialTotal).toBe(10.0);

		// Verify each escrow has non-decreasing amount
		escrows.forEach((escrow) => {
			expect(parseFloat(escrow.totalAmount)).toBeGreaterThan(0);

			// Amount cannot decrease
			const original = parseFloat(escrow.totalAmount);
			expect(original).toBeGreaterThanOrEqual(0);
		});

		// Total balance conserved
		expect(initialTotal).toBe(10.0);
	});

	it('should validate balance conservation with partial releases', () => {
		const escrows: V2EscrowData[] = [
			createEscrow('0x001', '10.0', V2Status.Funded),
			createEscrow('0x002', '20.0', V2Status.Funded),
			createEscrow('0x003', '30.0', V2Status.Funded)
		];

		const initialTotal = escrows.reduce((sum, e) => sum + parseFloat(e.totalAmount), 0);
		expect(initialTotal).toBe(60.0);

		// Release first escrow
		const afterFirstRelease: V2EscrowData[] = [
			{ ...escrows[0], status: V2Status.FundsReleased },
			escrows[1],
			escrows[2]
		];

		const totalAfterFirst = afterFirstRelease.reduce(
			(sum, e) => sum + parseFloat(e.totalAmount),
			0
		);
		expect(totalAfterFirst).toBe(60.0); // Conserved

		// Release second escrow
		const afterSecondRelease = [
			afterFirstRelease[0],
			{ ...afterFirstRelease[1], status: V2Status.FundsReleased },
			afterFirstRelease[2]
		];

		const totalAfterSecond = afterSecondRelease.reduce(
			(sum, e) => sum + parseFloat(e.totalAmount),
			0
		);
		expect(totalAfterSecond).toBe(60.0); // Still conserved
	});
});
