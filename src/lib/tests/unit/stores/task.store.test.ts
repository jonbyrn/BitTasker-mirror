import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	myTasksStore,
	tasksStore,
	TASK_LIST_PAGE_SIZE,
	TASKS_PER_PAGE
} from '$lib/stores/task.store';
import type { Task } from '$lib/types/task.d';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

vi.mock('$app/state', () => ({
	page: { url: { searchParams: new URLSearchParams() } }
}));

const createMockTask = (overrides: Partial<Task> = {}): Task =>
	({
		id: 'task-1',
		npub: 'npub1test',
		status: TaskStatusEnum.OPEN,
		title: 'Test Task',
		description: 'Test',
		taskType: 'delivery',
		budget: { amount: 100, currency: 'USD', type: 'fixed' },
		deadline: null,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		attachments: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: Date.now(),
		updatedAt: new Date().toISOString(),
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		estimatedHours: 0,
		...overrides
	}) as Task;

describe('task.store', () => {
	describe('TASKS_PER_PAGE', () => {
		it('should be a positive number', () => {
			expect(TASKS_PER_PAGE).toBe(10);
			expect(TASKS_PER_PAGE).toBeGreaterThan(0);
			expect(TASK_LIST_PAGE_SIZE).toBe(200);
		});
	});

	describe('myTasksStore', () => {
		beforeEach(() => {
			myTasksStore.reset();
		});

		it('should have initial state with empty items and no error', () => {
			const state = get(myTasksStore);
			expect(state.items).toEqual([]);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.currentPage).toBe(1);
			expect(state.hasMore).toBe(true);
		});

		it('should update items and loading via update', () => {
			const tasks = [createMockTask({ id: 't1' }), createMockTask({ id: 't2' })];
			myTasksStore.update((s) => ({
				...s,
				items: tasks,
				loading: false
			}));
			const state = get(myTasksStore);
			expect(state.items).toHaveLength(2);
			expect(state.items[0].id).toBe('t1');
			expect(state.loading).toBe(false);
		});

		it('should update error state', () => {
			myTasksStore.update((s) => ({ ...s, error: 'Network error' }));
			expect(get(myTasksStore).error).toBe('Network error');
		});

		it('should reset to initial state', () => {
			myTasksStore.update((s) => ({
				...s,
				items: [createMockTask()],
				loading: true,
				error: 'Error',
				currentPage: 5,
				hasMore: false
			}));
			myTasksStore.reset();
			const state = get(myTasksStore);
			expect(state.items).toEqual([]);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.currentPage).toBe(1);
			expect(state.hasMore).toBe(true);
		});
	});

	describe('tasksStore', () => {
		beforeEach(() => {
			tasksStore.reset();
		});

		it('should have pool and initial state shape after reset', () => {
			const state = get(tasksStore);
			expect(state.pool).toBeDefined();
			expect(state.items).toEqual([]);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.currentPage).toBe(1);
			expect(state.hasMore).toBe(true);
			expect(state.searchParamsKey).toBe('');
		});

		it('should reset to initial state preserving pool', () => {
			const tasks = [createMockTask({ id: 'a' })];
			tasksStore.set({
				...get(tasksStore),
				items: tasks,
				loading: true,
				error: 'Fail',
				currentPage: 3,
				hasMore: false,
				searchParamsKey: 'x'
			});
			const poolBefore = get(tasksStore).pool;
			tasksStore.reset();
			const state = get(tasksStore);
			expect(state.pool).toBe(poolBefore);
			expect(state.items).toEqual([]);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.currentPage).toBe(1);
			expect(state.hasMore).toBe(true);
			expect(state.searchParamsKey).toBe('');
		});
	});
});
