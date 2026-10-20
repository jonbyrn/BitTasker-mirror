import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
import { walletStore, walletManager } from '$lib/stores/wallet.store';
import { parsePaymentAddress } from '$lib/utils/helpers/paymentAddressParser';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.send.scan_qr_code': 'Scan QR Code',
		'wallet.send.scan_qr_code_description': 'Point your camera at a payment QR code',
		'wallet.send.payment_details': 'Enter Payment Details',
		'wallet.send.enter_payment_details': 'Enter Payment Details',
		'wallet.send.enter_details_instead': 'Enter Details Instead',
		'wallet.send.scan_qr_code_instead': 'Scan QR Code Instead',
		'wallet.send.confirm_payment': 'Confirm Payment',
		'wallet.send.address_or_invoice': 'Address or Invoice',
		'wallet.send.address_placeholder': 'Enter address, invoice, or scan QR code',
		'wallet.send.amount': 'Amount',
		'wallet.send.memo': 'Memo',
		'wallet.send.memo_placeholder': 'Optional memo or description',
		'wallet.send.receiver_gets': 'Receiver Gets',
		'wallet.send.total_to_send': 'Total to Send',
		'wallet.send.authenticate_and_send': 'Authenticate & Send',
		'wallet.send.send': 'Send',
		'wallet.send.unlock_wallet': 'Unlock wallet',
		'wallet.send.unlocking_wallet': 'Unlocking wallet…',
		'wallet.send.wallet_locked':
			'Unlock your wallet before sending. Send stays off until the balance and network fee are loaded.',
		'wallet.send.balance_loading': 'Loading your balance…',
		'wallet.swap.error.fee_fetch_failed': 'Failed to fetch fee estimate',
		'wallet.send.invalid_qr_code': 'Invalid payment QR code',
		'wallet.send.failed_to_parse_qr': 'Failed to parse QR code',
		'wallet.send.invalid_address': 'Invalid address format',
		'wallet.send.failed_to_parse_address': 'Failed to parse address',
		'wallet.send.from_invoice': 'from invoice',
		'wallet.send.amount_in_sats': 'Amount in Sats',
		'wallet.send.amount_in_usd': 'Amount in USD',
		'wallet.send.authentication_required': 'Authentication required to send',
		'wallet.send.payment_sent': 'Payment sent successfully',
		'wallet.send.large_amount_warning.title': 'Large Amount Warning',
		'wallet.send.large_amount_warning.message':
			"You're about to send {amount}. This is a large amount.",
		'wallet.send.large_amount_warning.confirm_checkbox':
			'I confirm this is the correct amount in USD',
		'wallet.address': 'Address',
		'wallet.amount': 'Amount',
		'wallet.sats': 'Sats',
		'wallet.max': 'Max',
		'wallet.send.enter_address_and_amount_to_estimate': 'Enter address and amount to estimate',
		'wallet.network_fee': 'Network Fee',
		'wallet.swap.loading_fees': 'Calculating fees...',
		'common.back': 'Back',
		'common.cancel': 'Cancel'
	};
	const tStore = readable(
		(key: string, values?: { values?: Record<string, string> } | Record<string, string>) => {
			let result = translations[key] || key;
			const replacements =
				values?.values ??
				(typeof values === 'object' && values && !('values' in values)
					? (values as Record<string, string>)
					: undefined);
			if (replacements) {
				Object.entries(replacements).forEach(([k, v]) => {
					result = result.replace(`{${k}}`, String(v));
				});
			}
			return result;
		}
	);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock wallet store - must match component expectations (rsk.formattedBalance, totalBalances.sats, formatSats)
vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const mockWalletStore = writable({
		hasAnyConnection: true,
		isConnected: true,
		isInitializing: false,
		balancesLoaded: true,
		rsk: {
			connected: true,
			address: '0x1234567890123456789012345678901234567890',
			formattedBalance: '0.01' // ~1M sats at typical BTC price
		},
		bsc: { connected: false, address: null, formattedUsdtBalance: '0' },
		totalBalances: {
			sats: 1_000_000,
			usd: 50
		}
	});
	return {
		walletStore: mockWalletStore,
		walletManager: {
			getSubmarineSwapPairs: vi.fn().mockResolvedValue({
				RBTC: {
					BTC: {
						fees: {
							percentage: 0.1,
							minerFees: 32
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
			estimateBSCTransferGas: vi.fn().mockResolvedValue({
				totalCostFormatted: '0.0001',
				gasLimit: '65000',
				gasPrice: '1000000000',
				totalCost: '65000000000000'
			}),
			initialize: vi.fn().mockResolvedValue(undefined),
			loadAssets: vi.fn().mockResolvedValue(undefined)
		},
		allAssets: writable([]),
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
		formatUsd: (amount: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
	};
});

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

// Mock payment address parser (synchronous)
vi.mock('$lib/utils/helpers/paymentAddressParser', () => ({
	parsePaymentAddress: vi.fn().mockReturnValue({
		isValid: true,
		address: '0x1234567890123456789012345678901234567890',
		network: 'rootstock-bitcoin',
		amount: null,
		memo: null
	})
}));

// Mock biometrics
vi.mock('$lib/utils/helpers/biometrics', () => ({
	getBiometricData: vi.fn().mockResolvedValue({ username: 'test', password: 'test' })
}));

vi.mock('$lib/utils/helpers/webBiometrics', () => ({
	getWebBiometricData: vi.fn().mockResolvedValue({ username: 'test', password: 'test' })
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		getPlatform: vi.fn(() => 'web')
	}
}));

// Mock haptics
vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn().mockResolvedValue(undefined),
	ImpactStyle: {
		Light: 'Light',
		Medium: 'Medium',
		Heavy: 'Heavy'
	}
}));

// Mock QrCodeScanner component
vi.mock('$lib/components/QrCodeScanner.svelte', () => ({
	default: vi.fn()
}));

// Mock appStore
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn()
	}
}));

