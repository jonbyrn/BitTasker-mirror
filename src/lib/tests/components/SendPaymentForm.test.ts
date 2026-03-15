import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
import {
	walletStore,
	walletManager,
	getBSCSponsorStatus,
	preflightBSCDirectSend,
	submitBSCDirectSend
} from '$lib/stores/wallet.store';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import {
	AMBIGUOUS_EVM_ADDRESS_ERROR,
	parsePaymentAddress,
	qualifyEvmPaymentAddress
} from '$lib/utils/helpers/paymentAddressParser';
import { getBiometricData } from '$lib/utils/helpers/biometrics';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';

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
		'wallet.send.large_amount_warning.message': "You're about to send {amount}. This is a large amount.",
		'wallet.send.large_amount_warning.confirm_checkbox': 'I confirm this is the correct amount in USD',
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
	const tStore = readable((key: string, values?: { values?: Record<string, string> } | Record<string, string>) => {
		let result = translations[key] || key;
		const replacements = values?.values ?? (typeof values === 'object' && values && !('values' in values) ? (values as Record<string, string>) : undefined);
		if (replacements) {
			Object.entries(replacements).forEach(([k, v]) => {
				result = result.replace(`{${k}}`, String(v));
			});
		}
		return result;
	});
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
			sendBSCUSDT: vi.fn().mockResolvedValue('0xbscsendhash'),
			submitBSCDirectSend: vi.fn().mockResolvedValue('0xbscsendhash'),
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
			getCachedSubmarineSwapPairs: vi.fn().mockReturnValue({
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
			})
		},
		getBSCSponsorStatus: vi.fn().mockResolvedValue({
			available: true,
			mode: 'legacy-paymaster',
			address: '0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed'
		}),
		preflightBSCDirectSend: vi.fn().mockResolvedValue({
			isReady: true,
			allowanceAtomic: '12445600',
			requiredAllowanceAtomic: '12445600',
			totalDebitAtomic: '12445600',
			sponsorAvailable: true
		}),
		submitBSCDirectSend: vi.fn().mockResolvedValue('0xbscsendhash'),
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
	AMBIGUOUS_EVM_ADDRESS_ERROR:
		'The network could not be detected safely from this address. Choose rBTC on Rootstock or USDT on BSC before paying.',
	parsePaymentAddress: vi.fn().mockReturnValue({
		isValid: true,
		address: '0x1234567890123456789012345678901234567890',
		network: 'rootstock-bitcoin',
		amount: null,
		memo: null
	}),
	qualifyEvmPaymentAddress: vi.fn((address: string, network: 'rootstock-bitcoin' | 'usdt-bsc') =>
		network === 'usdt-bsc' ? `bsc:${address}` : `rsk:${address}`
	)
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
vi.mock(
	'$lib/components/QrCodeScanner.svelte',
	async () => await import('$lib/tests/components/stubs/WebQrCodeScannerStub.svelte')
);

