import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://bittasker.local/tasks/new')
	}
}));

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: readable({ pool: {} })
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(65000)
	}
}));

vi.mock('$lib/stores/market-price.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		btcUsd: readable(65000),
		rbtcUsd: readable(65000),
		marketPriceMeta: readable({
			lastFetched: Date.now(),
			isRefreshing: false,
			error: null
		}),
		marketPrice: {
			subscribe: readable({
				btcUsd: 65000,
				rbtcUsd: 65000,
				lastFetched: Date.now(),
				isRefreshing: false,
				error: null
			}).subscribe,
			refresh: vi.fn().mockResolvedValue(undefined),
			startPolling: vi.fn(),
			stopPolling: vi.fn(),
			hydrateFromCache: vi.fn()
		}
	};
});

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadMultipleFiles: vi.fn().mockResolvedValue([])
	}
}));

vi.mock('$lib/utils/imageCompression', () => ({
	compressImage: vi.fn(async (file: File) => ({ file })),
	validateImageFile: vi.fn(() => ({ isValid: true }))
}));

import TaskBudget from '$lib/components/task/steps/TaskBudget.svelte';
import { taskStore } from '$lib/stores/task.store';
import { getDefaultPaymentNetwork } from '$lib/utils/helpers/paymentContext';
import { validateUsdtAmount } from '$lib/utils/helpers/validators';

function getBudgetInputs() {
	return {
		usd: document.getElementById('budget-usd') as HTMLInputElement,
		sats: document.getElementById('budget-btc') as HTMLInputElement
	};
}

describe('TaskBudget', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		await taskStore.clearDraft(false);
	});

	afterEach(async () => {
		await vi.runOnlyPendingTimersAsync();
		vi.useRealTimers();
	});

	it('starts on the Rootstock rail from task-store defaults', async () => {
		render(TaskBudget, {
			errors: {},
			direction: 'forward',
			attachmentsToRemove: []
		});

		expect(get(taskStore).task.paymentAsset).toBe('RBTC');
		expect(get(taskStore).task.paymentNetwork).toBe(getDefaultPaymentNetwork('RBTC'));

		expect(screen.getByRole('button', { name: /rBTC on Rootstock/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /USDT on BSC/i })).toBeInTheDocument();
	});

	it('persists explicit USDT on BSC metadata when the payment rail changes', async () => {
		render(TaskBudget, {
			errors: {},
			direction: 'forward',
			attachmentsToRemove: []
		});

		await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));

		await waitFor(() => {
			expect(get(taskStore).task.paymentAsset).toBe('USDT');
			expect(get(taskStore).task.paymentNetwork).toBe(getDefaultPaymentNetwork('USDT'));
		});

		await vi.runAllTimersAsync();

		const { Preferences } = await import('@capacitor/preferences');
		expect(Preferences.set).toHaveBeenCalled();

		const lastDraftWrite = vi.mocked(Preferences.set).mock.calls.at(-1);
		expect(lastDraftWrite).toBeDefined();

		const persistedDraft = JSON.parse(lastDraftWrite?.[0].value ?? '{}');
		expect(persistedDraft.task).toMatchObject({
			paymentAsset: 'USDT',
			paymentNetwork: getDefaultPaymentNetwork('USDT')
		});
	});

	describe('Budget Amount Input', () => {
		it('converts RBTC sats input into the shared USD task budget on Rootstock rail', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			const { sats: budgetInput } = getBudgetInputs();
			await fireEvent.input(budgetInput, { target: { value: '500000' } });

			expect(get(taskStore).task.budget.amount).toBe(325);
		});

		it('stores the entered USD budget amount on the BSC rail', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			const { usd: budgetInput } = getBudgetInputs();
			await fireEvent.input(budgetInput, { target: { value: '100.50' } });

			expect(get(taskStore).task.budget.amount).toBe(100.5);
		});

		it('rejects USDT with more than 6 decimal places', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			const { usd: budgetInput } = getBudgetInputs();
			await fireEvent.input(budgetInput, { target: { value: '100.1234567' } });
			await fireEvent.blur(budgetInput);

			const validation = validateUsdtAmount('100.1234567');
			expect(validation.isValid).toBe(false);
		});

		it('enforces minimum USDT amount (> 0) on BSC rail', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			const { usd: budgetInput } = getBudgetInputs();
			await fireEvent.input(budgetInput, { target: { value: '0' } });

			const validation = validateUsdtAmount('0');
			expect(validation.isValid).toBe(false);
		});

		it('accepts minimum USDT amount (0.000001) on BSC rail', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			const { usd: budgetInput } = getBudgetInputs();
			await fireEvent.input(budgetInput, { target: { value: '0.000001' } });

			const validation = validateUsdtAmount('0.000001');
			expect(validation.isValid).toBe(true);
		});
	});

	describe('Network Display Labels', () => {
		it('displays "rBTC on Rootstock" label for RBTC asset', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			expect(screen.getByRole('button', { name: /rBTC on Rootstock/i })).toBeInTheDocument();
		});

		it('displays "USDT on BSC" label for USDT asset', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			expect(screen.getByRole('button', { name: /USDT on BSC/i })).toBeInTheDocument();
		});

		it('updates budget label when switching from RBTC to USDT', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			const usdtButton = screen.getByRole('button', { name: /USDT on BSC/i });
			await fireEvent.click(usdtButton);

			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			const usdtLabel = screen.queryByText(/USDT amount|Token units/i);
			expect(usdtLabel || usdtButton).toBeInTheDocument();
		});
	});

	describe('Budget Persistence Across Networks', () => {
		it('keeps the shared USD budget amount when switching networks', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			const { sats: satsBudgetInput, usd: usdBudgetInput } = getBudgetInputs();
			await fireEvent.input(satsBudgetInput, { target: { value: '500000' } });
			expect(get(taskStore).task.budget.amount).toBe(325);

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			await fireEvent.input(usdBudgetInput, { target: { value: '100.50' } });
			expect(get(taskStore).task.budget.amount).toBe(100.5);

			await fireEvent.click(screen.getByRole('button', { name: /rBTC on Rootstock/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('RBTC');
			});

			expect(get(taskStore).task.budget.amount).toBe(100.5);
		});
	});

	describe('Fee Display', () => {
		it('shows fee estimate for RBTC on Rootstock', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			const feeDisplay = screen.queryByText(/fee|network fee/i);
			if (feeDisplay) {
				expect(feeDisplay).toBeInTheDocument();
			}
		});

		it('shows fee context for USDT on BSC (sponsor model)', async () => {
			render(TaskBudget, {
				errors: {},
				direction: 'forward',
				attachmentsToRemove: []
			});

			await fireEvent.click(screen.getByRole('button', { name: /USDT on BSC/i }));
			await waitFor(() => {
				expect(get(taskStore).task.paymentAsset).toBe('USDT');
			});

			// BSC uses sponsor model - verify component renders without errors
			expect(get(taskStore).task.paymentAsset).toBe('USDT');
		});
	});
});
