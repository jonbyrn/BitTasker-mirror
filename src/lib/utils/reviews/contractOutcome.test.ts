import { describe, expect, it } from 'vitest';
import { ContractStatus } from '$lib/utils/contract/types';
import { resolveContractOutcomeFromStatus } from './contractOutcome';

describe('resolveContractOutcomeFromStatus', () => {
	it('maps funds-released style outcomes to completed', () => {
		expect(resolveContractOutcomeFromStatus(ContractStatus.FundsReleased)).toBe('completed');
		expect(resolveContractOutcomeFromStatus(ContractStatus.FundsClaimed)).toBe('completed');
	});

	it('maps dispute resolved to disputed_resolved_payout', () => {
		expect(resolveContractOutcomeFromStatus(ContractStatus.DisputeResolved)).toBe(
			'disputed_resolved_payout'
		);
	});

	it('maps refund paths to refunded', () => {
		expect(resolveContractOutcomeFromStatus(ContractStatus.Refunded)).toBe('refunded');
		expect(resolveContractOutcomeFromStatus(ContractStatus.DisputeUnresolved)).toBe('refunded');
	});
});
