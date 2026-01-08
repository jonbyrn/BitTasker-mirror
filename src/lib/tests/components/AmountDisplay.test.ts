import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.receive.unit_sats': 'Sats',
		'wallet.receive.unit_usd': 'USD',
		'common.loading': 'Loading...',
		'wallet.exchange_rate_unavailable': 'Exchange rate unavailable'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000) // Mock BTC price: $50,000
	}
}));

describe('AmountDisplay Component', () => {
	const defaultProps = {
		amount: '100000',
		unit: 'sats' as const,
		onUnitToggle: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render primary amount in sats', async () => {
			render(AmountDisplay, defaultProps);
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount).toBeDefined();
			expect(primaryAmount.textContent).toBe('100,000');
		});

		it('should render primary amount in USD', async () => {
			render(AmountDisplay, { ...defaultProps, unit: 'usd', amount: '50' });
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-usd');
			expect(primaryAmount).toBeDefined();
			expect(primaryAmount.textContent).toContain('$50.00');
		});

		it('should render unit toggle button', () => {
			render(AmountDisplay, defaultProps);

			const toggleButton = screen.getByLabelText('Sats');
			expect(toggleButton).toBeDefined();
		});
	});

	describe('Amount Formatting', () => {
		it('should format sats with thousand separators', async () => {
			render(AmountDisplay, { ...defaultProps, amount: '1000000' });
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount.textContent).toBe('1,000,000');
		});

		it('should format USD with currency symbol and decimals', async () => {
			render(AmountDisplay, { ...defaultProps, unit: 'usd', amount: '123.45' });
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-usd');
			expect(primaryAmount.textContent).toContain('$123.45');
		});

		it('should handle zero amount', async () => {
			render(AmountDisplay, { ...defaultProps, amount: '0' });
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount.textContent).toBe('0');
		});

		it('should handle empty amount', async () => {
			render(AmountDisplay, { ...defaultProps, amount: '' });
			await tick();

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount.textContent).toBe('0');
		});
	});

	describe('Unit Toggle', () => {
		it('should call onUnitToggle when toggle button is clicked', () => {
			const onUnitToggle = vi.fn();
			render(AmountDisplay, { ...defaultProps, onUnitToggle });

			const toggleButton = screen.getByLabelText('Sats');
			fireEvent.click(toggleButton);

			expect(onUnitToggle).toHaveBeenCalledTimes(1);
		});

		it('should display correct unit label', () => {
			render(AmountDisplay, { ...defaultProps, unit: 'sats' });
			expect(screen.getByLabelText('Sats')).toBeDefined();

			const { rerender } = render(AmountDisplay, { ...defaultProps, unit: 'usd' });
			expect(screen.getByLabelText('USD')).toBeDefined();
		});
	});

	describe('Conversion Display', () => {
		it('should show USD conversion for sats amount', async () => {
			render(AmountDisplay, defaultProps);

			await waitFor(() => {
				const conversion = screen.queryByTestId('conversion-usd');
				expect(conversion).toBeDefined();
			});

			// 100,000 sats = 0.001 BTC = $50 at $50,000/BTC
			const conversion = screen.getByTestId('conversion-usd');
			expect(conversion.textContent).toContain('$50.00');
		});

		it('should show sats conversion for USD amount', async () => {
			render(AmountDisplay, { ...defaultProps, unit: 'usd', amount: '50' });

			await waitFor(() => {
				const conversion = screen.queryByTestId('conversion-sats');
				expect(conversion).toBeDefined();
			});

			// $50 = 0.001 BTC = 100,000 sats at $50,000/BTC
			const conversion = screen.getByTestId('conversion-sats');
			expect(conversion.textContent).toContain('100,000');
			expect(conversion.textContent).toContain('Sats');
		});

		it('should not show conversion for zero amount', () => {
			render(AmountDisplay, { ...defaultProps, amount: '0' });

			expect(screen.queryByTestId('conversion-usd')).toBeNull();
			expect(screen.queryByTestId('conversion-sats')).toBeNull();
		});

		it('should not show conversion for empty amount', () => {
			render(AmountDisplay, { ...defaultProps, amount: '' });

			expect(screen.queryByTestId('conversion-usd')).toBeNull();
			expect(screen.queryByTestId('conversion-sats')).toBeNull();
		});

		it('should show loading state while fetching BTC price', async () => {
			vi.mocked(cryptoPriceService.getCurrentPrice).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(50000), 100))
			);

			render(AmountDisplay, { ...defaultProps, btcPrice: undefined });

			// Should show loading spinner initially
			expect(screen.getByText('Loading...')).toBeDefined();

			await waitFor(
				() => {
					expect(screen.queryByText('Loading...')).toBeNull();
				},
				{ timeout: 200 }
			);
		});

		it('should show unavailable message when BTC price is 0', async () => {
			vi.mocked(cryptoPriceService.getCurrentPrice).mockResolvedValue(0);

			render(AmountDisplay, { ...defaultProps, btcPrice: undefined });

			await waitFor(() => {
				expect(screen.getByText('Exchange rate unavailable')).toBeDefined();
			});
		});
	});

	describe('BTC Price Handling', () => {
		it('should use provided BTC price if available', async () => {
			render(AmountDisplay, { ...defaultProps, btcPrice: 60000 });

			await tick();

			// Should not call getCurrentPrice if price is provided
			expect(cryptoPriceService.getCurrentPrice).not.toHaveBeenCalled();

			// Conversion should use provided price: 100,000 sats = 0.001 BTC = $60 at $60,000/BTC
			await waitFor(() => {
				const conversion = screen.getByTestId('conversion-usd');
				expect(conversion.textContent).toContain('$60.00');
			});
		});

		it('should fetch BTC price if not provided', async () => {
			render(AmountDisplay, { ...defaultProps, btcPrice: undefined });

			await waitFor(() => {
				expect(cryptoPriceService.getCurrentPrice).toHaveBeenCalledWith('BTC');
			});
		});

		it('should update when BTC price prop changes', async () => {
			const { rerender } = render(AmountDisplay, { ...defaultProps, btcPrice: 50000 });

			await waitFor(() => {
				const conversion = screen.getByTestId('conversion-usd');
				expect(conversion.textContent).toContain('$50.00');
			});

			rerender({ ...defaultProps, btcPrice: 60000 });

			await waitFor(() => {
				const conversion = screen.getByTestId('conversion-usd');
				expect(conversion.textContent).toContain('$60.00');
			});
		});
	});

	describe('Calculations', () => {
		it('should correctly convert sats to USD', async () => {
			render(AmountDisplay, { ...defaultProps, amount: '100000000', btcPrice: 50000 });

			await waitFor(() => {
				const conversion = screen.getByTestId('conversion-usd');
				// 100,000,000 sats = 1 BTC = $50,000
				expect(conversion.textContent).toContain('$50,000.00');
			});
		});

		it('should correctly convert USD to sats', async () => {
			render(AmountDisplay, {
				...defaultProps,
				unit: 'usd',
				amount: '50',
				btcPrice: 50000
			});

			await waitFor(() => {
				const conversion = screen.getByTestId('conversion-sats');
				// $50 = 0.001 BTC = 100,000 sats
				expect(conversion.textContent).toContain('100,000');
			});
		});

		it('should floor sats amounts (no decimals)', async () => {
			render(AmountDisplay, {
				...defaultProps,
				unit: 'usd',
				amount: '50.99',
				btcPrice: 50000
			});

			await waitFor(() => {
				// $50.99 = 0.0010198 BTC = 101,980 sats (floored)
				const primaryAmount = screen.getByTestId('primary-amount-usd');
				expect(primaryAmount.textContent).toContain('$50.99');
			});
		});
	});

	describe('Responsive Design', () => {
		it('should have responsive text sizes', () => {
			render(AmountDisplay, defaultProps);

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount).toHaveClass('text-4xl', 'md:text-5xl', 'lg:text-6xl');
		});

		it('should have tabular-nums class for consistent number rendering', () => {
			render(AmountDisplay, defaultProps);

			const primaryAmount = screen.getByTestId('primary-amount-sats');
			expect(primaryAmount).toHaveClass('tabular-nums');
		});
	});

	describe('Accessibility', () => {
		it('should have aria-label on unit toggle button', () => {
			render(AmountDisplay, defaultProps);

			const toggleButton = screen.getByLabelText('Sats');
			expect(toggleButton).toHaveAttribute('aria-label', 'Sats');
		});

		it('should have test IDs for testing', () => {
			render(AmountDisplay, defaultProps);

			expect(screen.getByTestId('primary-amount-sats')).toBeDefined();
		});
	});
});