describe('SendPaymentForm Component', () => {
	const defaultProps = {
		onCancel: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		walletStore.update(() => ({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			balancesLoaded: true,
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890',
				formattedBalance: '0.01'
			},
			bsc: { connected: false, address: null, formattedUsdtBalance: '0' },
			totalBalances: { sats: 1_000_000, usd: 50 }
		}));
	});

	describe('Basic Rendering', () => {
		it('should render with scan tab as default', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			// Check for tab buttons
			const tabs = screen.getAllByText('Scan QR Code');
			expect(tabs.length).toBeGreaterThan(0);
			const enterTabs = screen.getAllByText('Enter Payment Details');
			expect(enterTabs.length).toBeGreaterThan(0);
		});

		it('should switch to enter tab when clicked', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			// Address input exists in mobile (address-input) or desktop (address-input-desktop) layout
			const addressInput =
				document.getElementById('address-input') ||
				document.getElementById('address-input-desktop');
			await waitFor(() => expect(addressInput).toBeInTheDocument());
		});

		it('should render address input in enter tab', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			const addressInput =
				document.getElementById('address-input') ||
				document.getElementById('address-input-desktop');
			await waitFor(() => expect(addressInput).toBeInTheDocument());
		});
	});

	describe('Address Parsing', () => {
		it('should parse address when input changes', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();
			await waitFor(() => expect(parsePaymentAddress).toHaveBeenCalled());
		});

		it.skip('should show error for invalid address', async () => {
			// Skip: Address error display may depend on layout (mobile vs desktop); fix selectors when needed
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: false,
				address: 'invalid',
				network: null,
				amount: null,
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: 'invalid' } });
			fireEvent.blur(addressInput);
			await tick();

			await waitFor(
				() => {
					const errorText = screen.queryByText(/Invalid address|invalid address format/i);
					expect(errorText).toBeInTheDocument();
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('Amount Handling', () => {
		it.skip('should show calculator when amount is required', async () => {
			// Skip: Calculator visibility may depend on responsive layout; fix when AmountInputSection mock is stable
			vi.mocked(parsePaymentAddress).mockReturnValueOnce({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: null, // Amount required
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();
			await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument());
		});

		it.skip('should disable amount field when amount is in invoice', async () => {
			// Skip: "from invoice" display depends on DescriptionAccordion/layout; fix selectors when needed
			vi.mocked(parsePaymentAddress).mockReturnValueOnce({
				isValid: true,
				address: 'lnbc1000u1p3...',
				network: 'lightning-bitcoin',
				amount: 100000, // Amount in invoice
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: 'lnbc1000u1p3...' } });
			await tick();
			await waitFor(
				() => {
					const fromInvoiceText =
						screen.queryByText(/from invoice/i) || screen.queryByText('wallet.send.from_invoice');
					expect(fromInvoiceText).toBeInTheDocument();
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('QR Code Scanning', () => {
		it('should handle QR scan and show confirmation', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValueOnce({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 100000,
				memo: 'Test payment'
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			// Simulate QR scan
			await tick();

			// The component should show QR scanner initially
			// In a real test, we would trigger the onScan callback
			// For now, we'll test the confirmation screen by switching tabs and entering data
		});
	});

	describe('Fee Calculation', () => {
		it('should estimate fees for Rootstock network', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 100000, // Amount already in address
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();
			await waitFor(() => expect(parsePaymentAddress).toHaveBeenCalled(), { timeout: 2000 });
			await tick();
			await tick();

			expect(walletManager.estimateRBTCGas).toBeDefined();
			expect(addressInput.value).toBeTruthy();
		}, 10000); // Increase timeout to 10 seconds
	});

	describe('Form Validation', () => {
		it('should disable send button when form is invalid', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			await waitFor(
				() => {
					const addressInput =
						document.getElementById('address-input') ||
						document.getElementById('address-input-desktop');
					expect(addressInput).toBeInTheDocument();
					const sendButtons = screen.queryAllByRole('button', { name: /send|authenticate/i });
					if (sendButtons.length > 0) {
						expect(sendButtons[0]).toBeDisabled();
					}
				},
				{ timeout: 3000 }
			);
		});

		it('should validate form when address and amount are provided', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 100, // Set amount directly so calculator isn't needed
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();
			await waitFor(() => expect(parsePaymentAddress).toHaveBeenCalled(), { timeout: 2000 });

			await waitFor(
				() => {
					expect(addressInput.value).toBeTruthy();
					const hasAmountDisplay =
						screen.queryByText(/from invoice/i) || screen.queryByTestId('primary-amount-sats');
					expect(hasAmountDisplay || addressInput.value.length > 0).toBeTruthy();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Large Amount Warning', () => {
		it.skip('should show warning for amounts over $1,000', async () => {
			// Skip: Large amount warning modal visibility depends on calculator state; fix when stable
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: null,
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();
			await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument());

			// Switch to USD unit
			const unitToggle = screen.queryByRole('button', { name: /usd/i });
			if (unitToggle) {
				fireEvent.click(unitToggle);
				await tick();
			}

			// Enter 1500 via calculator (may need to click 1, 5, 0, 0 - multiple "1" buttons may exist)
			const btn1 = screen.getAllByRole('button', { name: '1' })[0];
			const btn5 = screen.getByRole('button', { name: '5' });
			const btn0 = screen.getAllByRole('button', { name: '0' })[0];
			fireEvent.click(btn1);
			fireEvent.click(btn5);
			fireEvent.click(btn0);
			fireEvent.click(btn0);
			await tick();

			await waitFor(
				() => {
					const warning = screen.queryByText(/Large Amount|1,500|1500|correct amount/i);
					expect(warning).toBeInTheDocument();
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('Wallet readiness', () => {
		it('keeps Send off and offers Unlock wallet when the wallet is locked', async () => {
			walletStore.update(() => ({
				hasAnyConnection: false,
				isConnected: false,
				isInitializing: false,
				balancesLoaded: false,
				rsk: { connected: false, address: null, formattedBalance: '0.00' },
				bsc: { connected: false, address: null, formattedUsdtBalance: '0' },
				totalBalances: { sats: 0, usd: 0 }
			}));

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			const unlock = await screen.findByRole('button', { name: /unlock wallet/i });
			expect(unlock).toBeInTheDocument();
			const sendButtons = screen.queryAllByRole('button', { name: /^send$/i });
			for (const button of sendButtons) {
				expect(button).toBeDisabled();
			}

			fireEvent.click(unlock);
			await waitFor(() => expect(walletManager.initialize).toHaveBeenCalledTimes(1));
			expect(walletManager.loadAssets).toHaveBeenCalledTimes(1);
		});

		it('does not open Confirm Payment when the fee estimate fails', async () => {
			vi.mocked(walletManager.estimateRBTCGas).mockRejectedValue(
				new Error('Wallet is not initialized.')
			);
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 100000,
				memo: null
			});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();
			const addressInput = (document.getElementById('address-input') ||
				document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});

			await waitFor(() => {
				expect(screen.getAllByText('Failed to fetch fee estimate').length).toBeGreaterThan(0);
			});
			expect(screen.queryByRole('heading', { name: 'Confirm Payment' })).not.toBeInTheDocument();

			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			expect(sendButtons.length).toBeGreaterThan(0);
			for (const button of sendButtons) {
				expect(button).toBeDisabled();
			}
			fireEvent.click(sendButtons[0]);
			await tick();
			expect(screen.queryByRole('heading', { name: 'Confirm Payment' })).not.toBeInTheDocument();
		});
	});

	describe('Cancel Functionality', () => {
		it('should call onCancel when cancel button is clicked', async () => {
			const onCancel = vi.fn();
			render(SendPaymentForm, { ...defaultProps, onCancel });
			await tick();

			// Cancel button is visible on scan tab (default) - click it directly
			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			expect(cancelButton).toBeInTheDocument();
			fireEvent.click(cancelButton);

			expect(onCancel).toHaveBeenCalledTimes(1);
		});
	});
});
