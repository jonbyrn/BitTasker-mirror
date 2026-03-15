import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import BalanceChartModal from '$lib/components/wallet/BalanceChartModal.svelte';
import balanceHistoryService from '$lib/api/services/balanceHistory.service';
import { walletStore } from '$lib/stores/wallet.store';

const { chartInstances } = vi.hoisted(() => ({
	chartInstances: [] as any[]
}));

vi.mock('chart.js', () => {
	class MockChart {
		static register = vi.fn();
		data: any;
		options: any;
		destroy = vi.fn();
		update = vi.fn();

		constructor(_canvas: HTMLCanvasElement, config: any) {
			this.data = config.data;
			this.options = config.options;
			chartInstances.push(this);
		}
	}

	return {
		Chart: MockChart,
		CategoryScale: {},
		LinearScale: {},
		TimeScale: {},
		BarController: {},
		LineController: {},
		BarElement: {},
		LineElement: {},
		PointElement: {},
		Tooltip: {},
		Legend: {},
		Filler: {}
	};
});

vi.mock('chartjs-adapter-date-fns', () => ({}));

vi.mock('$lib/api/services/balanceHistory.service', () => ({
	default: {
		getDailyBalances: vi.fn()
	}
}));

vi.mock('$lib/stores/wallet.store', () => {
	const { writable, derived } = require('svelte/store');
	const mockWalletStore = writable({
		rsk: {
			provider: {},
			address: '0xrsk000000000000000000000000000000000000',
			connected: true
		},
		bsc: {
			provider: {},
			address: '0xbsc000000000000000000000000000000000000',
			connected: true
		},
		totalBalances: {
			sats: 100000000,
			usd: 50000,
			usdt: 30
		},
		activeNetwork: 'bsc',
		selectedAsset: 'USDT'
	});

	return {
		walletStore: mockWalletStore,
		totalBalances: derived(mockWalletStore, ($store: any) => $store.totalBalances),
		formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value)
	};
});

vi.mock('$lib/stores/theme.store', () => {
	const { readable } = require('svelte/store');
	return {
		darkMode: readable(false)
	};
});

vi.mock('svelte-i18n', () => {
	const { readable } = require('svelte/store');
	const translations: Record<string, string> = {
		'wallet.balance_chart.title': 'Balance Chart',
		'wallet.balance_chart.date_range': 'Date range',
		'wallet.balance_chart.last_7_days': 'Last 7 days',
		'wallet.balance_chart.last_30_days': 'Last 30 days',
		'wallet.balance_chart.this_month': 'This month',
		'wallet.balance_chart.last_month': 'Last month',
		'wallet.balance_chart.last_90_days': 'Last 90 days',
		'wallet.balance_chart.year_to_date': 'Year to date',
		'wallet.balance_chart.last_365_days': 'Last 365 days',
		'wallet.balance_chart.last_year': 'Last year',
		'wallet.balance_chart.no_data': 'No data',
		'wallet.balance_chart.chart.date_axis': 'Date',
		'wallet.balance_chart.chart.usd_axis': 'USD',
		'wallet.balance_chart.chart.sats_axis': 'Sats',
		'wallet.balance_chart.chart.bitcoin_balance_label': 'Bitcoin Balance',
		'wallet.balance_chart.chart.total_usd_label': 'Total USD',
		'wallet.balance_chart.chart.tooltip_sats': 'sats',
		'wallet.balance_chart.chart.tooltip_na': 'N/A',
		'common.close': 'Close',
		'common.loading': 'Loading'
	};

	return {
		t: readable((key: string) => translations[key] || key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' }
}));

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDate: (date: Date) => date.toISOString().slice(0, 10)
}));

vi.mock('~icons/mdi/close', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));