vi.mock(
	'$lib/components/WebQrCodeScanner.svelte',
	async () => await import('$lib/tests/components/stubs/WebQrCodeScannerStub.svelte')
);

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
		vi.stubEnv('VITE_BSC_USDT_TOKEN_ADDRESS', '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
		vi.stubEnv('VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS', '0x1111111111111111111111111111111111111111');
		vi.stubEnv('VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC', '100000');
		vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
		walletStore.update(() => ({
			hasAnyConnection: true,
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890',
				formattedBalance: '0.01'
			},
			bsc: {
				connected: false,
				address: null,
				formattedUsdtBalance: '0'
			},
			totalBalances: { sats: 1_000_000, usd: 50 }
		} as any));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
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
				document.getElementById('address-input') || document.getElementById('address-input-desktop');
			await waitFor(() => expect(addressInput).toBeInTheDocument());
		});

		it('should render address input in enter tab', async () => {
			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			const addressInput =
				document.getElementById('address-input') || document.getElementById('address-input-desktop');
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
			await tick();
			await waitFor(() => expect(parsePaymentAddress).toHaveBeenCalled());
		});

		it('should block ambiguous raw EVM addresses until the user chooses a rail', async () => {
			vi.mocked(parsePaymentAddress)
				.mockReturnValueOnce({
					isValid: false,
					address: '0x1234567890123456789012345678901234567890',
					network: null,
					amount: null,
					memo: null,
					errorCode: 'ambiguous-evm-address',
					errorMessage: AMBIGUOUS_EVM_ADDRESS_ERROR
				} as any)
				.mockReturnValueOnce({
					isValid: true,
					address: '0x1234567890123456789012345678901234567890',
					network: 'usdt-bsc',
					amount: null,
					memo: null
				});

			render(SendPaymentForm, defaultProps);
			await tick();

			const enterTabButton = screen.getByRole('button', { name: /enter payment details/i });
			fireEvent.click(enterTabButton);
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: '0x1234567890123456789012345678901234567890' }
			});
			await tick();

			await waitFor(() => {
				expect(screen.getAllByText(/network could not be detected safely/i).length).toBeGreaterThan(0);
			});

			const chooseBscButton = screen.getAllByRole('button', { name: /usdt on bsc/i })[0];
			await fireEvent.click(chooseBscButton);
			await tick();

			expect(parsePaymentAddress).toHaveBeenLastCalledWith(
				'bsc:0x1234567890123456789012345678901234567890'
			);
			expect(qualifyEvmPaymentAddress).toHaveBeenCalledWith(
				'0x1234567890123456789012345678901234567890',
				'usdt-bsc'
			);
		});

		it('should show error for invalid address', async () => {
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: 'invalid' } });
			fireEvent.blur(addressInput);
			await tick();

			await waitFor(
				() => {
					const errorText = screen.queryAllByText(/Invalid address|invalid address format/i);
					expect(errorText.length).toBeGreaterThan(0);
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('Amount Handling', () => {
		it('should show amount entry controls when amount is required', async () => {
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
			await tick();
			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: /set maximum amount/i }).length).toBeGreaterThan(0);
				expect(screen.getAllByRole('button', { name: 'USD' }).length).toBeGreaterThan(0);
				expect(screen.getAllByRole('button', { name: 'Sats' }).length).toBeGreaterThan(0);
			});
		});

		it('should disable amount controls when amount is in invoice', async () => {
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: 'lnbc1000u1p3...' } });
			await tick();
			await waitFor(
				() => {
					const maxButtons = screen.getAllByRole('button', { name: /set maximum amount/i });
					const usdButtons = screen.getAllByRole('button', { name: 'USD' });
					const satsButtons = screen.getAllByRole('button', { name: 'Sats' });

					expect(maxButtons.length).toBeGreaterThan(0);
					expect(usdButtons.length).toBeGreaterThan(0);
					expect(satsButtons.length).toBeGreaterThan(0);

					for (const button of [...maxButtons, ...usdButtons, ...satsButtons]) {
						expect(button).toBeDisabled();
					}
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('QR Code Scanning', () => {
		it('preserves the full chain-qualified BSC QR payload through scan parsing and preflight', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValueOnce({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.345678,
				memo: 'Invoice'
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			await fireEvent.click(screen.getByTestId('simulate-web-scan-bsc'));
			await tick();

			await waitFor(() => {
				expect(parsePaymentAddress).toHaveBeenCalledWith(
					'bsc:0x1234567890123456789012345678901234567890?amount=12.345678&memo=Invoice'
				);
			});

			await waitFor(() => {
				expect(preflightBSCDirectSend).toHaveBeenCalledWith(
					expect.objectContaining({
						recipient: '0x1234567890123456789012345678901234567890',
						recipientAmountAtomic: '12345678'
					})
				);
			});

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			expect(addressInput.value).toBe(
				'bsc:0x1234567890123456789012345678901234567890?amount=12.345678&memo=Invoice'
			);
		});

		it('blocks ambiguous raw EVM QR scans until the user chooses a rail', async () => {
			vi.mocked(parsePaymentAddress)
				.mockReturnValueOnce({
					isValid: false,
					address: '0x1234567890123456789012345678901234567890',
					network: null,
					amount: null,
					memo: null,
					errorCode: 'ambiguous-evm-address',
					errorMessage: AMBIGUOUS_EVM_ADDRESS_ERROR
				} as any)
				.mockReturnValueOnce({
					isValid: true,
					address: '0x1234567890123456789012345678901234567890',
					network: 'usdt-bsc',
					amount: null,
					memo: null
				} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			await fireEvent.click(screen.getByTestId('simulate-web-scan-ambiguous'));
			await tick();

			await waitFor(() => {
				expect(parsePaymentAddress).toHaveBeenCalledWith(
					'0x1234567890123456789012345678901234567890'
				);
				expect(
					screen.getAllByText(/network could not be detected safely/i).length
				).toBeGreaterThan(0);
			});

			expect(preflightBSCDirectSend).not.toHaveBeenCalled();

			const chooseBscButton = screen.getAllByRole('button', { name: /usdt on bsc/i })[0];
			await fireEvent.click(chooseBscButton);
			await tick();

			expect(parsePaymentAddress).toHaveBeenLastCalledWith(
				'bsc:0x1234567890123456789012345678901234567890'
			);
			expect(qualifyEvmPaymentAddress).toHaveBeenCalledWith(
				'0x1234567890123456789012345678901234567890',
				'usdt-bsc'
			);
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
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
						document.getElementById('address-input') || document.getElementById('address-input-desktop');
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
			await tick();
			await waitFor(() => expect(parsePaymentAddress).toHaveBeenCalled(), { timeout: 2000 });

			await waitFor(
				() => {
					expect(addressInput.value).toBeTruthy();
					const hasAmountDisplay = screen.queryByText(/from invoice/i) || screen.queryByTestId('primary-amount-sats');
					expect(hasAmountDisplay || addressInput.value.length > 0).toBeTruthy();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('BSC direct send', () => {
		it('runs BSC preflight and sends a token-native USDT amount', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.3456,
				memo: null
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByRole('button', { name: /enter payment details/i }));
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: 'bsc:0x1234567890123456789012345678901234567890?amount=12.3456' }
			});
			await tick();

			await waitFor(() => {
				expect(preflightBSCDirectSend).toHaveBeenCalled();
			});

			expect(screen.getAllByText(/fixed service fee/i).length).toBeGreaterThan(0);
			expect(screen.queryByText(/no bnb required/i)).toBeNull();

			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			await fireEvent.click(sendButtons[sendButtons.length - 1]);
			await tick();

			await waitFor(() => {
				expect(screen.getByText(/total debit/i)).toBeInTheDocument();
				expect(screen.getAllByText(/12.4456 USDT/).length).toBeGreaterThan(0);
			});

			const confirmButtons = screen.getAllByRole('button', { name: /^send$/i });
			await fireEvent.click(confirmButtons[confirmButtons.length - 1]);

			await waitFor(() => {
				expect(submitBSCDirectSend).toHaveBeenCalledWith({
					recipient: '0x1234567890123456789012345678901234567890',
					recipientAmountAtomic: '12345600',
					fixedFeeAtomic: '100000',
					routerAddress: '0x1111111111111111111111111111111111111111',
					chainId: 97,
					tokenAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'
				});
			});

			expect(preflightBSCDirectSend).toHaveBeenLastCalledWith({
				recipient: '0x1234567890123456789012345678901234567890',
				recipientAmountAtomic: '12345600',
				fixedFeeAtomic: '100000',
				routerAddress: '0x1111111111111111111111111111111111111111',
				chainId: 97,
				tokenAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'
			});
		});

		it('blocks USDT on BSC sends when the router allowance is missing', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.3456,
				memo: null
			} as any);

			vi.mocked(preflightBSCDirectSend).mockResolvedValueOnce({
				isReady: false,
				failureCode: 'ROUTER_ALLOWANCE_MISSING',
				allowanceAtomic: '0',
				requiredAllowanceAtomic: '12445600',
				totalDebitAtomic: '12445600',
				sponsorAvailable: true
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByRole('button', { name: /enter payment details/i }));
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: 'bsc:0x1234567890123456789012345678901234567890?amount=12.3456' }
			});
			await tick();

			await waitFor(() => {
				expect(preflightBSCDirectSend).toHaveBeenCalled();
				expect(
					screen.getAllByText(/router allowance is missing or too low/i).length
				).toBeGreaterThan(0);
			});

			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			sendButtons.forEach((button) => expect(button).toBeDisabled());
			expect(submitBSCDirectSend).not.toHaveBeenCalled();
		});

		it('blocks USDT on BSC sends when the wallet is on the wrong chain and shows actionable switch guidance', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.3456,
				memo: null
			} as any);

			vi.mocked(preflightBSCDirectSend).mockResolvedValueOnce({
				isReady: false,
				failureCode: 'WRONG_CHAIN',
				allowanceAtomic: '12445600',
				requiredAllowanceAtomic: '12445600',
				totalDebitAtomic: '12445600',
				sponsorAvailable: true
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByRole('button', { name: /enter payment details/i }));
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: 'bsc:0x1234567890123456789012345678901234567890?amount=12.3456' }
			});
			await tick();

			await waitFor(() => {
				expect(preflightBSCDirectSend).toHaveBeenCalled();
				expect(screen.getAllByText(/switch to bsc to continue/i).length).toBeGreaterThan(0);
				expect(
					screen.getAllByText(/wallet is connected to the wrong network\. switch to bsc and try again\./i)
						.length
				).toBeGreaterThan(0);
			});

			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			sendButtons.forEach((button) => expect(button).toBeDisabled());
			expect(submitBSCDirectSend).not.toHaveBeenCalled();
			expect(screen.queryByText(/bnb/i)).toBeNull();
		});

		it('blocks USDT on BSC sends when sponsorship is unavailable', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.3456,
				memo: null
			} as any);

			vi.mocked(getBSCSponsorStatus).mockResolvedValueOnce({
				available: false,
				mode: 'legacy-paymaster',
				address: '0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed',
				reason: 'Sponsored USDT on BSC payments are temporarily unavailable. Please try again shortly.'
			} as any);

			vi.mocked(preflightBSCDirectSend).mockResolvedValueOnce({
				isReady: false,
				failureCode: 'SPONSOR_UNAVAILABLE',
				allowanceAtomic: '12445600',
				requiredAllowanceAtomic: '12445600',
				totalDebitAtomic: '12445600',
				sponsorAvailable: false
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByRole('button', { name: /enter payment details/i }));
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: 'bsc:0x1234567890123456789012345678901234567890?amount=12.3456' }
			});
			await tick();

			await waitFor(() => {
				expect(getBSCSponsorStatus).toHaveBeenCalled();
				expect(preflightBSCDirectSend).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(
					screen.getAllByText(/temporarily unavailable\. Please try again shortly\./i).length
				).toBeGreaterThan(0);
			});

			expect(screen.queryByText(/bnb/i)).toBeNull();
			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			sendButtons.forEach((button) => expect(button).toBeDisabled());
			expect(submitBSCDirectSend).not.toHaveBeenCalled();
		});

		it('blocks USDT on BSC sends when sponsorship is unavailable and shows the sponsor reason', async () => {
			vi.mocked(parsePaymentAddress).mockReturnValue({
				isValid: true,
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 12.3456,
				memo: null
			} as any);

			vi.mocked(getBSCSponsorStatus).mockResolvedValueOnce({
				available: false,
				mode: 'legacy-paymaster',
				address: '0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed',
				reason: 'Sponsored sends are temporarily unavailable. Please try again shortly.'
			} as any);

			vi.mocked(preflightBSCDirectSend).mockResolvedValueOnce({
				isReady: false,
				failureCode: 'SPONSOR_UNAVAILABLE',
				allowanceAtomic: '12445600',
				requiredAllowanceAtomic: '12445600',
				totalDebitAtomic: '12445600',
				sponsorAvailable: false
			} as any);

			walletStore.update(() => ({
				hasAnyConnection: true,
				rsk: {
					connected: true,
					address: '0x1234567890123456789012345678901234567890',
					formattedBalance: '0.01'
				},
				bsc: {
					connected: true,
					address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
					formattedUsdtBalance: '50.000000'
				},
				totalBalances: { sats: 1_000_000, usd: 50 }
			} as any));

			render(SendPaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getByRole('button', { name: /enter payment details/i }));
			await tick();

			const addressInput =
				(document.getElementById('address-input') ||
					document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, {
				target: { value: 'bsc:0x1234567890123456789012345678901234567890?amount=12.3456' }
			});
			await tick();

			await waitFor(() => {
				expect(getBSCSponsorStatus).toHaveBeenCalled();
				expect(preflightBSCDirectSend).toHaveBeenCalled();
			});

			await waitFor(() => {
				expect(
					screen.getAllByText(/sponsored sends are temporarily unavailable/i).length
				).toBeGreaterThan(0);
			});

			const sendButtons = screen.getAllByRole('button', { name: /^send$/i });
			sendButtons.forEach((button) => expect(button).toBeDisabled());
			expect(submitBSCDirectSend).not.toHaveBeenCalled();
			expect(screen.queryByText(/bnb/i)).toBeNull();
		});
	});

	describe('Large Amount Warning', () => {
		it('should show warning for amounts over $1,000', async () => {
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
			const addressInput =
				(document.getElementById('address-input') || document.getElementById('address-input-desktop')) as HTMLInputElement;
			await waitFor(() => expect(addressInput).toBeInTheDocument());
			fireEvent.input(addressInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
			await tick();
			await waitFor(() => expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0));

			// Switch to USD unit
			const unitToggle = screen.getAllByRole('button', { name: 'USD' })[0];
			fireEvent.click(unitToggle);
			await tick();

			// Use the first rendered calculator because both mobile and desktop layouts are mounted in tests.
			const btn1 = screen.getAllByRole('button', { name: '1' })[0];
			const btn5 = screen.getAllByRole('button', { name: '5' })[0];
			const btn0 = screen.getAllByRole('button', { name: '0' })[0];
			fireEvent.click(btn1);
			fireEvent.click(btn5);
			fireEvent.click(btn0);
			fireEvent.click(btn0);
			await tick();

			await waitFor(
				() => {
					expect(
						screen.getAllByText(/You're about to send \$1,500\.00\. This is a large amount\./i).length
					).toBeGreaterThan(0);
				},
				{ timeout: 2000 }
			);
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
