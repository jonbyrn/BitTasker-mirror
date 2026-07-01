import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
import { walletManager } from '$lib/stores/wallet.store';
import { getProvider } from '$lib/stores/wallet.store';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.send.success.payment_sent': 'Payment Sent!',
		'wallet.send.success.sent_to': 'sent to',
		'wallet.send.success.transaction_hash': 'Transaction Hash',
		'wallet.send.success.view_on_explorer': 'View on Explorer',
		'wallet.send.success.transaction_confirmed': 'Transaction confirmed',
		'wallet.send.transaction_confirmed': 'Transaction confirmed',
		'wallet.sats': 'Sats',
		'wallet.network': 'Network',
		'wallet.transaction.status': 'Status',
		'wallet.transaction.status.confirmed': 'Confirmed',
		'wallet.transaction.status.pending': 'Pending',
		'wallet.transaction.status.confirmations': 'Confirmations',
		'wallet.copy': 'Copy',
		'wallet.transaction.hash_copied': 'Transaction hash copied',
		'common.done': 'Done'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock wallet store
vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const mockWalletStore = writable({
		rsk: {
			provider: null
		},
		bsc: {
			provider: null
		}
	});
	return {
		walletStore: mockWalletStore,
		walletManager: {
			loadAssets: vi.fn().mockResolvedValue(undefined)
		},
		getProvider: vi.fn().mockReturnValue(null)
	};
});

// Mock appStore
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
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

// Mock clipboard API
Object.assign(navigator, {
	clipboard: {
		writeText: vi.fn().mockResolvedValue(undefined)
	}
});

// Mock window.open
const mockOpen = vi.fn();
Object.assign(window, {
	open: mockOpen
});