describe('BalanceChartModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		chartInstances.length = 0;
		walletStore.set({
			rsk: {
				provider: {},
				address: '0xrsk000000000000000000000000000000000000',
				connected: true
			},
			bsc: {
				provider: {},
				address: '0xbsc000000000000000000000000000000000000',
				connected: true
			},
			totalBalances: {
				sats: 100000000,
				usd: 50000,
				usdt: 30
			},
			activeNetwork: 'bsc',
			selectedAsset: 'USDT'
		} as any);
	});

	afterEach(() => {
		cleanup();
	});

	it('shows an explicit unavailable message when BSC history only returns null balances', async () => {
		vi.mocked(balanceHistoryService.getDailyBalances).mockResolvedValue([
			{ date: new Date('2026-03-10T00:00:00Z'), sats: null, usd: null }
		]);

		render(BalanceChartModal, { isOpen: true, onClose: vi.fn() });

		await waitFor(() => {
			expect(
				screen.getByText('Historical balance data is temporarily unavailable for USDT on BSC.')
			).toBeInTheDocument();
		});

		expect(balanceHistoryService.getDailyBalances).toHaveBeenCalledWith(
			expect.any(Date),
			expect.any(Date),
			expect.anything(),
			'0xbsc000000000000000000000000000000000000',
			30,
			30,
			expect.objectContaining({
				network: 'bsc',
				assetSymbol: 'USDT',
				unitLabel: 'USDT'
			})
		);
	});

	it('shows the generic no-data message when BSC history returns an empty range', async () => {
		vi.mocked(balanceHistoryService.getDailyBalances).mockResolvedValue([]);

		render(BalanceChartModal, { isOpen: true, onClose: vi.fn() });

		await waitFor(() => {
			expect(screen.getByText('No data available for the selected date range')).toBeInTheDocument();
		});

		expect(
			screen.queryByText('Historical balance data is temporarily unavailable for USDT on BSC.')
		).toBeNull();
	});

	it('uses token-native BSC labels and chart data for USDT history', async () => {
		vi.mocked(balanceHistoryService.getDailyBalances).mockResolvedValue([
			{ date: new Date('2026-03-10T00:00:00Z'), sats: 25.5, usd: 25.5 },
			{ date: new Date('2026-03-11T00:00:00Z'), sats: 30, usd: 30 }
		]);

		render(BalanceChartModal, { isOpen: true, onClose: vi.fn() });

		await waitFor(() => {
			expect(chartInstances.length).toBeGreaterThan(0);
			expect(chartInstances[0].data.datasets.length).toBe(2);
		});

		expect(chartInstances[0].options.scales.y1.title.text).toBe('USDT');
		expect(chartInstances[0].data.datasets[0].label).toBe('USDT Balance');
		expect(chartInstances[0].data.datasets[0].data[0].y).toBe(25.5);
		expect(chartInstances[0].data.datasets[1].label).toBe('Total USD');
		expect(screen.queryByText('Historical balance data is temporarily unavailable for USDT on BSC.')).toBeNull();
	});

	it('clears stale BSC datasets when a later fetch returns unavailable history', async () => {
		vi.mocked(balanceHistoryService.getDailyBalances)
			.mockResolvedValueOnce([
				{ date: new Date('2026-03-10T00:00:00Z'), sats: 25.5, usd: 25.5 },
				{ date: new Date('2026-03-11T00:00:00Z'), sats: 30, usd: 30 }
			])
			.mockResolvedValueOnce([
				{ date: new Date('2026-03-12T00:00:00Z'), sats: null, usd: null }
			]);

		render(BalanceChartModal, { isOpen: true, onClose: vi.fn() });

		await waitFor(() => {
			expect(chartInstances.length).toBeGreaterThan(0);
			expect(chartInstances[0].data.datasets.length).toBe(2);
		});

		const rangeSelect = screen.getByLabelText('Date range');
		await fireEvent.change(rangeSelect, { target: { value: 'last_30_days' } });

		await waitFor(() => {
			expect(balanceHistoryService.getDailyBalances).toHaveBeenCalledTimes(2);
		});

		await waitFor(() => {
			expect(
				screen.getByText('Historical balance data is temporarily unavailable for USDT on BSC.')
			).toBeInTheDocument();
			expect(chartInstances[0].data.datasets).toEqual([]);
		});
	});
});
