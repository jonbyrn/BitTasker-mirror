import { describe, it, expect } from 'vitest';
import {
	getStatusTranslationKey,
	getStatusColorClass
} from '$lib/utils/helpers/contractStatusFormatterV2';
import { ContractStatus, DisplayOnlyStatus } from '$lib/utils/contract/types';

describe('contractStatusFormatterV2', () => {
	describe('getStatusTranslationKey', () => {
		it('maps no-show and work-in-progress chain states', () => {
			expect(getStatusTranslationKey(ContractStatus.NoShow)).toBe(
				'dashboard.contracts.status.no_show'
			);
			expect(getStatusTranslationKey(ContractStatus.WorkInProgress)).toBe(
				'dashboard.contracts.status.work_in_progress'
			);
		});

		it('maps InDisputeWorkInProgress (11) to in_dispute, not Nostr-only in_progress', () => {
			expect(getStatusTranslationKey(ContractStatus.InDisputeWorkInProgress)).toBe(
				'dashboard.contracts.status.in_dispute'
			);
		});

		it('keeps DisplayOnlyStatus.InProgress separate from chain state 11', () => {
			expect(DisplayOnlyStatus.InProgress).not.toBe(ContractStatus.InDisputeWorkInProgress);
			expect(getStatusTranslationKey(DisplayOnlyStatus.InProgress)).toBe(
				'dashboard.contracts.status.in_progress'
			);
		});

		it('maps Failed display status to failed key', () => {
			expect(getStatusTranslationKey(DisplayOnlyStatus.Failed)).toBe(
				'dashboard.contracts.status.failed'
			);
		});
	});

	describe('getStatusColorClass', () => {
		it('uses warning for NoShow and dispute-with-timelock', () => {
			expect(getStatusColorClass(ContractStatus.NoShow)).toBe('badge-warning');
			expect(getStatusColorClass(ContractStatus.InDisputeWorkInProgress)).toBe('badge-warning');
		});

		it('uses primary for WorkInProgress', () => {
			expect(getStatusColorClass(ContractStatus.WorkInProgress)).toBe('badge-primary');
		});

		it('uses error for Failed', () => {
			expect(getStatusColorClass(DisplayOnlyStatus.Failed)).toBe('badge-error');
		});
	});
});
