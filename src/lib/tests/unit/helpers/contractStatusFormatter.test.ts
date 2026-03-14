import { describe, it, expect } from 'vitest';
import { EscrowStatus as V1EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { EscrowStatus as V2EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';
import {
	getStatusMessages,
	getStatusTranslationKey,
	getStatusColorClass,
	getActionDescription
} from '$lib/utils/helpers/contractStatusFormatter';

describe('contractStatusFormatter', () => {
	describe('getStatusMessages', () => {
		it('should return messages for PendingCompletion', () => {
			const result = getStatusMessages(V1EscrowStatus.PendingCompletion, 'v1');
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.task_completing_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.task_completed_message');
			expect(result.successToast).toBe('dashboard.contracts.actions.task_completed_success');
			expect(result.errorToast).toBe('dashboard.contracts.actions.task_completed_error');
		});

		it('should return messages for PendingAcceptance', () => {
			const result = getStatusMessages(V1EscrowStatus.PendingAcceptance, 'v1');
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.task_accepting_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.payment_released_message');
		});

		it('should return messages for PendingDispute', () => {
			const result = getStatusMessages(V1EscrowStatus.PendingDispute, 'v1');
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.dispute_raising_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.dispute_raised_message');
		});

		it('should return messages for PendingCancellation', () => {
			const result = getStatusMessages(V1EscrowStatus.PendingCancellation, 'v1');
			expect(result.pendingMessage).toBe('dashboard.contracts.actions.escrow_cancelling_message');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.escrow_cancelled_message');
		});

		it('should return unknown_error for unknown status (default)', () => {
			const result = getStatusMessages(999 as V1EscrowStatus, 'v1');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.unknown_error');
			expect(result.successToast).toBe('dashboard.contracts.actions.unknown_error');
			expect(result.errorToast).toBe('dashboard.contracts.actions.unknown_error');
		});
		it('should decode v2 FundsReleased without colliding with v1 InProgress', () => {
			const result = getStatusMessages(V2EscrowStatus.FundsReleased, 'v2');
			expect(result.confirmedMessage).toBe('dashboard.contracts.actions.payment_released_message');
		});
	});

	describe('getStatusTranslationKey', () => {
		it('should return translation key for Funded', () => {
			expect(getStatusTranslationKey(V1EscrowStatus.Funded, 'v1')).toBe(
				'dashboard.contracts.status.funded'
			);
		});

		it('should return translation key for InDispute', () => {
			expect(getStatusTranslationKey(V1EscrowStatus.InDispute, 'v1')).toBe(
				'dashboard.contracts.status.in_dispute'
			);
		});

		it('should return translation key for Completed', () => {
			expect(getStatusTranslationKey(V1EscrowStatus.Completed, 'v1')).toBe(
				'dashboard.contracts.status.completed'
			);
		});

		it('should return translation key for Cancelled', () => {
			expect(getStatusTranslationKey(V1EscrowStatus.Cancelled, 'v1')).toBe(
				'dashboard.contracts.status.cancelled'
			);
		});

		it('should return funded for unknown status (default)', () => {
			expect(getStatusTranslationKey(999 as V1EscrowStatus, 'v1')).toBe(
				'dashboard.contracts.status.funded'
			);
		});

		it('should decode v2 status 7 as funds released', () => {
			expect(getStatusTranslationKey(V2EscrowStatus.FundsReleased, 'v2')).toBe(
				'dashboard.contracts.status.funds_released'
			);
		});
	});

	describe('getStatusColorClass', () => {
		it('should return badge-primary for InProgress and PendingFunding', () => {
			expect(getStatusColorClass(V1EscrowStatus.InProgress, 'v1')).toBe('badge-primary');
			expect(getStatusColorClass(V1EscrowStatus.PendingFunding, 'v1')).toBe('badge-primary');
		});

		it('should return badge-success for Completed, FundsReleased, DisputeResolved', () => {
			expect(getStatusColorClass(V1EscrowStatus.Completed, 'v1')).toBe('badge-success');
			expect(getStatusColorClass(V1EscrowStatus.FundsReleased, 'v1')).toBe('badge-success');
			expect(getStatusColorClass(V1EscrowStatus.DisputeResolved, 'v1')).toBe('badge-success');
		});

		it('should return badge-info for Funded and pending states', () => {
			expect(getStatusColorClass(V1EscrowStatus.Funded, 'v1')).toBe('badge-info');
			expect(getStatusColorClass(V1EscrowStatus.PendingCompletion, 'v1')).toBe('badge-info');
		});

		it('should return badge-warning for dispute states', () => {
			expect(getStatusColorClass(V1EscrowStatus.InDispute, 'v1')).toBe('badge-warning');
			expect(getStatusColorClass(V1EscrowStatus.PendingDispute, 'v1')).toBe('badge-warning');
		});

		it('should return badge-error for Cancelled and PendingCancellation', () => {
			expect(getStatusColorClass(V1EscrowStatus.Cancelled, 'v1')).toBe('badge-error');
			expect(getStatusColorClass(V1EscrowStatus.PendingCancellation, 'v1')).toBe('badge-error');
		});

		it('should return badge-neutral for unknown status (default)', () => {
			expect(getStatusColorClass(999 as V1EscrowStatus, 'v1')).toBe('badge-neutral');
		});

		it('should decode v2 status 10 as work in progress instead of v1 funds released', () => {
			expect(getStatusColorClass(V2EscrowStatus.WorkInProgress, 'v2')).toBe('badge-success');
		});
	});

	describe('getActionDescription', () => {
		it('should return action key for Completed', () => {
			expect(getActionDescription(V1EscrowStatus.Completed, 'v1')).toBe(
				'dashboard.contracts.status.task_completed'
			);
		});

		it('should return action key for PendingCompletion', () => {
			expect(getActionDescription(V1EscrowStatus.PendingCompletion, 'v1')).toBe(
				'dashboard.contracts.status.pending_completion'
			);
		});

		it('should return action key for FundsReleased', () => {
			expect(getActionDescription(V1EscrowStatus.FundsReleased, 'v1')).toBe(
				'dashboard.contracts.status.funds_released'
			);
		});

		it('should return action key for InDispute', () => {
			expect(getActionDescription(V1EscrowStatus.InDispute, 'v1')).toBe(
				'dashboard.contracts.status.dispute_raised'
			);
		});

		it('should return action key for Cancelled', () => {
			expect(getActionDescription(V1EscrowStatus.Cancelled, 'v1')).toBe(
				'dashboard.contracts.status.escrow_cancelled'
			);
		});

		it('should return string for unknown status (default)', () => {
			expect(getActionDescription(999 as V1EscrowStatus, 'v1')).toBe('999');
		});

		it('should decode v2 status 7 action as funds released', () => {
			expect(getActionDescription(V2EscrowStatus.FundsReleased, 'v2')).toBe(
				'dashboard.contracts.status.funds_released'
			);
		});
	});
});
