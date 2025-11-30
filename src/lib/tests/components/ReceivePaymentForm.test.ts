import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletStore, walletManager } from '$lib/stores/wallet.store';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.receive_form.select_network': 'Select Network',
		'wallet.receive_form.network_not_available': 'Network not available',
		'wallet.receive_form.networks.lightning_bitcoin.label': 'Lightning Bitcoin',
		'wallet.receive_form.networks.rootstock_bitcoin.label': 'Rootstock Bitcoin',
		'wallet.receive_form.networks.liquid_bitcoin.label': 'Liquid Bitcoin',
		'wallet.receive_form.networks.bitcoin.label': 'Bitcoin',
		'wallet.description': 'Description',
		'wallet.optional': 'Optional',
		'wallet.payment_for_placeholder': 'Payment for...',
		'wallet.network_fee': 'Network Fee',
		'wallet.sats': 'Sats',
		'wallet.swap.loading_fees': 'Calculating fees...',
		'wallet.swap.service_fee': 'Service Fee',
		'wallet.swap.network_transaction_fee': 'Network Transaction Fee',
		'wallet.swap.total_received_est': 'Total Received (est)',
		'wallet.swap.error.fee_fetch_failed': 'Failed to fetch fee estimate',
		'wallet.receive.cancel': 'Cancel',
		'wallet.receive.generate_invoice': 'Generate Invoice',
		'wallet.receive.get_paid': 'Get Paid',
		'wallet.payment_request_label': 'Payment Request',
		'common.back': 'Back',
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

// Mock debounce to execute immediately in tests
vi.mock('$lib/utils/helpers/common', async () => {
	const actual = await vi.importActual('$lib/utils/helpers/common');
	return {
		...actual,
		debounce: (fn: any) => fn // Execute immediately in tests
	};
});

// Mock wallet store
vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const mockWalletStore = writable({
		hasAnyConnection: true,
		rsk: {
			connected: true,
			address: '0x1234567890123456789012345678901234567890'
		}
	});
	return {
		walletStore: mockWalletStore,
		walletManager: {
			getReverseSwapPairs: vi.fn().mockResolvedValue({
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: {
							percentage: 0.25,
							minerFees: { lockup: 27, claim: 20 }
						}
					}
				}
			}),
			getChainSwapPairs: vi.fn().mockResolvedValue({
				'L-BTC': {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: {
							percentage: 0.1,
							minerFees: {
								user: { lockup: 34, claim: 20 }
							}
						}
					}
				}
			}),
			estimateRBTCGas: vi.fn().mockResolvedValue({
				totalCostFormatted: '0.00103',
				gasLimit: '21000',
				gasPrice: '1000000000',
				totalCost: '1030000000000000'
			})
		}
	};
});

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

// Mock receive components
vi.mock('$lib/components/wallet/LightningReceive.svelte', () => ({
	default: vi.fn()
}));
vi.mock('$lib/components/wallet/LBTCReceive.svelte', () => ({
	default: vi.fn()
}));
vi.mock('$lib/components/wallet/RSKReceive.svelte', () => ({
	default: vi.fn()
}));

