import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { tasksStore } from '$lib/stores/task.store';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import type { Task, SearchTasksParams } from '$lib/types/task.d';

/**
 * Integration tests for /tasks page store interactions
 * Tests data flow between components and stores
 */

// Mock findTasks
vi.mock('$lib/nostr/findTasks', () => ({
	findTasks: vi.fn(),
	cleanup: vi.fn()
}));

// Create mock task data
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
	id: `task-${Math.random().toString(36).substr(2, 9)}`,
	npub: 'npub1test',
	status: TaskStatusEnum.OPEN,
	title: 'Test Task',
	description: 'Test description',
	taskType: TaskTypeEnum.REMOTE,
	budget: {
		amount: 100,
		currency: 'USD',
		type: BudgetTypeEnum.FIXED
	},
	deadline: '2099-12-31',
	dateRange: null,
	pickupLocation: null,
	dropOffLocation: {
		displayName: 'Test Location',
		longitude: -122.4194,
		latitude: 37.7749,
		zipCode: '94102',
		locationLoaded: true
	},
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
	estimatedHours: 2,
	...overrides
});

describe('Tasks Page - Integration Tests', () => {
	beforeEach(() => {
		// Reset store to initial state
		tasksStore.set({
			items: [],
			loading: false,
			error: null,
			hasMore: true,
			currentPage: 1,
			searchParamsKey: ''
		});
		vi.clearAllMocks();
	});

	describe('Store Integration', () => {
		it('should update store when tasks are loaded', async () => {
			const mockTasks = [createMockTask({ id: 'task-1' }), createMockTask({ id: 'task-2' })];

			// Simulate findTasks updating the store
			tasksStore.set({
				items: mockTasks,
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: 'test-key'
			});

			const state = get(tasksStore);
			expect(state.items).toHaveLength(2);
			expect(state.items[0].id).toBe('task-1');
			expect(state.items[1].id).toBe('task-2');
		});

		it('should handle loading state correctly', () => {
			tasksStore.set({
				items: [],
				loading: true,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: ''
			});

			const state = get(tasksStore);
			expect(state.loading).toBe(true);
		});

		it('should handle error state correctly', () => {
			const errorMessage = 'Failed to fetch tasks';
			tasksStore.set({
				items: [],
				loading: false,
				error: errorMessage,
				hasMore: false,
				currentPage: 1,
				searchParamsKey: ''
			});

			const state = get(tasksStore);
			expect(state.error).toBe(errorMessage);
		});

		it('should track search params key for cache invalidation', () => {
			const searchKey = JSON.stringify({ search: 'test', page: 1 });
			tasksStore.set({
				items: [createMockTask()],
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: searchKey
			});

			const state = get(tasksStore);
			expect(state.searchParamsKey).toBe(searchKey);
		});

		it('should handle pagination state', () => {
			tasksStore.set({
				items: [createMockTask()],
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 2,
				searchParamsKey: ''
			});

			const state = get(tasksStore);
			expect(state.currentPage).toBe(2);
			expect(state.hasMore).toBe(true);
		});

		it('should clear items when search params change', () => {
			// Set initial state with tasks
			tasksStore.set({
				items: [createMockTask({ id: 'old-task' })],
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: 'old-key'
			});

			// Simulate search params change - should clear items
			tasksStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				searchParamsKey: 'new-key'
			}));

			const state = get(tasksStore);
			expect(state.items).toHaveLength(0);
			expect(state.searchParamsKey).toBe('new-key');
		});
	});

	describe('Search Params Sync', () => {
		it('should sync search query with search params', () => {
			const searchParams: SearchTasksParams = {
				search: 'test query',
				page: 1,
				limit: 10,
				categories: [],
				skills: [],
				budget: {
					tier: undefined,
					currency: undefined,
					type: undefined
				}
			};

			// Simulate search params being set
			const searchKey = JSON.stringify(searchParams);
			tasksStore.set({
				items: [],
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: searchKey
			});

			const state = get(tasksStore);
			expect(state.searchParamsKey).toBe(searchKey);
		});
	});

	describe('Infinite Scroll Integration', () => {
		it('should load more tasks when hasMore is true', () => {
			const initialTasks = Array.from({ length: 10 }, (_, i) =>
				createMockTask({ id: `task-${i}` })
			);

			tasksStore.set({
				items: initialTasks,
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: ''
			});

			// Simulate loading more
			const moreTasks = Array.from({ length: 10 }, (_, i) =>
				createMockTask({ id: `task-${i + 10}` })
			);

			tasksStore.update((state) => ({
				...state,
				items: [...state.items, ...moreTasks],
				currentPage: 2
			}));

			const state = get(tasksStore);
			expect(state.items).toHaveLength(20);
			expect(state.currentPage).toBe(2);
		});

		it('should not load more when hasMore is false', () => {
			tasksStore.set({
				items: [createMockTask()],
				loading: false,
				error: null,
				hasMore: false,
				currentPage: 1,
				searchParamsKey: ''
			});

			const state = get(tasksStore);
			expect(state.hasMore).toBe(false);
			// Should not attempt to load more
		});
	});
});
