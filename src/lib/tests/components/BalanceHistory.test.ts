/* eslint-disable @typescript-eslint/no-explicit-any */
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
vi.mock('$lib/stores/wallet.store', async () => {
	const { writable, derived } = await import('svelte/store');
	const mockWalletStore = writable({
		rsk: {
			provider: {},
			address: '0x1234567890123456789012345678901234567890',
			connected: true,
			balance: '1000000000000000000',
			formattedBalance: '1.0'
		},
		bsc: {
			connected: false,
			address: null,
			provider: null,
			formattedUsdtBalance: '0.00'
		},
		totalBalances: {
			sats: 100000000,
			usd: 50000,
			usdt: 0
		},
		activeNetwork: 'rsk',
		selectedAsset: 'rBTC'
	});
	const totalBalances = derived(mockWalletStore, ($s) => $s.totalBalances);
	return {
		walletStore: mockWalletStore,
		totalBalances,
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats)
	};
});

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const t = readable((key: string) =>
		key === 'wallet.balance_history.error' ? 'Failed to load balance history' : key
	);
	return { t };
});

// Mock haptics
vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }
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
			bsc: {
				connected: false,
				address: null,
				provider: null,
				formattedUsdtBalance: '0.00'
			},
			totalBalances: { sats: 100000000, usd: 50000, usdt: 0 },
			activeNetwork: 'rsk',
			selectedAsset: 'rBTC'
		} as any);
	});

	it('should render loading state initially', () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockImplementation(
			() => new Promise(() => {}) // Never resolves
		);

		render(BalanceHistory, { props: { balancesHidden: false } });

		// Component uses loading spinners during {#await}
		const spinners = document.querySelectorAll('.loading.loading-spinner');
		expect(spinners.length).toBeGreaterThan(0);
	});

	it('should display balance changes when loaded', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

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

		const { container } = render(BalanceHistory, { props: { balancesHidden: true } });

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

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

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

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

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

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

		await waitFor(() => {
			expect(container.textContent).toContain('Failed to load balance history');
		});

		const errorSpan = container.querySelector('.text-error');
		expect(errorSpan).not.toBeNull();
	});

	it('should call service with store values when totalBalances has data', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue(mockBalanceChanges);

		render(BalanceHistory, { props: { balancesHidden: false } });

		await waitFor(() => {
			expect(balanceHistoryService.getBalanceChanges).toHaveBeenCalledWith(
				100000000,
				50000,
				expect.anything(),
				'0x1234567890123456789012345678901234567890',
				expect.objectContaining({
					network: 'rsk',
					assetSymbol: 'RBTC',
					unitLabel: 'sats'
				})
			);
		});
	});

	it('should switch to BSC USDT history context when the BSC rail is active', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: 1.5,
				usdChange: 1.5,
				satsPercentChange: 10,
				usdPercentChange: 10
			}
		]);

		walletStore.set({
			rsk: {
				provider: {},
				address: '0x1234567890123456789012345678901234567890',
				connected: true,
				balance: '1000000000000000000',
				formattedBalance: '1.0'
			},
			bsc: {
				connected: true,
				address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				provider: {},
				formattedUsdtBalance: '25.50'
			},
			totalBalances: { sats: 100000000, usd: 50000, usdt: 25.5 },
			activeNetwork: 'bsc',
			selectedAsset: 'USDT'
		} as any);

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

		await waitFor(() => {
			expect(balanceHistoryService.getBalanceChanges).toHaveBeenCalledWith(
				25.5,
				25.5,
				expect.anything(),
				'0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				expect.objectContaining({
					network: 'bsc',
					assetSymbol: 'USDT',
					unitLabel: 'USDT'
				})
			);
		});

		expect(container.textContent).toContain('1.5 USDT');
	});

	it('should show unavailable placeholders when BSC history is unavailable', async () => {
		vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
			{
				label: '24h',
				satsChange: null,
				usdChange: null,
				satsPercentChange: null,
				usdPercentChange: null
			}
		]);

		walletStore.set({
			rsk: {
				provider: {},
				address: '0x1234567890123456789012345678901234567890',
				connected: true,
				balance: '1000000000000000000',
				formattedBalance: '1.0'
			},
			bsc: {
				connected: true,
				address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				provider: {},
				formattedUsdtBalance: '0.00'
			},
			totalBalances: { sats: 100000000, usd: 50000, usdt: 0 },
			activeNetwork: 'bsc',
			selectedAsset: 'USDT'
		} as any);

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		expect(container.textContent).toContain('N/A');
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

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

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

		const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

		await waitFor(() => {
			expect(container.textContent).toContain('24h');
		});

		expect(container.textContent).toContain('-');
		expect(container.textContent).toMatch(/-.*10[,.]?000[,.]?000/);
		expect(container.textContent).toMatch(/-.*5[,.]?000/);
	});

	describe('BSC USDT Balance Display', () => {
		it('should render real BSC balance, not placeholder text', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '24h',
					satsChange: 1.5,
					usdChange: 1.5,
					satsPercentChange: 5,
					usdPercentChange: 5
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '125.500000'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 125.5 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('24h');
			});

			expect(container.textContent).not.toContain('Coming Soon');
			expect(container.textContent).toContain('1.5 USDT');
		});

		it('should format USDT in token units with correct decimal places', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '7d',
					satsChange: 5.123456,
					usdChange: 5.123456,
					satsPercentChange: 8,
					usdPercentChange: 8
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '50.123456'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 50.123456 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('7d');
			});

			expect(container.textContent).toMatch(/5\.123456 USDT/);
		});

		it('should refresh BSC balance data when activeNetwork changes to BSC', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '24h',
					satsChange: 2.5,
					usdChange: 2.5,
					satsPercentChange: 10,
					usdPercentChange: 10
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: false,
					address: null,
					provider: null,
					formattedUsdtBalance: '0.00'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 0 },
				activeNetwork: 'rsk',
				selectedAsset: 'RBTC'
			} as any);

			const { rerender, container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('24h');
			});

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '75.250000'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 75.25 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			await rerender(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(balanceHistoryService.getBalanceChanges).toHaveBeenCalledWith(
					expect.any(Number),
					expect.any(Number),
					expect.anything(),
					'0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					expect.objectContaining({
						network: 'bsc',
						assetSymbol: 'USDT',
						unitLabel: 'USDT'
					})
				);
			});
		});

		it('should handle zero BSC balance gracefully', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '24h',
					satsChange: 0,
					usdChange: 0,
					satsPercentChange: 0,
					usdPercentChange: 0
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '0.00'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 0 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('24h');
			});

			expect(container.textContent).toContain('0 USDT');
		});

		it('should display USDT change indicators correctly', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '24h',
					satsChange: 10.5,
					usdChange: 10.5,
					satsPercentChange: 12,
					usdPercentChange: 12
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '110.5'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 110.5 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('24h');
			});

			const successElements = container.querySelectorAll('.text-success, .text-success\\/80');
			expect(successElements.length).toBeGreaterThan(0);
		});

		it('should format USDT changes without percentage text', async () => {
			vi.mocked(balanceHistoryService.getBalanceChanges).mockResolvedValue([
				{
					label: '30d',
					satsChange: 25.75,
					usdChange: 25.75,
					satsPercentChange: 18.5,
					usdPercentChange: 18.5
				}
			]);

			walletStore.set({
				rsk: {
					provider: {},
					address: '0x1234567890123456789012345678901234567890',
					connected: true,
					balance: '1000000000000000000',
					formattedBalance: '1.0'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					provider: {},
					formattedUsdtBalance: '165.75'
				},
				totalBalances: { sats: 100000000, usd: 50000, usdt: 165.75 },
				activeNetwork: 'bsc',
				selectedAsset: 'USDT'
			} as any);

			const { container } = render(BalanceHistory, { props: { balancesHidden: false } });

			await waitFor(() => {
				expect(container.textContent).toContain('30d');
			});

			expect(container.textContent).toContain('+25.75 USDT');
			expect(container.textContent).toContain('+$25.75');
			expect(container.textContent).not.toMatch(/18\.5%/);
		});
	});
});
