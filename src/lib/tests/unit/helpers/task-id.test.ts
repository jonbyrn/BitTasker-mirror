import { describe, it, expect } from 'vitest';
import { getTaskId } from '$lib/utils/helpers/task-id';
import type { Task } from '$lib/types/task';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

/** Minimal task-like object for testing getTaskId */
function taskWithId(id: string): Task {
	return {
		id,
		title: 'Test',
		description: '',
		npub: 'npub1test',
		status: TaskStatusEnum.OPEN,
		taskType: TaskTypeEnum.IN_PERSON,
		estimatedHours: 1,
		budget: { amount: 100, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline: null,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: 0,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: []
	};
}

describe('task-id', () => {
	describe('getTaskId', () => {
		it('should return task id (event id)', () => {
			const id = 'abc123eventid';
			expect(getTaskId(taskWithId(id))).toBe(id);
		});

		it('should return empty string when task id is empty', () => {
			expect(getTaskId(taskWithId(''))).toBe('');
		});

		it('should return nostr-style event id unchanged', () => {
			const eventId = '7f5e8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f';
			expect(getTaskId(taskWithId(eventId))).toBe(eventId);
		});
	});
});
