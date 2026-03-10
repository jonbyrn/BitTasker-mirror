import { describe, it, expect } from 'vitest';
import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

describe('taskStatusBadge', () => {
	describe('getStatusBadge', () => {
		it('should return badge for OPEN status', () => {
			expect(getStatusBadge(TaskStatusEnum.OPEN)).toEqual({
				color: 'badge-success',
				text: 'OPEN'
			});
		});

		it('should return badge for BID_ACCEPTED', () => {
			expect(getStatusBadge(TaskStatusEnum.BID_ACCEPTED)).toEqual({
				color: 'badge-info',
				text: 'BID ACCEPTED'
			});
		});

		it('should return badge for ESCROW_FUNDED', () => {
			expect(getStatusBadge(TaskStatusEnum.ESCROW_FUNDED)).toEqual({
				color: 'badge-info',
				text: 'ESCROW FUNDED'
			});
		});

		it('should return badge for IN_PROGRESS', () => {
			expect(getStatusBadge(TaskStatusEnum.IN_PROGRESS)).toEqual({
				color: 'badge-warning',
				text: 'IN PROGRESS'
			});
		});

		it('should return badge for COMPLETED', () => {
			expect(getStatusBadge(TaskStatusEnum.COMPLETED)).toEqual({
				color: 'badge-success',
				text: 'COMPLETED'
			});
		});

		it('should return badge for CANCELLED', () => {
			expect(getStatusBadge(TaskStatusEnum.CANCELLED)).toEqual({
				color: 'badge-error',
				text: 'CANCELLED'
			});
		});

		it('should return badge for DISPUTED', () => {
			expect(getStatusBadge(TaskStatusEnum.DISPUTED)).toEqual({
				color: 'badge-error',
				text: 'DISPUTED'
			});
		});

		it('should return badge-neutral and status for unknown status', () => {
			const result = getStatusBadge(999 as unknown as TaskStatusEnum);
			expect(result.color).toBe('badge-neutral');
			expect(result.text).toBe(999); // default returns status as-is (number)
		});
	});
});
