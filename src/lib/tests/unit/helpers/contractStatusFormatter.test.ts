import { describe, it, expect } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow';
import {
	getStatusMessages,
	getStatusTranslationKey,
	getStatusColorClass,
	getActionDescription
} from '$lib/utils/helpers/contractStatusFormatter';

describe('contractStatusFormatter', () => {
	describe('getStatusMessages', () => {
		it('should return messages for PendingCompletion', () => {
			const result = getStatusMessages(EscrowStatus.PendingCompletion);
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.task_completing_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.task_completed_message');
			expect(result.successToast).toBe('dashboard.contracts.actions.task_completed_success');
			expect(result.errorToast).toBe('dashboard.contracts.actions.task_completed_error');
		});

		it('should return messages for PendingAcceptance', () => {
			const result = getStatusMessages(EscrowStatus.PendingAcceptance);
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.task_accepting_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.payment_released_message');
		});

		it('should return messages for PendingDispute', () => {
			const result = getStatusMessages(EscrowStatus.PendingDispute);
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.dispute_raising_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.dispute_raised_message');
		});

		it('should return messages for PendingCancellation', () => {
			const result = getStatusMessages(EscrowStatus.PendingCancellation);
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.escrow_cancelling_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.escrow_cancelled_message');
		});

		it('should return unknown_error for unknown status (default)', () => {
			const result = getStatusMessages(999 as EscrowStatus);
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.unknown_error');
			expect(result.successToast).toBe('dashboard.contracts.actions.unknown_error');
			expect(result.errorToast).toBe('dashboard.contracts.actions.unknown_error');
		});
	});

	describe('getStatusTranslationKey', () => {
		it('should return translation key for Funded', () => {
			expect(getStatusTranslationKey(EscrowStatus.Funded)).toBe('dashboard.contracts.status.funded');
		});

		it('should return translation key for InDispute', () => {
			expect(getStatusTranslationKey(EscrowStatus.InDispute)).toBe('dashboard.contracts.status.in_dispute');
		});

		it('should return translation key for Completed', () => {
			expect(getStatusTranslationKey(EscrowStatus.Completed)).toBe('dashboard.contracts.status.completed');
		});

		it('should return translation key for Cancelled', () => {
			expect(getStatusTranslationKey(EscrowStatus.Cancelled)).toBe('dashboard.contracts.status.cancelled');
		});

		it('should return funded for unknown status (default)', () => {
			expect(getStatusTranslationKey(999 as EscrowStatus)).toBe('dashboard.contracts.status.funded');
		});
	});

	describe('getStatusColorClass', () => {
		it('should return badge-primary for InProgress and PendingFunding', () => {
			expect(getStatusColorClass(EscrowStatus.InProgress)).toBe('badge-primary');
			expect(getStatusColorClass(EscrowStatus.PendingFunding)).toBe('badge-primary');
		});

		it('should return badge-success for Completed, FundsReleased, DisputeResolved', () => {
			expect(getStatusColorClass(EscrowStatus.Completed)).toBe('badge-success');
			expect(getStatusColorClass(EscrowStatus.FundsReleased)).toBe('badge-success');
			expect(getStatusColorClass(EscrowStatus.DisputeResolved)).toBe('badge-success');
		});

		it('should return badge-info for Funded and pending states', () => {
			expect(getStatusColorClass(EscrowStatus.Funded)).toBe('badge-info');
			expect(getStatusColorClass(EscrowStatus.PendingCompletion)).toBe('badge-info');
		});

		it('should return badge-warning for dispute states', () => {
			expect(getStatusColorClass(EscrowStatus.InDispute)).toBe('badge-warning');
			expect(getStatusColorClass(EscrowStatus.PendingDispute)).toBe('badge-warning');
		});

		it('should return badge-error for Cancelled and PendingCancellation', () => {
			expect(getStatusColorClass(EscrowStatus.Cancelled)).toBe('badge-error');
			expect(getStatusColorClass(EscrowStatus.PendingCancellation)).toBe('badge-error');
		});

		it('should return badge-neutral for unknown status (default)', () => {
			expect(getStatusColorClass(999 as EscrowStatus)).toBe('badge-neutral');
		});
	});

	describe('getActionDescription', () => {
		it('should return action key for Completed', () => {
			expect(getActionDescription(EscrowStatus.Completed)).toBe('dashboard.contracts.status.task_completed');
		});

		it('should return action key for PendingCompletion', () => {
			expect(getActionDescription(EscrowStatus.PendingCompletion)).toBe(
				'dashboard.contracts.status.pending_completion'
			);
		});

		it('should return action key for FundsReleased', () => {
			expect(getActionDescription(EscrowStatus.FundsReleased)).toBe(
				'dashboard.contracts.status.funds_released'
			);
		});

		it('should return action key for InDispute', () => {
			expect(getActionDescription(EscrowStatus.InDispute)).toBe('dashboard.contracts.status.dispute_raised');
		});

		it('should return action key for Cancelled', () => {
			expect(getActionDescription(EscrowStatus.Cancelled)).toBe(
				'dashboard.contracts.status.escrow_cancelled'
			);
		});

		it('should return string for unknown status (default)', () => {
			expect(getActionDescription(999 as EscrowStatus)).toBe('999');
		});
	});
});
