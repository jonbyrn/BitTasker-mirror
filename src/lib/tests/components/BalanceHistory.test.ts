import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BalanceHistory from '$lib/components/wallet/BalanceHistory.svelte';
import balanceHistoryService from '$lib/api/services/balanceHistory.service';
import { writable } from 'svelte/store';

// Mock the balance history service
vi.mock('$lib/api/services/balanceHistory.service', () => ({
	default: {
		getBalanceChanges: vi.fn()
	}
}));

// Mock wallet store
vi.mock('$lib/stores/wallet.store', () => {
	const { writable } = require('svelte/store');
	return {
		walletStore: writable({
			rsk: {
				provider: {} as any,
				address: '0x1234567890123456789012345678901234567890',
				isConnected: true,
				balance: '1000000000000000000',
				balanceSats: 100000000,
				balanceUsd: 50000
			},
			bsc: {
				provider: null,
				address: null,
				isConnected: false,
				balance: '0',
				balanceSats: 0,
				balanceUsd: 0
			},
			assets: [],
			transactions: [],
			totalBalances: {
				sats: 100000000,
				usd: 50000
			}
		})
	};
});

// Mock svelte-i18n
vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: (fn: any) => {
			fn((key: string) => key);
			return () => {};
		}
	}
}));

describe('BalanceHistory', () => {
	const mockBalanceChanges = [
		{
			label: '24h',
			satsChange: 10000000,
			usdChange: 5000,
			satsPercentChange: 10,
			usdPercentChange: 12
		},
		{
			label: '7d',
			satsChange: -5000000,
			usdChange: -2500,
			satsPercentChange: -5,
			usdPercentChange: -6
		},
		{
			label: '30d',
			satsChange: 20000000,
			usdChange: 10000,
			satsPercentChange: 20,
			usdPercentChange: 25
		}
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render loading state initially', () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockImplementation(
			() => new Promise(() => {}) // Never resolves
		);

		render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Should show skeleton loaders
		const skeletons = document.querySelectorAll('.skeleton');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it('should display balance changes when loaded', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Check that all periods are displayed
		expect(container.textContent).toContain('24h');
		expect(container.textContent).toContain('7d');
		expect(container.textContent).toContain('30d');

		// Check that values are displayed
		expect(container.textContent).toContain('10000000.00 sats');
		expect(container.textContent).toContain('5000.00 USD');
	});

	it('should hide balances when balancesHidden is true', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: true
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Check that values are hidden
		expect(container.textContent).toContain('••••••');
		expect(container.textContent).not.toContain('10000000.00 sats');
	});

	it('should apply correct color classes for positive changes', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: 10000000,
				usdChange: 5000,
				satsPercentChange: 10,
				usdPercentChange: 12
			}
		]);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Check for success color class
		const successElements = container.querySelectorAll('.text-success');
		expect(successElements.length).toBeGreaterThan(0);
	});

	it('should apply correct color classes for negative changes', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: -10000000,
				usdChange: -5000,
				satsPercentChange: -10,
				usdPercentChange: -12
			}
		]);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Check for error color class
		const errorElements = container.querySelectorAll('.text-error');
		expect(errorElements.length).toBeGreaterThan(0);
	});

	it('should display error message when service fails', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockRejectedValue(
			new Error('Service error')
		);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for error to be displayed
		await vi.waitFor(() => {
			expect(container.textContent).toContain('Failed to load balance history');
		});

		// Check for alert
		const alert = container.querySelector('.alert-error');
		expect(alert).not.toBeNull();
	});

	it('should not load data when currentSats is 0', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		render(BalanceHistory, {
			props: {
				currentSats: 0,
				currentUsd: 0,
				balancesHidden: false
			}
		});

		// Wait a bit to ensure no call is made
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Service should not be called
		expect(balanceHistoryService.getBalanceChanges).not.toHaveBeenCalled();
	});

	it('should format positive numbers with + sign', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: 10000000,
				usdChange: 5000,
				satsPercentChange: 10,
				usdPercentChange: 12
			}
		]);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('+10000000.00');
		});

		expect(container.textContent).toContain('+5000.00');
		expect(container.textContent).toContain('+10.00%');
	});

	it('should format negative numbers with - sign', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: -10000000,
				usdChange: -5000,
				satsPercentChange: -10,
				usdPercentChange: -12
			}
		]);

		const { container } = render(BalanceHistory, {
			props: {
				currentSats: 100000000,
				currentUsd: 50000,
				balancesHidden: false
			}
		});

		// Wait for data to load
		await vi.waitFor(() => {
			expect(container.textContent).toContain('-10000000.00');
		});

		expect(container.textContent).toContain('-5000.00');
		expect(container.textContent).toContain('-10.00%');
	});
});

