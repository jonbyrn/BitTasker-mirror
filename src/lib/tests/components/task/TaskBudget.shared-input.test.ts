import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import TaskBudget from '$lib/components/task/steps/TaskBudget.svelte';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			update(updater: (currentValue: T) => T) {
				this.set(updater(value));
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		storeState: createStore({
			task: {
				budget: {
					amount: 125,
					currency: 'USD'
				},
				description: '',
				attachments: []
			},
			pendingFiles: []
		}),
		mockGetCurrentPrice: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/stores/task.store', () => ({
	taskStore: {
		subscribe: hoisted.storeState.subscribe,
		updateTask: (updates: Record<string, unknown>) => {
			hoisted.storeState.update((state) => ({
				...state,
				task: {
					...state.task,
					...updates,
					budget: {
						...state.task.budget,
						...((updates.budget as Record<string, unknown> | undefined) ?? {})
					}
				}
			}));
		},
		updateStore: (updates: Record<string, unknown>) => {
			hoisted.storeState.update((state) => ({
				...state,
				...updates
			}));
		}
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadMultipleFiles: vi.fn()
	}
}));

vi.mock('$lib/utils/imageCompression', () => ({
	compressImage: vi.fn(),
	validateImageFile: vi.fn(() => ({ isValid: true }))
}));

describe('TaskBudget shared usd/sats input integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetCurrentPrice.mockResolvedValue(100_000);
		hoisted.storeState.set({
			task: {
				budget: {
					amount: 125,
					currency: 'USD'
				},
				description: '',
				attachments: []
			},
			pendingFiles: []
		});
	});

	function readBudgetAmount() {
		let currentValue: number | null = null;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue = value.task.budget.amount;
		});
		unsubscribe();
		return currentValue;
	}

	it('updates the task budget from the dollar field', async () => {
		const { getByTestId, queryByTestId } = render(TaskBudget, {
			errors: {},
			direction: 'forward',
			attachmentsToRemove: []
		});

		expect(getByTestId('task-safe-payment').textContent).toBe('task.safe_payment');
		expect(queryByTestId('usd-sats-input-sats')).toBeNull();
		expect(queryByTestId('usd-sats-input-btc-price')).toBeNull();

		await fireEvent.input(document.getElementById('budget-usd') as HTMLInputElement, {
			target: { value: '250' }
		});
		expect(readBudgetAmount()).toBe(250);
	});
});
