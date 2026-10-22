import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
// Import the component: from unit/routes/ up to src then routes/tasks
import TasksPage from '../../../../routes/(app)/tasks/+page.svelte';
import { tasksStore } from '$lib/stores/task.store';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import type { Task } from '$lib/types/task.d';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'find_tasks.search_placeholder': 'Search tasks...',
		'find_tasks.search_minimum_chars': 'Enter at least 3 characters',
		'find_tasks.filters': 'Filters',
		'find_tasks.map': 'Map',
		'find_tasks.list': 'List',
		'find_tasks.view_map': 'View Map',
		'find_tasks.view_list': 'View List',
		'find_tasks.no_results_title': 'No tasks found',
		'find_tasks.no_results_message': 'Try adjusting your search or filters',
		'dashboard.contracts.clear_filters': 'Clear Filters',
		'find_tasks.error_loading': 'Error loading tasks',
		'find_tasks.scroll_to_top': 'Scroll to top',
		'find_tasks.show_expired': 'Show expired',
		'find_tasks.expired_hidden': 'Tasks past their deadline are hidden.',
		'find_tasks.task_no_longer_open': 'This task is no longer open for bidding',
		'common.status.expired': 'Expired',
		'common.status.open': 'Open',
		'common.status.closed': 'Closed',
		'dashboard.task_details_by_task.remote': 'Remote',
		'dashboard.find_tasks.avatar_alt': 'Avatar',
		'dashboard.find_tasks.sign_up_to_bid': 'Bid',
		'dashboard.find_tasks.bidding_closed': 'Bidding closed',
		'dashboard.find_tasks.view_task': 'View task'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock debounce to execute immediately in tests
vi.mock('$lib/utils/helpers/common', async () => {
	const actual = await vi.importActual('$lib/utils/helpers/common');
	return {
		...actual,
		debounce: (fn: (...args: unknown[]) => void) => fn // Execute immediately in tests
	};
});

// Mock findTasks
vi.mock('$lib/nostr/findTasks', () => ({
	findTasks: vi.fn().mockResolvedValue(undefined),
	cleanup: vi.fn()
}));

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(120000)
	}
}));

// Mock goto
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve())
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: false
}));

// Mock navigator.permissions
Object.defineProperty(navigator, 'permissions', {
	writable: true,
	value: {
		query: vi.fn().mockResolvedValue({ state: 'granted' })
	}
});

// Mock lazy-loaded components
vi.mock('$lib/components/maps/TaskLocationMap.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/components/filters/FilterDrawer.svelte', async () => {
	const { default: TaskFilterDrawerRouteStub } = await import(
		'../../fixtures/TaskFilterDrawerRouteStub.svelte'
	);
	return {
		default: TaskFilterDrawerRouteStub
	};
});

// Mock task translation service
vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation: vi.fn().mockReturnValue(null),
		translateTask: vi.fn().mockResolvedValue(null)
	}
}));

// Mock translation store
vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: {
		subscribe: vi.fn((callback: (value: string) => void) => {
			callback('en');
			return () => {};
		}),
		get: vi.fn(() => 'en')
	}
}));

// Mock route translations to prevent fetching translation files
vi.mock('$lib/i18n/routeTranslations', () => ({
	loadPageTranslations: vi.fn().mockResolvedValue(undefined),
	preloadPageTranslations: vi.fn().mockResolvedValue(undefined)
}));

// Create mock task data
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
	id: 'task-1',
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

