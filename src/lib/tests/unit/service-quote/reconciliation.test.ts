import { describe, expect, it } from 'vitest';
import { reconcileServiceAcceptanceState } from '$lib/utils/service-quote/reconciliation';
import type { ServiceAcceptanceLedgerEntry, ServiceAcceptanceLedgerState } from '$lib/utils/service-quote/acceptance-ledger';

describe('service-quote acceptance reconciliation', () => {
	it('returns idle when no ledger entry exists', () => {
		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry: null,
				hasVerifiedEscrow: false,
				hasPublishFailure: false
			})
		).toBe('idle');
	});

	it('prioritizes verified escrow over publish failures and otherwise preserves ledger state', () => {
		const ledgerEntry: ServiceAcceptanceLedgerEntry = {
			proposalId: 'pr_valid123',
			state: 'accepting' as ServiceAcceptanceLedgerState,
			attemptCount: 1,
			lastUpdatedAt: 1,
			attempts: [{ attemptNumber: 1, state: 'accepting' as ServiceAcceptanceLedgerState, timestamp: 1 }]
		};

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry,
				hasVerifiedEscrow: true,
				hasPublishFailure: true
			})
		).toBe('accepted');

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry,
				hasVerifiedEscrow: false,
				hasPublishFailure: true
			})
		).toBe('accept_failed');

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry: {
					...ledgerEntry,
					state: 'accept_unknown'
				},
				hasVerifiedEscrow: false,
				hasPublishFailure: false
			})
		).toBe('accept_unknown');
	});

	it('maps explicit ambiguity reasons to accept_unknown', () => {
		const ledgerEntry: ServiceAcceptanceLedgerEntry = {
			proposalId: 'pr_valid123',
			state: 'accepting' as ServiceAcceptanceLedgerState,
			attemptCount: 1,
			lastUpdatedAt: 1,
			attempts: [{ attemptNumber: 1, state: 'accepting' as ServiceAcceptanceLedgerState, timestamp: 1 }]
		};

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry,
				hasVerifiedEscrow: false,
				hasPublishFailure: false,
				unknownReasonCode: 'pending_timeout'
			})
		).toBe('accept_unknown');

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry,
				hasVerifiedEscrow: false,
				hasPublishFailure: false,
				unknownReasonCode: 'tx_replaced'
			})
		).toBe('accept_unknown');
	});

	it('allows a previously accepted ledger entry to downgrade and later reconfirm', () => {
		const acceptedLedgerEntry: ServiceAcceptanceLedgerEntry = {
			proposalId: 'pr_valid123',
			state: 'accepted' as ServiceAcceptanceLedgerState,
			attemptCount: 2,
			lastUpdatedAt: 2,
			attempts: [
				{ attemptNumber: 1, state: 'accepted' as ServiceAcceptanceLedgerState, timestamp: 1 },
				{ attemptNumber: 2, state: 'accepted' as ServiceAcceptanceLedgerState, timestamp: 2 }
			]
		};

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry: acceptedLedgerEntry,
				hasVerifiedEscrow: false,
				hasPublishFailure: false,
				unknownReasonCode: 'rpc_unavailable'
			})
		).toBe('accept_unknown');

		expect(
			reconcileServiceAcceptanceState({
				ledgerEntry: {
					...acceptedLedgerEntry,
					state: 'accept_unknown'
				},
				hasVerifiedEscrow: true,
				hasPublishFailure: false
			})
		).toBe('accepted');
	});
});
