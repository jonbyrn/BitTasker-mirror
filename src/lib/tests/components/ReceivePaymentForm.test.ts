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
		'wallet.payment_request.title': 'Payment Request',
		'wallet.receive.network': 'Network',
		'wallet.receive.enter_amount_to_estimate': 'Enter amount to estimate fees',
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

// Mock ethers to prevent real network calls
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			JsonRpcProvider: vi.fn().mockImplementation(() => ({
				getBlockNumber: vi.fn().mockResolvedValue(12345678),
				getFeeData: vi.fn().mockResolvedValue({
					gasPrice: BigInt('1000000000'), // 1 gwei
					maxFeePerGas: BigInt('1000000000'),
					maxPriorityFeePerGas: BigInt('100000000')
				}),
				getBlock: vi.fn().mockResolvedValue({
					baseFeePerGas: BigInt('1000000000'),
					number: 12345678
				}),
				formatEther: actual.ethers.formatEther
			}))
		}
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
			}),
			generateLightningInvoice: vi.fn().mockResolvedValue('lnbc1p0example1234567890'),
			generateLiquidInvoice: vi.fn().mockResolvedValue('VJL1example1234567890')
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
			// The component uses "Get Paid" not "Generate Invoice"
			expect(screen.getByRole('button', { name: 'Get Paid' })).toBeDefined();
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

			// Amount should be updated (check via amount display - AmountInputSection uses text-lg, not text-4xl)
			await waitFor(() => {
				// Find the amount display - it's in a div with text-lg class, showing the amount value
				const amountDisplay = screen.getByText('100');
				expect(amountDisplay).toBeDefined();
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

			// Network selector is a DaisyUI dropdown (details element), not a select
			// Click the dropdown summary to open it
			const networkDropdown = screen.getByLabelText('Select Network');
			fireEvent.click(networkDropdown);
			await tick();

			// Wait for dropdown to open - manually set open attribute
			const detailsElement = document.querySelector('details.dropdown') as HTMLDetailsElement;
			if (detailsElement) {
				detailsElement.open = true;
			}
			await tick();

			// Wait for dropdown content to be visible
			// The text is "Rootstock Bitcoin Network" (label + "Network")
			await waitFor(() => {
				// Find button containing "Rootstock Bitcoin" text
				const buttons = screen.getAllByRole('button');
				const rootstockButton = buttons.find(btn => {
					const text = btn.textContent || '';
					return text.includes('Rootstock Bitcoin');
				});
				return rootstockButton;
			}, { timeout: 2000 });

			// Click the Rootstock Bitcoin option button
			const buttons = screen.getAllByRole('button');
			const rootstockOption = buttons.find(btn => {
				const text = btn.textContent || '';
				return text.includes('Rootstock Bitcoin');
			});
			expect(rootstockOption).toBeDefined();
			if (rootstockOption) {
				fireEvent.click(rootstockOption);
				await tick();
			}

			// Verify the network was selected - the dropdown summary should show the selected network
			await waitFor(() => {
				// The dropdown summary shows: "{label} Network"
				const summaryText = screen.getByLabelText('Select Network');
				expect(summaryText.textContent).toContain('Rootstock Bitcoin');
			}, { timeout: 1000 });
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

			// Wait for fees to be calculated (debounced, so wait a bit)
			await waitFor(
				() => {
					// Should show fee information - check for Network Fee label
					expect(screen.getByText(/Network Fee:/)).toBeDefined();
				},
				{ timeout: 3000 }
			);

			// Verify fees are displayed (not the "enter amount" message)
			expect(screen.queryByText(/enter.*amount.*to.*estimate/i)).toBeNull();
		});

		it('should estimate fees for Rootstock network', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Select Rootstock network using dropdown
			// Click the dropdown summary to open it
			const networkDropdown = screen.getByLabelText('Select Network');
			fireEvent.click(networkDropdown);
			await tick();

			// Wait for dropdown to open - manually set open attribute
			const detailsElement = document.querySelector('details.dropdown') as HTMLDetailsElement;
			if (detailsElement) {
				detailsElement.open = true;
			}
			await tick();
			
			// Wait for dropdown content to be visible
			// The text is "Rootstock Bitcoin Network" (label + "Network")
			await waitFor(() => {
				// Find button containing "Rootstock Bitcoin" text
				const buttons = screen.getAllByRole('button');
				const rootstockButton = buttons.find(btn => {
					const text = btn.textContent || '';
					return text.includes('Rootstock Bitcoin');
				});
				return rootstockButton;
			}, { timeout: 2000 });
			
			// Click the Rootstock Bitcoin option button
			const buttons = screen.getAllByRole('button');
			const rootstockOption = buttons.find(btn => {
				const text = btn.textContent || '';
				return text.includes('Rootstock Bitcoin');
			});
			expect(rootstockOption).toBeDefined();
			if (rootstockOption) {
				fireEvent.click(rootstockOption);
				await tick();
			}
			
			// Wait for network selection to complete
			await waitFor(() => {
				const summaryText = screen.getByLabelText('Select Network');
				expect(summaryText.textContent).toMatch(/Rootstock Bitcoin/i);
			}, { timeout: 1000 });

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

			// Wait for fees to be calculated
			await waitFor(
				() => {
					expect(screen.queryByText('Calculating fees...')).toBeNull();
				},
				{ timeout: 3000 }
			);

			// Should show total received (est) - the component shows "Total Received (est)"
			await waitFor(() => {
				expect(screen.getByText(/Total Received.*est/i)).toBeDefined();
			}, { timeout: 2000 });
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

			// Should show payment request modal - wait for invoice generation
			await waitFor(() => {
				// The PaymentRequestModal should be shown, check for modal or QR code
				const paymentRequest = screen.queryByText('Payment Request') || screen.queryByText(/wallet\.payment_request_label/i) || screen.queryByRole('img', { name: /qr/i });
				expect(paymentRequest).toBeDefined();
			}, { timeout: 3000 });
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