describe('TransactionSuccessScreen Component', () => {
	const defaultProps = {
		txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
		network: 'rootstock-bitcoin',
		amount: 100000,
		recipient: '0x9876543210987654321098765432109876543210',
		onClose: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockOpen.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should render success screen with transaction details', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		expect(screen.getByText('Payment Sent!')).toBeDefined();
		expect(screen.getByText(/100,000/)).toBeDefined();
		// Address is formatted to first 10 and last 8 chars: "0x98765432...876543210"
		// Check that the formatted address is displayed (contains parts of the original address)
		const container = screen.getByText('Payment Sent!').closest('.transaction-success-screen');
		expect(container?.textContent).toContain('0x98765432');
	});

	it('should display transaction hash', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		// Hash is formatted to first 10 and last 8 chars: "0x12345678...5678901234"
		// Check for the formatted hash pattern in code element
		const codeElements = screen.getAllByText((content, element) => {
			return element?.tagName === 'CODE';
		});
		const hashElement = codeElements.find((el) => {
			const text = el.textContent || '';
			return text.includes('0x12345678') || text.includes('56789012');
		});
		expect(hashElement).toBeDefined();
	});

	it('should display network badge', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		const networkBadge = screen.getByText('rootstock-bitcoin');
		expect(networkBadge).toBeDefined();
	});

	it('should show pending status initially', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		const pendingBadge = screen.getByText('Pending');
		expect(pendingBadge).toBeDefined();
	});

	it('should call onClose when done button is clicked', async () => {
		const onClose = vi.fn();
		render(TransactionSuccessScreen, { ...defaultProps, onClose });
		await tick();

		const doneButton = screen.getByText('Done');
		fireEvent.click(doneButton);
		await tick();

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('should copy transaction hash when copy button is clicked', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		const copyButtons = screen.getAllByLabelText('Copy');
		const copyButton = copyButtons[0];
		fireEvent.click(copyButton);
		await tick();

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(defaultProps.txHash);
	});

	it('should open explorer link when view explorer button is clicked', async () => {
		render(TransactionSuccessScreen, defaultProps);
		await tick();

		// Wait for component to render and explorer URL to be computed
		await waitFor(
			() => {
				const explorerButton = screen.queryByText('View on Explorer');
				return explorerButton !== null;
			},
			{ timeout: 2000 }
		);

		const explorerButton = screen.getByText('View on Explorer');
		fireEvent.click(explorerButton);
		await tick();

		await waitFor(
			() => {
				expect(mockOpen).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		expect(mockOpen).toHaveBeenCalledWith(
			expect.stringContaining('blockscout.com'),
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('should generate correct explorer URL for RSK', async () => {
		// Mock import.meta.env for explorer URL generation
		vi.stubGlobal('import.meta', {
			env: {
				VITE_RSK_NETWORK: 'testnet',
				VITE_BSC_NETWORK: 'testnet'
			}
		});

		render(TransactionSuccessScreen, defaultProps);
		await tick();

		await waitFor(
			() => {
				const explorerButton = screen.queryByText('View on Explorer');
				return explorerButton !== null;
			},
			{ timeout: 2000 }
		);

		const explorerButton = screen.getByText('View on Explorer');
		fireEvent.click(explorerButton);
		await tick();

		await waitFor(
			() => {
				expect(mockOpen).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		// Should use blockscout URL
		expect(mockOpen).toHaveBeenCalledWith(
			expect.stringContaining('blockscout.com'),
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('should generate correct explorer URL for BSC', async () => {
		// Mock import.meta.env for explorer URL generation
		vi.stubGlobal('import.meta', {
			env: {
				VITE_RSK_NETWORK: 'testnet',
				VITE_BSC_NETWORK: 'testnet'
			}
		});

		const bscProps = {
			...defaultProps,
			network: 'usdt-bsc'
		};

		render(TransactionSuccessScreen, bscProps);
		await tick();

		await waitFor(
			() => {
				const explorerButton = screen.queryByText('View on Explorer');
				return explorerButton !== null;
			},
			{ timeout: 2000 }
		);

		const explorerButton = screen.getByText('View on Explorer');
		fireEvent.click(explorerButton);
		await tick();

		await waitFor(
			() => {
				expect(mockOpen).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		expect(mockOpen).toHaveBeenCalledWith(
			expect.stringContaining('bscscan.com'),
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('should monitor transaction confirmation for RSK', async () => {
		vi.useFakeTimers();

		const mockProvider = {
			getTransactionReceipt: vi.fn().mockResolvedValue(null),
			getBlockNumber: vi.fn().mockResolvedValue(100)
		};

		vi.mocked(getProvider).mockReturnValue(
			mockProvider as unknown as ReturnType<typeof getProvider>
		);

		render(TransactionSuccessScreen, defaultProps);
		await tick();

		// Advance time to trigger monitoring
		vi.advanceTimersByTime(5000);
		await tick();

		expect(mockProvider.getTransactionReceipt).toHaveBeenCalledWith(defaultProps.txHash);
	});

	it('should stop monitoring when transaction is confirmed', async () => {
		vi.useFakeTimers();

		// REORG_SAFE_CONFIRMATIONS = 6: need currentBlock - receiptBlock >= 6 before marking confirmed
		const mockProvider = {
			getTransactionReceipt: vi.fn().mockResolvedValue({
				status: 1,
				blockNumber: 95
			}),
			getBlockNumber: vi.fn().mockResolvedValue(101)
		};

		vi.mocked(getProvider).mockReturnValue(
			mockProvider as unknown as ReturnType<typeof getProvider>
		);

		render(TransactionSuccessScreen, defaultProps);
		await tick();

		await vi.advanceTimersByTimeAsync(5000);
		await tick();

		await waitFor(() => {
			expect(screen.getByText('Confirmed')).toBeDefined();
		});

		const callCount = mockProvider.getTransactionReceipt.mock.calls.length;
		await vi.advanceTimersByTimeAsync(5000);
		await tick();

		expect(mockProvider.getTransactionReceipt.mock.calls.length).toBe(callCount);
	});

	it('should reload assets after confirmation', async () => {
		vi.useFakeTimers();

		const mockProvider = {
			getTransactionReceipt: vi.fn().mockResolvedValue({
				status: 1,
				blockNumber: 95
			}),
			getBlockNumber: vi.fn().mockResolvedValue(101)
		};

		vi.mocked(getProvider).mockReturnValue(
			mockProvider as unknown as ReturnType<typeof getProvider>
		);

		render(TransactionSuccessScreen, defaultProps);
		await tick();

		await vi.advanceTimersByTimeAsync(5000);
		await tick();

		await waitFor(() => {
			expect(walletManager.loadAssets).toHaveBeenCalled();
		});
	});

	it('should display confirmation count when confirmed', async () => {
		vi.useFakeTimers();

		const mockProvider = {
			getTransactionReceipt: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
				status: 1,
				blockNumber: 95
			}),
			getBlockNumber: vi.fn().mockResolvedValue(101)
		};

		vi.mocked(getProvider).mockReturnValue(
			mockProvider as unknown as ReturnType<typeof getProvider>
		);

		render(TransactionSuccessScreen, defaultProps);
		await tick();

		await vi.advanceTimersByTimeAsync(5000);
		await tick();

		await vi.advanceTimersByTimeAsync(5000);
		await tick();

		// 101 - 95 + 1 = 7 confirmations once reorg-safe depth is satisfied
		await waitFor(
			() => {
				const confirmationText = screen.queryByText(/Confirmations/i);
				if (!confirmationText) return false;
				const parent = confirmationText.closest('div');
				if (!parent) return false;
				return (parent.textContent || '').includes('7');
			},
			{ timeout: 3000 }
		);

		const confirmationLabel = screen.getByText(/Confirmations/i);
		const parent = confirmationLabel.closest('div');
		expect(parent?.textContent).toContain('7');

		vi.useRealTimers();
	});

	it('should handle Lightning network without explorer', async () => {
		const lightningProps = {
			...defaultProps,
			network: 'lightning-bitcoin',
			txHash: 'lnbc1000u1p3...'
		};

		render(TransactionSuccessScreen, lightningProps);
		await tick();

		// Should not show explorer button for Lightning
		const explorerButtons = screen.queryAllByText('View on Explorer');
		expect(explorerButtons.length).toBe(0);
	});

	it('should format address correctly', async () => {
		const longAddress = '0x1234567890123456789012345678901234567890123456789012345678901234';
		const props = {
			...defaultProps,
			recipient: longAddress
		};

		render(TransactionSuccessScreen, props);
		await tick();

		// Should show truncated address (formatAddress returns first 10 and last 8 chars)
		// Format: "0x12345678...56789012"
		const addressElements = screen.getAllByText((content, element) => {
			const text = element?.textContent || '';
			return (text.includes('0x12345678') || text.includes('56789012')) && text.includes('...');
		});
		expect(addressElements.length).toBeGreaterThan(0);
	});

	it('should format amount correctly', async () => {
		const props = {
			...defaultProps,
			amount: 1234567
		};

		render(TransactionSuccessScreen, props);
		await tick();

		expect(screen.getByText(/1,234,567/)).toBeDefined();
	});
});
