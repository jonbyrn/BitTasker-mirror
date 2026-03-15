import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { myTasksStore, taskStore, tasksStore, TASKS_PER_PAGE } from '$lib/stores/task.store';
import type { Task } from '$lib/types/task.d';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$app/state', () => ({
	page: { url: { searchParams: new URLSearchParams() } }
}));

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: readable({ pool: {} })
	};
});

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

	describe('taskStore', () => {
		beforeEach(async () => {
			vi.clearAllMocks();
			await taskStore.clearDraft(false);
			await taskStore.clearDraft(true);
		});

		it('normalizes legacy BSC network-only drafts to the USDT rail when loading', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({
					id: 'draft-1',
					uniqueId: 'task:draft-1',
					task: {
						title: 'Legacy BSC draft',
						paymentNetwork: 'bsc-testnet'
					}
				})
			});

			await taskStore.loadDraft(false);

			const state = get(taskStore);
			expect(state.task.paymentAsset).toBe('USDT');
			expect(state.task.paymentNetwork).toBe('bsc-testnet');
		});

		it('normalizes legacy USDT drafts without a network to the default BSC network when loading', async () => {
			const { Preferences } = await import('@capacitor/preferences');
			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({
					id: 'draft-2',
					uniqueId: 'task:draft-2',
					task: {
						title: 'Legacy asset-only draft',
						paymentAsset: 'USDT'
					}
				})
			});

			await taskStore.loadDraft(false);

			const state = get(taskStore);
			expect(state.task.paymentAsset).toBe('USDT');
			expect(state.task.paymentNetwork).toBe('bsc-testnet');
		});

		it('normalizes edit drafts before persisting them when only the BSC network is present', async () => {
			const { Preferences } = await import('@capacitor/preferences');

			await taskStore.saveEditTaskDraft(
				'task-123',
				'task:task-123',
				{
					title: 'Legacy task',
					description: 'Needs the BSC rail preserved',
					taskType: 'remote',
					budget: {
						amount: 25,
						currency: 'USD',
						type: 'fixed',
						estimatedHours: 0
					},
					paymentNetwork: 'bsc-testnet',
					categories: [],
					skills: [],
					attachments: []
				} as any
			);

			const state = get(taskStore);
			expect(state.task.paymentAsset).toBe('USDT');
			expect(state.task.paymentNetwork).toBe('bsc-testnet');

			const persistedDraft = JSON.parse(vi.mocked(Preferences.set).mock.calls[0][0].value);
			expect(persistedDraft.task).toMatchObject({
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			});
		});
	});
});
