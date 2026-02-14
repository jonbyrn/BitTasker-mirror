import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DebugWalletSendForm from '$lib/components/wallet/DebugWalletSendForm.svelte';
import { walletManager, sendRBTC, sendRSKToken, getProvider } from '$lib/stores/wallet.store';
import { appStore } from '$lib/stores/app.store';
import type { TokenBalance } from '$lib/types/wallet';

// Mock i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.debug_wallet.send_form.title': 'Send {token}',
		'wallet.debug_wallet.send_form.recipient_address': 'Recipient Address',
		'wallet.debug_wallet.send_form.recipient_address_placeholder': 'Enter RSK address (0x...)',
		'wallet.debug_wallet.send_form.amount': 'Amount',
		'wallet.debug_wallet.send_form.amount_placeholder': 'Enter amount',
		'wallet.debug_wallet.send_form.available_balance': 'Available Balance',
		'wallet.debug_wallet.send_form.max': 'Max',
		'wallet.debug_wallet.send_form.send': 'Send',
		'wallet.debug_wallet.send_form.sending': 'Sending...',
		'wallet.debug_wallet.send_form.transaction_sent': 'Transaction sent successfully',
		'wallet.debug_wallet.send_form.transaction_failed': 'Transaction failed',
		'wallet.debug_wallet.send_form.transaction_pending': 'Transaction Pending',
		'wallet.debug_wallet.send_form.transaction_successful': 'Transaction Successful',
		'wallet.debug_wallet.send_form.invalid_address': 'Invalid address format',
		'wallet.debug_wallet.send_form.invalid_amount': 'Invalid amount',
		'wallet.debug_wallet.send_form.insufficient_balance': 'Insufficient balance',
		'wallet.debug_wallet.send_form.amount_required': 'Amount is required',
		'wallet.debug_wallet.send_form.address_required': 'Recipient address is required',
		'wallet.debug_wallet.asset_list.native_token': 'Native Token',
		'wallet.debug_wallet.asset_list.erc20_token': 'ERC-20 Token',
		'wallet.send.confirm_payment': 'Confirm Payment',
		'wallet.send.amount': 'Amount',
		'wallet.send.transaction_fee': 'Transaction Fee',
		'wallet.send.total_to_send': 'Total to Send',
		'wallet.send.confirmation_warning': 'Please verify all details before confirming',
		'common.buttons.cancel': 'Cancel',
		'common.buttons.close': 'Close'
	};
	const tStore = readable((key: string, params?: any) => {
		let result = translations[key] || key;
		if (params && result.includes('{token}')) {
			result = result.replace('{token}', params.token || '');
		}
		return result;
	});
	return {
		t: tStore
	};
});

