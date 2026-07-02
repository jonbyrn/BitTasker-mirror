import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { waitFor } from '@testing-library/svelte';
import BalanceHistory from '$lib/components/wallet/BalanceHistory.svelte';
import balanceHistoryService from '$lib/api/services/balanceHistory.service';
import { walletStore } from '$lib/stores/wallet.store';

// Mock the balance history service
vi.mock('$lib/api/services/balanceHistory.service', () => ({
	default: {
		getBalanceChanges: vi.fn()
	}
}));

// Mock wallet store - component imports walletStore, totalBalances, formatSats
vi.mock('$lib/stores/wallet.store', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { writable, derived } = require('svelte/store');
	interface MockStoreValue {
		rsk: {
			provider: object;
			address: string;
			connected: boolean;
			balance: string;
			formattedBalance: string;
		};
		bsc: { connected: boolean; address: string | null };
		assets: Array<{ assetId: string; balance: number }>;
		totalBalances: { sats: number; usd: number };
	}
	const initialValue: MockStoreValue = {
		rsk: {
			provider: {},
			address: '0x1234567890123456789012345678901234567890',
			connected: true,
			balance: '1000000000000000000',
			formattedBalance: '1.0'
		},
		bsc: { connected: false, address: null },
		assets: [],
		totalBalances: {
			sats: 100000000,
			usd: 50000
		}
	};
	const mockWalletStore = writable(initialValue);
	const totalBalances = derived(mockWalletStore, ($s: MockStoreValue) => $s.totalBalances);
	const allAssets = derived(mockWalletStore, ($s: MockStoreValue) => $s.assets);
	return {
		walletStore: mockWalletStore,
		totalBalances,
		allAssets,
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats)
	};
});

// Mock svelte-i18n
vi.mock('svelte-i18n', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { readable } = require('svelte/store');
	const translations: Record<string, string> = {
		'wallet.balance_history.error': 'Failed to load balance history',
		'wallet.balance_history.label': 'Activity',
		'wallet.balance_history.24h': '24h',
		'wallet.balance_history.7d': '7d',
		'wallet.balance_history.30d': '30d',
		'wallet.balance_history.historical_chart': 'Historical Chart',
		'wallet.balance_chart.open_chart': 'Open Chart',
		'wallet.tab_transactions': 'Transactions'
	};
	const t = readable((key: string) => translations[key] ?? key);
	return { t };
});

// Mock haptics
vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }
}));

// Mock btcPrice rune (used by BalanceHistory for RSK USD calculation)
vi.mock('$lib/runes/btcPrice.svelte', () => ({
	btcPrice: { price: 65000 }
}));

// Mock BalanceChartModal (Svelte component)
vi.mock('$lib/components/wallet/BalanceChartModal.svelte', () => ({
	default: vi.fn(() => null)
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

	// Shared props to bypass the $effect fetch (overrideSats/overrideUsd/overrideAddress)
	// so balanceChangesPromise resolves immediately without needing to mock fetch
	const baseProps = {
		balancesHidden: false,
		overrideSats: 100_000_000,
		overrideUsd: 50_000,
		overrideAddress: '0x1234567890123456789012345678901234567890'
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset wallet store (component reads totalBalances from store)
		walletStore.set({
			rsk: {
				provider: {},
				address: '0x1234567890123456789012345678901234567890',
				connected: true,
				balance: '1000000000000000000',
				formattedBalance: '1.0'
			},
			bsc: { connected: false, address: null },
			assets: [],
			totalBalances: { sats: 100000000, usd: 50000 }
		} as unknown as Parameters<typeof walletStore.set>[0]);
	});

	it('should render loading state initially', () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockImplementation(
			() => new Promise(() => {}) // Never resolves
		);

		render(BalanceHistory, { props: baseProps });

		// Component uses loading spinners during {#await}
		const spinners = document.querySelectorAll('.loading.loading-spinner');
		expect(spinners.length).toBeGreaterThan(0);
	});

	it('should display balance changes when loaded', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		expect(container.textContent).toContain('24h');
		expect(container.textContent).toContain('7d');
		expect(container.textContent).toContain('30d');
		// formatSats uses Intl.NumberFormat (e.g. "10,000,000"); USD uses $X,XXX.XX
		expect(container.textContent).toMatch(/10[,.]?000[,.]?000/);
		expect(container.textContent).toContain('5,000.00');
	});

	it('should hide balances when balancesHidden is true', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		const { container } = render(BalanceHistory, { props: { ...baseProps, balancesHidden: true } });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Component shows •••• for each hidden value (two per period × 3 periods)
		expect(container.textContent).toContain('••••');
		expect(container.textContent).not.toMatch(/10[,.]?000[,.]?000/);
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

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		const successElements = container.querySelectorAll('.text-success, .text-success\\/80');
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

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		const errorElements = container.querySelectorAll('.text-error, .text-error\\/80');
		expect(errorElements.length).toBeGreaterThan(0);
	});

	it('should display error message when service fails', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockRejectedValue(
			new Error('Service error')
		);

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('Failed to load balance history');
		});

		const errorSpan = container.querySelector('.text-error');
		expect(errorSpan).not.toBeNull();
	});

	it('should call service with store values when totalBalances has data', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(balanceHistoryService.getBalanceChanges).toHaveBeenCalledWith(
				100000000,
				50000,
				expect.anything(),
				'0x1234567890123456789012345678901234567890'
			);
		});
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

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		// Component shows + for positive sats and USD (format: +10,000,000 and +$5,000.00)
		expect(container.textContent).toContain('+');
		expect(container.textContent).toMatch(/\+.*10[,.]?000[,.]?000/);
		expect(container.textContent).toMatch(/\+.*5[,.]?000/);
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

		const { container } = render(BalanceHistory, { props: baseProps });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		expect(container.textContent).toContain('-');
		expect(container.textContent).toMatch(/-.*10[,.]?000[,.]?000/);
		expect(container.textContent).toMatch(/-.*5[,.]?000/);
	});
});
