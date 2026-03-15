import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/svelte';
import TaskReview from '$lib/components/task/steps/TaskReview.svelte';
import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(60000)
	}
}));

vi.mock('$lib/utils/helpers/crypto', () => ({
	satsFromUsd: vi.fn(() => '123 sats')
}));

vi.mock('$lib/utils/constants/categories', () => ({
	TASK_CATEGORIES: []
}));

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateShort: vi.fn(() => 'Jan 1'),
	parseDateToLocalMidnight: vi.fn((value: string) => new Date(value))
}));

vi.mock('$lib/components/task/TaskReviewLocation.svelte', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');

	return {
			taskStore: writable({
				task: {
					title: 'Test task',
					description: 'Task description',
					taskType: 'REMOTE',
					budget: {
						amount: 125,
						type: 'FIXED',
						currency: 'USD',
						estimatedHours: 0
					},
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet',
				deadline: '',
				dateRange: undefined,
				categories: [],
				skills: [],
					attachments: []
				},
				isRemovals: false,
				recurringTask: {
					isRecurring: false
				}
			})
		};
	});

import { taskStore } from '$lib/stores/task.store';

describe('TaskReview BSC budget display', () => {
	beforeEach(() => {
		cleanup();
		(taskStore as typeof taskStore).set({
			task: {
				title: 'Test task',
				description: 'Task description',
				taskType: TaskTypeEnum.REMOTE,
				budget: {
					amount: 125,
					type: BudgetTypeEnum.FIXED,
					currency: 'USD',
					estimatedHours: 0
				},
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet',
				deadline: '',
				dateRange: undefined,
				categories: [],
				skills: [],
				attachments: []
			},
			isRemovals: false,
			recurringTask: {
				isRecurring: false
			}
		});
	});

	it('hides sats-derived budget copy for USDT on BSC tasks', async () => {
		render(TaskReview, {
			direction: 'forward'
		});

		await waitFor(() => {
			expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		});

		expect(screen.getByText('$125')).toBeInTheDocument();
		expect(screen.queryByText('123 sats')).not.toBeInTheDocument();
	});

	it('keeps sats-derived budget copy for Rootstock tasks', async () => {
		(taskStore as typeof taskStore).set({
			task: {
				title: 'Rootstock task',
				description: 'Task description',
				taskType: TaskTypeEnum.REMOTE,
				budget: {
					amount: 125,
					type: BudgetTypeEnum.FIXED,
					currency: 'USD',
					estimatedHours: 0
				},
				paymentAsset: 'RBTC',
				paymentNetwork: 'rsk-testnet',
				deadline: '',
				dateRange: undefined,
				categories: [],
				skills: [],
				attachments: []
			},
			isRemovals: false,
			recurringTask: {
				isRecurring: false
			}
		});

		render(TaskReview, {
			direction: 'forward'
		});

		await waitFor(() => {
			expect(screen.getByText('rBTC on Rootstock')).toBeInTheDocument();
		});

		expect(screen.getByText('123 sats')).toBeInTheDocument();
	});
});