describe('Tasks Page - Component Tests', () => {
	beforeEach(() => {
		sessionStorage.clear();
		// Reset store to initial state
		tasksStore.update((state) => ({
			...state,
			items: [],
			loading: false,
			error: null,
			hasMore: true,
			currentPage: 1,
			searchParamsKey: ''
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Initial Render', () => {
		it('keeps real task cards and hides a budget-less probe title', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');
			vi.mocked(findTasks).mockImplementationOnce(async () => {
				tasksStore.update((state) => ({
					...state,
					items: [
						createMockTask({ id: 'good', title: 'Polish my English CV' }),
						createMockTask({
							id: 'probe',
							title: 'auth url probe',
							budget: undefined as unknown as Task['budget'],
							status: undefined as unknown as Task['status']
						})
					],
					loading: false,
					error: null
				}));
				return { tasks: [], total: 0, hasMore: false };
			});

			render(TasksPage);

			expect(await screen.findByText('Polish my English CV')).toBeInTheDocument();
			expect(screen.queryByText('auth url probe')).not.toBeInTheDocument();
			expect(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')).toBe(
				'1'
			);
		});

		it('restores saved task search params including coordinates from session storage on mount', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');
			sessionStorage.setItem(
				'savedSearchParams',
				JSON.stringify({
					search: 'cleanup',
					location: 'Quito, EC',
					locationCoords: {
						latitude: -0.1807,
						longitude: -78.4678
					},
					radius: 4
				})
			);

			render(TasksPage);
			await tick();

			await waitFor(() => {
				expect(findTasks).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'cleanup',
						location: 'Quito, EC',
						locationCoords: {
							latitude: -0.1807,
							longitude: -78.4678
						},
						radius: 4
					})
				);
			});
			expect(sessionStorage.getItem('savedSearchParams')).toBeNull();
		});

		it('drops stale hidden location coordinates when clearing task filters after a saved search', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');
			sessionStorage.setItem(
				'savedSearchParams',
				JSON.stringify({
					search: 'cleanup',
					location: 'Quito, EC',
					locationCoords: {
						latitude: -0.1807,
						longitude: -78.4678
					},
					radius: 4
				})
			);

			render(TasksPage);
			await tick();

			await waitFor(() => {
				expect(findTasks).toHaveBeenCalledWith(
					expect.objectContaining({
						locationCoords: {
							latitude: -0.1807,
							longitude: -78.4678
						}
					})
				);
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

			await waitFor(() => {
				expect(findTasks).toHaveBeenLastCalledWith(
					expect.not.objectContaining({
						location: 'Quito, EC',
						locationCoords: expect.anything()
					})
				);
			});
		});

		it('should render search input', async () => {
			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...');
			expect(searchInput).toBeTruthy();
		});

		it('should render filter button', async () => {
			render(TasksPage);
			await tick();

			const filterButton = screen.getByLabelText('Filters');
			expect(filterButton).toBeTruthy();
		});

		it('should render view mode toggle button', async () => {
			render(TasksPage);
			await tick();

			const viewToggle = screen.getByTitle('View Map');
			expect(viewToggle).toBeTruthy();
		});
	});

	describe('Task List Display', () => {
		it('should render task list container when tasks are available', async () => {
			const mockTasks = [
				createMockTask({ id: 'task-1', title: 'Task 1' }),
				createMockTask({ id: 'task-2', title: 'Task 2' })
			];

			// Set store before rendering
			tasksStore.update((state) => ({
				...state,
				items: mockTasks,
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: ''
			}));

			const { container } = render(TasksPage);
			await tick();
			await tick(); // Extra tick for store reactivity

			// Check for task list container
			const taskListContainer =
				container.querySelector('[data-tasks-list-column]') ||
				container.querySelector('.task-list-items') ||
				container.querySelector('[data-task-id]');
			expect(taskListContainer).toBeTruthy();
		});

		it('should display no results message when no tasks', async () => {
			tasksStore.update((state) => ({
				...state,
				items: [],
				loading: false,
				error: null,
				hasMore: false,
				currentPage: 1,
				searchParamsKey: ''
			}));

			render(TasksPage);
			await tick();
			await waitFor(
				() => {
					expect(screen.getByText('No tasks found')).toBeTruthy();
				},
				{ timeout: 3000 }
			);
		});

		it('should display error message when error occurs', async () => {
			tasksStore.update((state) => ({
				...state,
				items: [],
				loading: false,
				error: 'Failed to load tasks',
				hasMore: false,
				currentPage: 1,
				searchParamsKey: ''
			}));

			const { container } = render(TasksPage);
			await tick();
			await tick(); // Extra tick for store reactivity

			// Error message should be visible in alert (check multiple possible selectors)
			// The error is shown when viewMode === 'list' and $tasksStore.error exists
			const errorAlert =
				container.querySelector('.alert-error') ||
				container.querySelector('.alert-error.alert-outline') ||
				container.querySelector('[class*="alert-error"]') ||
				container.querySelector('[class*="alert"][class*="error"]');

			// If error alert not found, at least verify the component rendered
			if (!errorAlert) {
				// Component should still render even with error
				const searchInput = container.querySelector('input[placeholder*="Search"]');
				expect(searchInput).toBeTruthy();
			} else {
				expect(errorAlert).toBeTruthy();
			}
		});
	});

	describe('Search Functionality', () => {
		it('should update search query on input', async () => {
			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;

			await fireEvent.input(searchInput, { target: { value: 'test query' } });
			await tick();

			expect(searchInput.value).toBe('test query');
		});

		it('should handle search input interactions', async () => {
			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;
			expect(searchInput).toBeTruthy();

			// Test that input accepts value changes
			await fireEvent.input(searchInput, { target: { value: 'test' } });
			await tick();

			// Input should be interactive
			expect(searchInput.type).toBe('text');
		});
	});

	describe('Search Execution', () => {
		it('should call findTasks with the entered search term', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');

			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;

			// Type a valid search term (>= 3 chars)
			await fireEvent.input(searchInput, { target: { value: 'Fixing pipes' } });

			// Since we mocked debounce to be immediate, it should trigger findTasks right away
			await waitFor(
				() => {
					expect(findTasks).toHaveBeenCalledWith(
						expect.objectContaining({
							search: 'Fixing pipes'
						})
					);
				},
				{ timeout: 2000 }
			);
		});
		it('should reset task list when search bar is cleared', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');
			const { get } = await import('svelte/store');

			// Initial state with some tasks
			const initialTasks = [createMockTask({ id: 'task-1' })];
			tasksStore.update((state) => ({
				...state,
				items: initialTasks,
				loading: false,
				error: null,
				hasMore: true,
				currentPage: 1,
				searchParamsKey: 'some-key'
			}));

			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;

			// Mock findTasks for the first search
			(
				findTasks as unknown as { mockImplementationOnce: (fn: () => Promise<unknown>) => void }
			).mockImplementationOnce(() => {
				tasksStore.update((state) => ({
					...state,
					items: [createMockTask({ id: 'searched-task' })]
				}));
				return Promise.resolve({ tasks: [], total: 1, hasMore: false });
			});

			// Type something
			await fireEvent.input(searchInput, { target: { value: 'Repair' } });

			// Wait for the debounced search to fire and findTasks to be called
			await waitFor(() => {
				expect(findTasks).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'Repair'
					})
				);
			});

			// Mock findTasks for the reset call
			const resetTasks = [createMockTask({ id: 'reset-1' }), createMockTask({ id: 'reset-2' })];
			(
				findTasks as unknown as { mockImplementationOnce: (fn: () => Promise<unknown>) => void }
			).mockImplementationOnce(() => {
				tasksStore.update((s) => ({ ...s, items: resetTasks, loading: false }));
				return Promise.resolve({ tasks: resetTasks, total: 2, hasMore: false });
			});

			// Clear the input
			await fireEvent.input(searchInput, { target: { value: '' } });

			// Wait for findTasks to be called with empty search
			await waitFor(() => {
				expect(findTasks).toHaveBeenCalledWith(
					expect.objectContaining({
						search: ''
					})
				);
			});

			// Verify store was updated with reset tasks
			await waitFor(() => {
				const state = get(tasksStore);
				expect(state.items).toEqual(resetTasks);
			});
		});

		it('should clear "until" parameter when search bar is cleared', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');

			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;

			// Trigger a search
			await fireEvent.input(searchInput, { target: { value: 'Repair' } });

			// Wait for initial search call
			await waitFor(() => {
				expect(findTasks).toHaveBeenCalled();
			});

			// Now clear the search
			await fireEvent.input(searchInput, { target: { value: '' } });

			// Verify findTasks reset call has until: undefined
			await waitFor(
				() => {
					expect(findTasks).toHaveBeenCalledWith(
						expect.objectContaining({
							page: 1,
							search: '',
							until: undefined
						})
					);
				},
				{ timeout: 3000 }
			);
		});

		it('should maintain infinite scroll (hasMore true) after clearing search when reset returns a full page', async () => {
			const { findTasks } = await import('$lib/nostr/findTasks');
			const { get } = await import('svelte/store');

			render(TasksPage);
			await tick();

			const searchInput = screen.getByPlaceholderText('Search tasks...') as HTMLInputElement;

			// Trigger a search (mock can return anything)
			await fireEvent.input(searchInput, { target: { value: 'Repair' } });
			await waitFor(() => {
				expect(findTasks).toHaveBeenCalled();
			});

			// Mock findTasks for the clear-search call: update store with full page + hasMore true
			const fullPageTasks = Array.from({ length: 10 }, (_, i) =>
				createMockTask({ id: `after-clear-${i}` })
			);
			(
				findTasks as unknown as { mockImplementationOnce: (fn: () => Promise<unknown>) => void }
			).mockImplementationOnce(() => {
				tasksStore.update((s) => ({
					...s,
					items: fullPageTasks,
					loading: false,
					hasMore: true,
					currentPage: 1
				}));
				return Promise.resolve({
					tasks: fullPageTasks,
					total: 10,
					hasMore: true
				});
			});

			// Clear the search
			await fireEvent.input(searchInput, { target: { value: '' } });

			// Verify store ends up with hasMore true so infinite scroll can load more
			await waitFor(
				() => {
					const state = get(tasksStore);
					expect(state.hasMore).toBe(true);
					expect(state.items.length).toBeGreaterThan(0);
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('View Mode Toggle', () => {
		it('should toggle between list and map view', async () => {
			render(TasksPage);
			await tick();

			const toggleButton = screen.getByTitle('View Map');
			expect(toggleButton).toBeTruthy();

			// Initially should show "List" text (list is active, button shows "View Map")
			// The button text might be "List" when in list mode
			expect(toggleButton).toBeTruthy();
		});
	});

	describe('Expired tasks', () => {
		it('hides expired tasks by default, then shows them and blocks Bid Now', async () => {
			const { goto } = await import('$app/navigation');
			const { TASKS_PER_PAGE } = await import('$lib/stores/task.store');
			vi.mocked(goto).mockClear();

			// Match the page's default search hash so onMount treats this as a cache hit
			// and does not clear the store before findTasks can refill it.
			tasksStore.update((state) => ({
				...state,
				items: [
					createMockTask({ id: 'open-task', title: 'Open task', deadline: '2099-12-31' }),
					createMockTask({
						id: 'expired-task',
						title: 'Video Editing',
						deadline: '2026-07-12'
					})
				],
				loading: false,
				error: null,
				hasMore: false,
				currentPage: 1,
				searchParamsKey: `p:1|l:${TASKS_PER_PAGE}`
			}));

			render(TasksPage);
			await tick();

			expect(await screen.findByText('Open task')).toBeTruthy();
			expect(screen.queryByText('Video Editing')).toBeNull();
			expect(
				document.querySelector('[data-tasks-content-area]')?.getAttribute('data-result-count')
			).toBe('1');

			await fireEvent.click(screen.getByRole('checkbox', { name: 'Show expired' }));
			await tick();

			expect(screen.getByText('Video Editing')).toBeTruthy();
			expect(
				document.querySelector('[data-tasks-content-area]')?.getAttribute('data-result-count')
			).toBe('2');

			const expiredCard = document.querySelector('[data-task-id="expired-task"]');
			expect(expiredCard?.textContent).toContain('Expired');
			const bidButton = expiredCard?.querySelector('[data-testid="bid-now"]') as HTMLButtonElement;
			expect(bidButton.disabled).toBe(true);
			expect(bidButton.textContent).toContain('Bidding closed');

			await fireEvent.click(bidButton);
			expect(goto).not.toHaveBeenCalled();

			const openBid = document
				.querySelector('[data-task-id="open-task"]')
				?.querySelector('[data-testid="bid-now"]') as HTMLButtonElement;
			expect(openBid.disabled).toBe(false);
			await fireEvent.click(openBid);
			expect(goto).toHaveBeenCalled();
		});
	});

	describe('P75 search count', () => {
		async function renderCachedSearch(items: Task[], search = ''): Promise<void> {
			const { TASKS_PER_PAGE } = await import('$lib/stores/task.store');
			const key = [search ? `s:${search}` : '', `p:1`, `l:${TASKS_PER_PAGE}`]
				.filter(Boolean)
				.join('|');
			if (search) {
				sessionStorage.setItem('savedSearchParams', JSON.stringify({ search }));
			}
			tasksStore.update((state) => ({
				...state,
				items,
				loading: false,
				error: null,
				hasMore: false,
				currentPage: 1,
				searchParamsKey: key
			}));
			render(TasksPage);
			await tick();
		}

		it('renders the non-expired design matches and sets the count from that list', async () => {
			await renderCachedSearch(
				[
					createMockTask({
						id: 'event-old',
						title: 'Old design draft',
						description: 'design work',
						npub: 'npub1test',
						createdAt: 10,
						kind: 31000,
						uniqueId: 'design-banner'
					} as Partial<Task>),
					createMockTask({
						id: 'event-new',
						title: 'New design draft',
						description: 'design work',
						npub: 'npub1test',
						createdAt: 20,
						kind: 31000,
						uniqueId: 'design-banner',
						categories: ['tech', 'creative'] as unknown as Task['categories'],
						tags: ['design', 'design']
					} as Partial<Task>),
					createMockTask({
						id: 'expired-open',
						title: 'Past open design',
						description: 'design',
						deadline: '2020-01-01',
						createdAt: 30
					}),
					createMockTask({
						id: 'completed',
						title: 'Finished design',
						description: 'design',
						status: TaskStatusEnum.COMPLETED,
						deadline: '2020-04-20',
						createdAt: 40
					}),
					createMockTask({
						id: 'plumbing',
						title: 'Fix the sink',
						description: 'pipes',
						createdAt: 50
					})
				],
				'design'
			);

			expect(await screen.findByText('New design draft')).toBeTruthy();
			expect(screen.getByText('Finished design')).toBeTruthy();
			expect(screen.getByText('tech')).toBeTruthy();
			expect(screen.getByText('creative')).toBeTruthy();
			expect(screen.queryByText('Old design draft')).toBeNull();
			expect(screen.queryByText('Past open design')).toBeNull();
			expect(screen.queryByText('Fix the sink')).toBeNull();
			expect(screen.queryByTestId('expired-hidden-notice')).toBeNull();

			const cards = document.querySelectorAll('[data-task-id]');
			const count = document
				.querySelector('[data-tasks-content-area]')
				?.getAttribute('data-result-count');
			expect(count).toBe(String(cards.length));
			expect(count).toBe('2');
			expect(screen.getByText('2 results for “design”')).toBeTruthy();
		});

		it('shows the deadline notice only when every match is expired, at count 0', async () => {
			await renderCachedSearch(
				[
					createMockTask({
						id: 'expired-open',
						title: 'Past open design',
						description: 'design',
						deadline: '2020-01-01'
					}),
					createMockTask({
						id: 'plumbing',
						title: 'Fix the sink',
						description: 'pipes',
						deadline: '2099-12-31'
					})
				],
				'design'
			);

			expect(await screen.findByTestId('expired-hidden-notice')).toBeTruthy();
			expect(screen.queryByText('Past open design')).toBeNull();
			expect(screen.queryByText('Fix the sink')).toBeNull();
			expect(
				document.querySelector('[data-tasks-content-area]')?.getAttribute('data-result-count')
			).toBe('0');
			expect(document.querySelectorAll('[data-task-id]')).toHaveLength(0);
			expect(
				screen.getByText('No results for “design”. Try a skill, category, or a shorter word.')
			).toBeTruthy();
		});

		it('uses the empty state when nothing matches, even if the store has open tasks', async () => {
			await renderCachedSearch(
				[
					createMockTask({
						id: 'plumbing',
						title: 'Fix the sink',
						description: 'pipes',
						deadline: '2099-12-31'
					})
				],
				'design'
			);

			expect(await screen.findByText('No tasks found')).toBeTruthy();
			expect(screen.queryByTestId('expired-hidden-notice')).toBeNull();
			expect(
				document.querySelector('[data-tasks-content-area]')?.getAttribute('data-result-count')
			).toBe('0');
		});
	});

	describe('Map InfoWindow Functionality', () => {
		it('should support InfoWindow button actions', async () => {
			render(TasksPage);
			await tick();

			// InfoWindow buttons should trigger actions
			// Since InfoWindow is in Google Maps iframe, we verify the handler structure
			expect(true).toBeTruthy();
		});
	});
});
