import { beforeEach, describe, expect, it } from 'vitest';
import { clearAcceptanceLedger } from '$lib/utils/service-quote/acceptance-ledger';
import {
	beginServiceProposalAcceptance,
	completeServiceProposalAcceptance,
	markServiceProposalAcceptanceUnknown,
	createServicePurchaseKey,
	validateServiceProposalAcceptance
} from '$lib/utils/service-quote/accept';

describe('service-quote acceptance helpers', () => {
	beforeEach(() => {
		clearAcceptanceLedger();
	});

	it('fails closed for invalid timing windows and expired proposals', () => {
		expect(
			validateServiceProposalAcceptance({
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: 'service-address',
				estimatedStartTime: 200,
				estimatedEndTime: 150,
				expirationTimestamp: 500,
				nowSeconds: 100
			})
		).toEqual({ ok: false, errorCode: 'invalid_time_bounds' });

		expect(
			validateServiceProposalAcceptance({
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: 'service-address',
				estimatedStartTime: 50,
				estimatedEndTime: 150,
				expirationTimestamp: 500,
				nowSeconds: 100
			})
		).toEqual({ ok: true });

		expect(
			validateServiceProposalAcceptance({
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: 'service-address',
				estimatedStartTime: 150,
				estimatedEndTime: 250,
				expirationTimestamp: 100,
				nowSeconds: 100
			})
		).toEqual({ ok: false, errorCode: 'expired' });
	});

	it('generates deterministic purchase keys per mode', () => {
		expect(createServicePurchaseKey('quote', 'pr_valid123')).toBe(
			createServicePurchaseKey('quote', 'pr_valid123')
		);
		expect(createServicePurchaseKey('quote', 'pr_valid123')).not.toBe(
			createServicePurchaseKey('instant_buy', 'pr_valid123')
		);
	});

	it('reconciles acceptance ledger transitions for verified and failed publishes', () => {
		const started = beginServiceProposalAcceptance('pr_valid123', '0xabc');
		expect(started.state).toBe('accepting');
		expect(started.attempts[0].transactionHash).toBe('0xabc');

		const accepted = completeServiceProposalAcceptance(
			'pr_valid123',
			true,
			false,
			undefined,
			'0xabc'
		);
		expect(accepted?.state).toBe('accepted');
		expect(accepted?.attemptCount).toBe(2);
		expect(accepted?.attempts[1]?.transactionHash).toBe('0xabc');

		beginServiceProposalAcceptance('pr_failed456');
		const failed = completeServiceProposalAcceptance('pr_failed456', false, true);
		expect(failed?.state).toBe('accept_failed');
	});

	it('records acceptance ambiguity reason codes for timeout and reconciliation deferral', () => {
		beginServiceProposalAcceptance('pr_timeout123', '0xtimeout');
		const timedOut = markServiceProposalAcceptanceUnknown(
			'pr_timeout123',
			'pending_timeout',
			'0xtimeout'
		);
		expect(timedOut.state).toBe('accept_unknown');
		expect(timedOut.attempts.at(-1)?.reasonCode).toBe('pending_timeout');

		beginServiceProposalAcceptance('pr_reconcile123', '0xreconcile');
		const reconciled = completeServiceProposalAcceptance(
			'pr_reconcile123',
			false,
			false,
			'reconciliation_deferred',
			'0xreconcile'
		);
		expect(reconciled?.state).toBe('accept_unknown');
		expect(reconciled?.attempts.at(-1)?.reasonCode).toBe('reconciliation_deferred');
		expect(reconciled?.attempts.at(-1)?.transactionHash).toBe('0xreconcile');
	});

	it('allows accepted attempts to downgrade to unknown and later reconfirm', () => {
		beginServiceProposalAcceptance('pr_reorg123', '0xreorg');
		const accepted = completeServiceProposalAcceptance(
			'pr_reorg123',
			true,
			false,
			undefined,
			'0xreorg'
		);
		expect(accepted?.state).toBe('accepted');

		const downgraded = completeServiceProposalAcceptance(
			'pr_reorg123',
			false,
			false,
			'rpc_unavailable',
			'0xreorg'
		);
		expect(downgraded?.state).toBe('accept_unknown');
		expect(downgraded?.attempts.at(-1)?.reasonCode).toBe('rpc_unavailable');

		const reconfirmed = completeServiceProposalAcceptance(
			'pr_reorg123',
			true,
			false,
			undefined,
			'0xreorg'
		);
		expect(reconfirmed?.state).toBe('accepted');
		expect(reconfirmed?.attempts).toHaveLength(4);
		expect(reconfirmed?.attempts.at(-1)?.transactionHash).toBe('0xreorg');
	});

	it('returns null when a completion arrives without a tracked attempt', () => {
		expect(completeServiceProposalAcceptance('pr_missing000', true, false)).toBeNull();
	});
});