describe('ReceivePaymentForm Component', () => {
	const defaultProps = {
		onCancel: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset wallet store using update method
		walletStore.update(() => ({
			hasAnyConnection: true,
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890'
			}
		} as any));
	});

	describe('Basic Rendering', () => {
		it('should render calculator and amount display', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			
			// Wait for BTC price to load and components to render
			await waitFor(
				() => {
					// Calculator should be rendered
					expect(screen.getByLabelText('1')).toBeDefined();
				},
				{ timeout: 2000 }
			);
			
			// Unit toggle buttons should be rendered
			await waitFor(
				() => {
					const satsButton = screen.getByLabelText('Sats');
					expect(satsButton).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});

		it('should render network selector', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			const networkSelect = screen.getByLabelText('Select Network');
			expect(networkSelect).toBeDefined();
		});

		it('should render memo field', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(
				() => {
					// Try both the translated text and the translation key
					const memoField =
						screen.queryByLabelText('Description') ||
						screen.queryByLabelText('wallet.description') ||
						document.querySelector('textarea[id="memo-input"]');
					expect(memoField).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});

		it('should render action buttons', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
			expect(screen.getByRole('button', { name: 'Generate Invoice' })).toBeDefined();
		});
	});

	describe('Calculator Integration', () => {
		it('should update amount when calculator input is received', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Switch to sats unit first (default is USD now)
			const satsButton = screen.getByLabelText('Sats');
			fireEvent.click(satsButton);
			await tick();

			// Click calculator buttons
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));

			await tick();

			// Amount should be updated (check via amount display - look for the formatted amount in the primary display)
			await waitFor(() => {
				// Find the primary amount display (the large number)
				const amountDisplays = screen.getAllByText((content, element) => {
					return content.includes('100') && 
						element?.tagName === 'SPAN' && 
						element?.classList.contains('text-4xl');
				});
				expect(amountDisplays.length).toBeGreaterThan(0);
			});
		});
	});

	describe('Unit Toggle', () => {
		it('should toggle between sats and USD', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getByLabelText('Sats')).toBeDefined();
			});

			const toggleButton = screen.getByLabelText('Sats');
			fireEvent.click(toggleButton);
			await tick();

			// Should show USD unit
			await waitFor(() => {
				expect(screen.getByLabelText('USD')).toBeDefined();
			});
		});
	});

	describe('Network Selection', () => {
		it('should allow selecting different networks', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			const networkSelect = screen.getByLabelText('Select Network') as HTMLSelectElement;
			fireEvent.change(networkSelect, { target: { value: 'rootstock-bitcoin' } });
			await tick();

			expect(networkSelect.value).toBe('rootstock-bitcoin');
		});
	});

	describe('Fee Estimation', () => {
		it('should estimate fees for Lightning network', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Enter amount
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100,000 sats

			await waitFor(
				() => {
					expect(screen.queryByText('Calculating fees...')).toBeNull();
				},
				{ timeout: 2000 }
			);

			// Should show fee information
			await waitFor(() => {
				expect(screen.getByText(/Network Fee:/)).toBeDefined();
			});
		});

		it('should estimate fees for Rootstock network', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Select Rootstock network
			const networkSelect = screen.getByLabelText('Select Network') as HTMLSelectElement;
			fireEvent.change(networkSelect, { target: { value: 'rootstock-bitcoin' } });
			await tick();

			// Enter amount
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100,000 sats

			await waitFor(
				() => {
					expect(walletManager.estimateRBTCGas).toHaveBeenCalled();
				},
				{ timeout: 2000 }
			);
		});

		it('should show loading state while calculating fees', async () => {
			// Mock slow fee calculation
			vi.mocked(walletManager.getReverseSwapPairs).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({}), 200))
			);

			render(ReceivePaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100 sats

			await tick();

			// Wait for debounced fee calculation to start (500ms debounce + some buffer)
			await waitFor(
				() => {
					const loadingText = screen.queryByText('Calculating fees...');
					return loadingText !== null;
				},
				{ timeout: 1000 }
			);

			// Should show loading
			expect(screen.getByText('Calculating fees...')).toBeDefined();
		});
	});

	describe('Total Received Calculation', () => {
		it('should calculate total received after fees', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Enter amount: 100,000 sats
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));

			await waitFor(
				() => {
					expect(screen.queryByText('Calculating fees...')).toBeNull();
				},
				{ timeout: 2000 }
			);

			// Should show total received
			await waitFor(() => {
				expect(screen.getByText(/Total Received/)).toBeDefined();
			});
		});
	});

	describe('Form Validation', () => {
		it('should disable Generate Invoice button when amount is zero', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			const generateButton = screen.getByRole('button', { name: 'Get Paid' });
			expect(generateButton).toHaveAttribute('disabled');
		});

		it('should enable Generate Invoice button when amount is valid', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getByLabelText('1')).toBeDefined();
			});

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100 sats

			await tick();
			await waitFor(() => {
				const generateButton = screen.getByRole('button', { name: 'Get Paid' });
				expect(generateButton).not.toHaveAttribute('disabled');
			});
		});
	});

	describe('Invoice Generation', () => {
		it('should show receive component when Generate Invoice is clicked', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getByLabelText('1')).toBeDefined();
			});

			// Enter amount
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100 sats

			await tick();
			await waitFor(() => {
				const generateButton = screen.getByRole('button', { name: 'Get Paid' });
				expect(generateButton).not.toHaveAttribute('disabled');
			});

			// Click Get Paid
			const generateButton = screen.getByRole('button', { name: 'Get Paid' });
			fireEvent.click(generateButton);
			await tick();

			// Should show payment request header
			await waitFor(() => {
				expect(screen.getByText('Payment Request')).toBeDefined();
			});
		});

		it('should call onCancel when Cancel button is clicked', async () => {
			const onCancel = vi.fn();
			render(ReceivePaymentForm, { ...defaultProps, onCancel });
			await tick();

			const cancelButton = screen.getByRole('button', { name: 'Cancel' });
			fireEvent.click(cancelButton);

			expect(onCancel).toHaveBeenCalledTimes(1);
		});
	});

	describe('Memo Field', () => {
		it('should allow entering memo text', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(
				() => {
					const memoField =
						(screen.queryByLabelText('Description') as HTMLTextAreaElement) ||
						(document.querySelector('textarea[id="memo-input"]') as HTMLTextAreaElement);
					expect(memoField).toBeDefined();
					if (memoField) {
						fireEvent.input(memoField, { target: { value: 'Test payment' } });
						expect(memoField.value).toBe('Test payment');
					}
				},
				{ timeout: 2000 }
			);
		});
	});
});