// Mock dependencies
const mockProvider = {
	getTransactionReceipt: vi.fn().mockResolvedValue({ status: 1 })
};

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const mockWalletStore = writable({
		rsk: {
			connected: true,
			address: '0x1234567890123456789012345678901234567890'
		},
		bsc: { connected: false, address: null }
	});
	const gasEstimationResult = {
		totalCostFormatted: '0.001',
		gasLimit: '21000',
		gasPrice: '1000000000',
		totalCost: '21000000000000'
	};
	return {
		walletStore: mockWalletStore,
		walletManager: {
			sendRBTC: vi.fn(),
			sendRSKToken: vi.fn(),
			estimateRBTCGas: vi.fn().mockResolvedValue(gasEstimationResult),
			initialize: vi.fn().mockResolvedValue(undefined)
		},
		sendRBTC: vi.fn(),
		sendRSKToken: vi.fn(),
		estimateERC20Gas: vi.fn().mockResolvedValue(gasEstimationResult),
		getProvider: vi.fn(() => mockProvider),
		formatAddress: vi.fn((addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`)
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/validators', () => ({
	validateRSKAddress: vi.fn((addr: string) => ({
		isValid: addr.startsWith('0x') && addr.length === 42,
		error: addr.startsWith('0x') && addr.length === 42 ? null : 'Invalid address'
	}))
}));

describe('DebugWalletSendForm', () => {
	const mockNativeToken: TokenBalance = {
		address: 'native',
		name: 'Rootstock Bitcoin',
		symbol: 'RBTC',
		decimals: 18,
		balance: '1000000000000000000',
		formattedBalance: '1.0',
		isNative: true,
		icon: '₿'
	};

	const mockERC20Token: TokenBalance = {
		address: '0x1234567890123456789012345678901234567890',
		name: 'Tether USD',
		symbol: 'USDT',
		decimals: 18,
		balance: '500000000000000000',
		formattedBalance: '0.5',
		isNative: false
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Default: transaction confirms so send flow completes (onSuccess called)
		mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should render form with token information', () => {
		render(DebugWalletSendForm, { token: mockNativeToken });

		expect(screen.getByText(/Send RBTC/)).toBeInTheDocument();
		expect(screen.getByText('1.0 RBTC')).toBeInTheDocument();
	});

	it('should validate address on blur', async () => {
		const user = userEvent.setup();
		render(DebugWalletSendForm, { token: mockNativeToken });

		const addressInput = screen.getAllByRole('textbox')[0];
		await user.type(addressInput, 'invalid');
		await user.tab();

		await waitFor(() => {
			expect(screen.getByText(/address.*required|Invalid address/i)).toBeInTheDocument();
		});
	});

	it('should validate amount on blur', async () => {
		const user = userEvent.setup();
		render(DebugWalletSendForm, { token: mockNativeToken });

		const amountInput = screen.getByPlaceholderText('0');
		await user.type(amountInput, '0');
		await user.tab();

		await waitFor(() => {
			expect(screen.getByText(/amount.*required|Invalid amount/i)).toBeInTheDocument();
		});
	});

	it('should prevent sending when amount exceeds balance', async () => {
		const user = userEvent.setup();
		render(DebugWalletSendForm, { token: mockNativeToken });

		const textboxes = screen.getAllByRole('textbox');
		const addressInput = textboxes[0];
		const amountInput = screen.getByPlaceholderText('0');

		await user.type(addressInput, '0x1234567890123456789012345678901234567890');
		await user.type(amountInput, '2.0');
		await user.tab();

		await waitFor(() => {
			expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument();
		});
	});

	it('should set max amount accounting for gas fees when max button is clicked', async () => {
		const user = userEvent.setup();
		
		// Mock gas estimation
		// When no address is provided, it estimates with 90% of balance (0.9 RBTC)
		// So totalCost = 0.9 (amount) + 0.00042 (gas) = 0.90042
		// Gas fee = 0.90042 - 0.9 = 0.00042
		// Max amount = 1.0 - 0.00042 = 0.99958
		vi.mocked(walletManager.estimateRBTCGas).mockResolvedValue({
			gasLimit: '21000',
			gasPrice: '20000000000',
			totalCost: '900420000000000000', // 0.9 + 0.00042 RBTC
			totalCostFormatted: '0.90042'
		});

		render(DebugWalletSendForm, { token: mockNativeToken });

		const maxButton = screen.getByText('Max');
		await user.click(maxButton);

		// Wait for async gas estimation to complete
		await waitFor(
			() => {
				const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
				// Amount should be balance minus gas fees
				// When no address: uses 90% for estimation, then subtracts gas from full balance
				// Gas = 0.90042 - 0.9 = 0.00042
				// Max = 1.0 - 0.00042 = 0.99958
				const amount = parseFloat(amountInput.value);
				expect(amount).toBeLessThan(1.0);
				expect(amount).toBeGreaterThan(0.99);
			},
			{ timeout: 3000 }
		);

		expect(walletManager.estimateRBTCGas as ReturnType<typeof vi.fn>).toHaveBeenCalled();
	});

	it('should send native token when form is submitted', async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		vi.mocked(sendRBTC).mockResolvedValue('0xtxhash');

		render(DebugWalletSendForm, { token: mockNativeToken, onSuccess });

		const textboxes = screen.getAllByRole('textbox');
		const addressInput = textboxes[0];
		const amountInput = screen.getByPlaceholderText('0');
		const sendButton = screen.getByText('Send');

		await user.type(addressInput, '0x1234567890123456789012345678901234567890');
		await user.type(amountInput, '0.5');
		await user.click(sendButton);

		// Wait for confirmation modal
		await waitFor(() => {
			expect(screen.getByText(/Confirm Payment/i)).toBeInTheDocument();
		});
		const confirmButton = screen.getAllByText('Send').find((el) => !(el as HTMLButtonElement).disabled);
		if (confirmButton) await user.click(confirmButton);

		await waitFor(() => {
			expect(sendRBTC).toHaveBeenCalledWith(
				'0x1234567890123456789012345678901234567890',
				'0.5'
			);
		});

		expect(appStore.showSuccessToast).toHaveBeenCalled();
		expect(onSuccess).toHaveBeenCalled();
	});

	it('should send ERC-20 token when form is submitted', async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		vi.mocked(sendRSKToken).mockResolvedValue('0xtxhash');

		render(DebugWalletSendForm, { token: mockERC20Token, onSuccess });

		const textboxes = screen.getAllByRole('textbox');
		const addressInput = textboxes[0];
		const amountInput = screen.getByPlaceholderText('0');
		const sendButton = screen.getByText('Send');

		await user.type(addressInput, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
		await user.type(amountInput, '0.25');
		await user.click(sendButton);

		// Wait for confirmation modal
		await waitFor(() => {
			expect(screen.getByText(/Confirm Payment/i)).toBeInTheDocument();
		});
		const confirmButton = screen.getAllByText('Send').find((el) => !(el as HTMLButtonElement).disabled);
		if (confirmButton) await user.click(confirmButton);

		await waitFor(() => {
			expect(sendRSKToken).toHaveBeenCalledWith(
				mockERC20Token.address,
				'0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				'0.25'
			);
		});

		expect(appStore.showSuccessToast).toHaveBeenCalled();
		expect(onSuccess).toHaveBeenCalled();
	});

	it('should handle send errors gracefully', async () => {
		const user = userEvent.setup();
		const error = new Error('Transaction failed');
		vi.mocked(sendRBTC).mockRejectedValue(error);

		render(DebugWalletSendForm, { token: mockNativeToken });

		const textboxes = screen.getAllByRole('textbox');
		const addressInput = textboxes[0];
		const amountInput = screen.getByPlaceholderText('0');
		const sendButton = screen.getByText('Send');

		await user.type(addressInput, '0x1234567890123456789012345678901234567890');
		await user.type(amountInput, '0.5');
		await user.click(sendButton);

		await waitFor(() => {
			expect(screen.getByText(/Transaction failed/i)).toBeInTheDocument();
		});

		expect(appStore.showErrorToast).toHaveBeenCalled();
	});

	it('should disable form while sending', async () => {
		const user = userEvent.setup();
		vi.mocked(sendRBTC).mockImplementation(
			() => new Promise(() => {}) // Never resolves
		);

		render(DebugWalletSendForm, { token: mockNativeToken });

		const textboxes = screen.getAllByRole('textbox');
		const addressInput = textboxes[0];
		const amountInput = screen.getByPlaceholderText('0');
		const sendButton = screen.getByText('Send');

		await user.type(addressInput, '0x1234567890123456789012345678901234567890');
		await user.type(amountInput, '0.5');
		await user.click(sendButton);

		await waitFor(() => {
			expect(screen.getByText(/Sending/i)).toBeInTheDocument();
		});

		expect(addressInput).toBeDisabled();
		expect(amountInput).toBeDisabled();
		expect(sendButton).toBeDisabled();
	});

	it('should call onClose when cancel button is clicked', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();

		render(DebugWalletSendForm, { token: mockNativeToken, onClose });

		const cancelButton = screen.getByText('Cancel');
		await user.click(cancelButton);

		expect(onClose).toHaveBeenCalled();
	});

	describe('Countdown Timer', () => {
		it.skip('should start countdown at 60 seconds when transaction is pending', async () => {
			vi.useFakeTimers();
			// Stay pending so countdown runs (don't confirm receipt)
			mockProvider.getTransactionReceipt.mockResolvedValue(null);
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			const onSuccess = vi.fn();
			const txHash = '0xtesthash123';
			
			vi.mocked(sendRBTC).mockResolvedValue(txHash);

			render(DebugWalletSendForm, { token: mockNativeToken, onSuccess });

			const textboxes = screen.getAllByRole('textbox');
			const addressInput = textboxes[0];
			const amountInput = screen.getByPlaceholderText('0');
			const sendButton = screen.getByText('Send');

			await user.type(addressInput, '0x1234567890123456789012345678901234567890');
			await user.type(amountInput, '0.5');
			await user.click(sendButton);

			// Wait for confirmation modal
			await waitFor(() => {
				expect(screen.getByText(/Confirm Payment/i)).toBeInTheDocument();
			});

			// Click confirm in modal
			const confirmButton = screen.getByText('Send');
			await user.click(confirmButton);

			// Wait for pending state
			await waitFor(() => {
				expect(screen.getByText(/Transaction Pending/i)).toBeInTheDocument();
			});

			// Check initial countdown value (component starts at 60s)
			expect(screen.getByText(/60s/)).toBeInTheDocument();

			// Advance time by 1 second
			vi.advanceTimersByTime(1000);
			await waitFor(() => {
				expect(screen.getByText(/59s/)).toBeInTheDocument();
			});

			// Advance time by 5 more seconds
			vi.advanceTimersByTime(5000);
			await waitFor(() => {
				expect(screen.getByText(/54s/)).toBeInTheDocument();
			});

			// Advance time to 0
			vi.advanceTimersByTime(54000);
			await waitFor(() => {
				expect(screen.getByText(/0s/)).toBeInTheDocument();
			});
		});

		it.skip('should stop countdown when transaction is confirmed', async () => {
			vi.useFakeTimers();
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			const onSuccess = vi.fn();
			const txHash = '0xtesthash123';
			
			vi.mocked(sendRBTC).mockResolvedValue(txHash);

			render(DebugWalletSendForm, { token: mockNativeToken, onSuccess });

			const textboxes = screen.getAllByRole('textbox');
			const addressInput = textboxes[0];
			const amountInput = screen.getByPlaceholderText('0');
			const sendButton = screen.getByText('Send');

			await user.type(addressInput, '0x1234567890123456789012345678901234567890');
			await user.type(amountInput, '0.5');
			await user.click(sendButton);

			// Wait for confirmation modal
			await waitFor(() => {
				expect(screen.getByText(/Confirm Payment/i)).toBeInTheDocument();
			});

			// Click confirm in modal
			const confirmButton = screen.getByText('Send');
			await user.click(confirmButton);

			// Wait for pending state
			await waitFor(() => {
				expect(screen.getByText(/Transaction Pending/i)).toBeInTheDocument();
			});

			// Advance time by 5 seconds (countdown from 60)
			vi.advanceTimersByTime(5000);
			await waitFor(() => {
				expect(screen.getByText(/55s/)).toBeInTheDocument();
			});

			// Mock transaction receipt as confirmed
			mockProvider.getTransactionReceipt.mockResolvedValue({
				status: 1, // Success
				transactionHash: txHash
			});

			// Advance time to trigger monitoring check (every 3 seconds)
			vi.advanceTimersByTime(3000);

			// Wait for confirmed state
			await waitFor(() => {
				expect(screen.getByText(/Transaction Successful/i)).toBeInTheDocument();
			}, { timeout: 5000 });

			// Countdown should have stopped (should not see 54s or lower once confirmed)
			expect(screen.queryByText(/54s|53s|52s/)).not.toBeInTheDocument();
		});
	});
});

