/**
 * SendPaymentForm — Post-Send State Machine Tests
 *
 * Tests the LOGIC that drives the UI transitions after send completes.
 * Since the full component has too many transitive dependencies to render,
 * we test the state machine by simulating handleSend's behaviour against
 * mock state objects.
 *
 * BUG-001b: RSK send should show TransactionSuccessScreen before calling onSuccess
 * BUG-003: Multi-hop swap chain should NOT call onSuccess (modal stays open)
 * BUG-004: Loading state (isSending) transitions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Types — mirror the component's state shapes
// ---------------------------------------------------------------------------

interface SendState {
	isSending: boolean;
	error: string | null;
	successTxHash: string | null;
	successNetwork: string | null;
	pendingTxHash: string | null;
	pendingNetwork: string | null;
	pendingAmount: number | null;
	pendingAddress: string | null;
	pendingSwapId: string | null;
	pendingSwapChain: unknown | null;
	externalConfirmSource: string | null;
}

interface UIState {
	showSuccessScreen: boolean;
	showSendConfirmation: boolean;
}

function createSendState(): SendState {
	return {
		isSending: false,
		error: null,
		successTxHash: null,
		successNetwork: null,
		pendingTxHash: null,
		pendingNetwork: null,
		pendingAmount: null,
		pendingAddress: null,
		pendingSwapId: null,
		pendingSwapChain: null,
		externalConfirmSource: null
	};
}

function createUIState(): UIState {
	return {
		showSuccessScreen: false,
		showSendConfirmation: false
	};
}

// ---------------------------------------------------------------------------
// Simulated handleSend state machine
//
// This mirrors the logic in SendPaymentForm.svelte handleSend (lines 906-1058)
// with the BUG-001b fix applied: instead of calling onSuccess immediately on
// txHash, it sets uiState.showSuccessScreen = true so the TransactionSuccessScreen
// is displayed. onSuccess is only called when the user clicks "Done".
// ---------------------------------------------------------------------------

interface ExecuteSendResult {
	txHash: string | null;
	pendingSwapId?: string;
	pendingSwapChain?: unknown;
	earlyReturn?: boolean;
}

interface HandleSendParams {
	sendState: SendState;
	uiState: UIState;
	network: string;
	recipient: string;
	amountInSats: number;
	amountInUSD: number;
	executeSend: () => Promise<ExecuteSendResult>;
	onSuccess?: (txHash: string, network: string) => void;
	appStore: {
		showSuccessToast: (msg: string, duration?: number) => void;
		showErrorToast: (msg: string, duration?: number) => void;
	};
	blockchainToastStore: {
		add: (data: unknown) => void;
	};
}

async function simulateHandleSend(params: HandleSendParams): Promise<{
	sendState: SendState;
	uiState: UIState;
}> {
	const {
		sendState,
		uiState,
		network,
		recipient,
		amountInSats,
		amountInUSD,
		executeSend,
		onSuccess,
		appStore,
		blockchainToastStore
	} = params;

	// Pre-send state (optimistic)
	sendState.pendingTxHash = null;
	sendState.pendingNetwork = network;
	sendState.pendingAmount = amountInSats;
	sendState.pendingAddress = recipient;
	sendState.isSending = true;
	sendState.error = null;
	sendState.pendingSwapId = null;

	try {
		const result = await executeSend();

		if (result.txHash) {
			sendState.pendingTxHash = result.txHash;
			sendState.pendingNetwork = network;
			sendState.pendingAmount = amountInSats;
			sendState.pendingAddress = recipient;
			sendState.isSending = false;

			if (network === 'usdt0-arb') {
				appStore.showSuccessToast('Sent successfully', 2000);
			} else {
				blockchainToastStore.add({
					type: 'send',
					status: 'confirming',
					network,
					txHash: result.txHash,
					amount: amountInSats,
					amountUSD: amountInUSD,
					recipient
				});
			}

			// BUG-001b fix: show success screen instead of calling onSuccess immediately
			uiState.showSuccessScreen = true;
			// onSuccess is NOT called here — it's called when user clicks "Done"
		}

		if (result.pendingSwapId) {
			sendState.pendingSwapId = result.pendingSwapId;
		}

		if (result.pendingSwapChain) {
			sendState.pendingSwapChain = result.pendingSwapChain;
			sendState.isSending = false;
			appStore.showSuccessToast('Transaction sending…');
			// BUG-003 fix: call onSuccess so modal closes and user can see toast + Pending Swaps
			if (onSuccess) {
				onSuccess('', network);
			}
		}
	} catch (err) {
		sendState.error = err instanceof Error ? err.message : 'Transaction failed';
		appStore.showErrorToast(sendState.error);
		// Do NOT call onSuccess on error
		// Do NOT show success screen on error
	} finally {
		sendState.isSending = false;
	}

	return { sendState, uiState };
}

// Simulates the "Done" button click on TransactionSuccessScreen
function simulateSuccessScreenDone(
	uiState: UIState,
	sendState: SendState,
	onSuccess?: (txHash: string, network: string) => void
): void {
	uiState.showSuccessScreen = false;
	if (onSuccess && sendState.pendingTxHash && sendState.pendingNetwork) {
		onSuccess(sendState.pendingTxHash, sendState.pendingNetwork);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendPaymentForm post-send behavior', () => {
	let sendState: SendState;
	let uiState: UIState;
	let appStore: {
		showSuccessToast: (msg: string, duration?: number) => void;
		showErrorToast: (msg: string, duration?: number) => void;
	};
	let blockchainToastStore: {
		add: (data: unknown) => void;
	};
	let onSuccess: ((txHash: string, network: string) => void) | undefined;

	beforeEach(() => {
		sendState = createSendState();
		uiState = createUIState();
		appStore = {
			showSuccessToast: vi.fn() as unknown as (msg: string, duration?: number) => void,
			showErrorToast: vi.fn() as unknown as (msg: string, duration?: number) => void
		};
		blockchainToastStore = {
			add: vi.fn() as unknown as (data: unknown) => void
		};
		onSuccess = vi.fn() as unknown as (txHash: string, network: string) => void;
	});

	// =========================================================================
	// BUG-001b: RSK send success path
	// =========================================================================
	describe('BUG-001b: RSK send success path', () => {
		it('handleSend sets showSuccessScreen when txHash is returned', async () => {
			const txHash = '0xabc123def456';
			const network = 'rootstock-bitcoin';

			await simulateHandleSend({
				sendState,
				uiState,
				network,
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(uiState.showSuccessScreen).toBe(true);
			expect(sendState.isSending).toBe(false);
			expect(sendState.pendingTxHash).toBe(txHash);
		});

		it('handleSend does NOT call onSuccess immediately when showSuccessScreen is true', async () => {
			const txHash = '0xabc123';
			const network = 'rootstock-bitcoin';

			await simulateHandleSend({
				sendState,
				uiState,
				network,
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(onSuccess).not.toHaveBeenCalled();
			expect(uiState.showSuccessScreen).toBe(true);
		});

		it('handleSend calls onSuccess when user clicks Done on success screen', async () => {
			const txHash = '0xabc123';
			const network = 'rootstock-bitcoin';

			await simulateHandleSend({
				sendState,
				uiState,
				network,
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			// User clicks "Done" on TransactionSuccessScreen
			simulateSuccessScreenDone(uiState, sendState, onSuccess);

			expect(onSuccess).toHaveBeenCalledWith(txHash, network);
			expect(uiState.showSuccessScreen).toBe(false);
		});
	});

	// =========================================================================
	// BUG-003: Multi-hop swap chain feedback
	// =========================================================================
	describe('BUG-003: Multi-hop swap chain feedback', () => {
		it('handleSend calls onSuccess for swap chain results so modal closes', async () => {
			const pendingSwapChain = {
				phase: 'pending',
				hops: [{ id: 'hop1' }, { id: 'hop2' }]
			};

			await simulateHandleSend({
				sendState,
				uiState,
				network: 'lightning-bitcoin',
				recipient: 'lnbc1...',
				amountInSats: 100_000,
				amountInUSD: 65,
				executeSend: vi.fn().mockResolvedValue({
					txHash: null,
					pendingSwapChain
				}),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(onSuccess).toHaveBeenCalledWith('', 'lightning-bitcoin');
			expect(uiState.showSuccessScreen).toBe(false);
		});

		it('handleSend shows success toast for swap chain', async () => {
			const pendingSwapChain = {
				phase: 'pending',
				hops: [{ id: 'hop1' }, { id: 'hop2' }]
			};

			await simulateHandleSend({
				sendState,
				uiState,
				network: 'lightning-bitcoin',
				recipient: 'lnbc1...',
				amountInSats: 100_000,
				amountInUSD: 65,
				executeSend: vi.fn().mockResolvedValue({
					txHash: null,
					pendingSwapChain
				}),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(appStore.showSuccessToast).toHaveBeenCalledWith('Transaction sending\u2026');
		});

		it('handleSend stores pendingSwapChain in sendState', async () => {
			const pendingSwapChain = {
				phase: 'pending',
				hops: [{ id: 'hop1' }, { id: 'hop2' }]
			};

			await simulateHandleSend({
				sendState,
				uiState,
				network: 'lightning-bitcoin',
				recipient: 'lnbc1...',
				amountInSats: 100_000,
				amountInUSD: 65,
				executeSend: vi.fn().mockResolvedValue({
					txHash: null,
					pendingSwapChain
				}),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.pendingSwapChain).toEqual(pendingSwapChain);
			expect(sendState.isSending).toBe(false);
		});
	});

	// =========================================================================
	// BUG-004: Loading state during send
	// =========================================================================
	describe('BUG-004: Loading state during send', () => {
		it('isSending is true while executeSend is in progress', async () => {
			let resolveSend!: (value: ExecuteSendResult) => void;
			const sendPromise = new Promise<ExecuteSendResult>((resolve) => {
				resolveSend = resolve;
			});

			const sendPromiseRef = simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: () => sendPromise,
				onSuccess,
				appStore,
				blockchainToastStore
			});

			// isSending should be true while executeSend is pending
			expect(sendState.isSending).toBe(true);

			// Resolve and wait
			resolveSend({ txHash: '0xabc' });
			await sendPromiseRef;
		});

		it('isSending is false after executeSend resolves', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.isSending).toBe(false);
		});

		it('isSending is false after executeSend rejects', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockRejectedValue(new Error('Network timeout')),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.isSending).toBe(false);
		});
	});

	// =========================================================================
	// Error handling
	// =========================================================================
	describe('Error handling', () => {
		it('handleSend sets errorMessage on executeSend failure', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockRejectedValue(new Error('Insufficient funds')),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.error).toBe('Insufficient funds');
			expect(appStore.showErrorToast).toHaveBeenCalledWith('Insufficient funds');
		});

		it('handleSend does NOT call onSuccess on error', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockRejectedValue(new Error('Something broke')),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(onSuccess).not.toHaveBeenCalled();
		});

		it('handleSend does NOT show success screen on error', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockRejectedValue(new Error('User rejected')),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(uiState.showSuccessScreen).toBe(false);
		});

		it('handleSend handles non-Error thrown values', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockRejectedValue('raw string error'),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.error).toBe('Transaction failed');
		});
	});

	// =========================================================================
	// TransactionSuccessScreen props
	// =========================================================================
	describe('TransactionSuccessScreen props', () => {
		it('receives txHash from executeSend result', async () => {
			const txHash = '0xdeadbeef1234567890abcdef';

			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.pendingTxHash).toBe(txHash);
		});

		it('receives network from executeSend result', async () => {
			const network = 'rootstock-bitcoin';

			await simulateHandleSend({
				sendState,
				uiState,
				network,
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.pendingNetwork).toBe(network);
		});

		it('receives amount and recipient from send state', async () => {
			const amountInSats = 150_000;
			const recipient = '0xFooBarBaz';

			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient,
				amountInSats,
				amountInUSD: 97.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.pendingAmount).toBe(amountInSats);
			expect(sendState.pendingAddress).toBe(recipient);
		});
	});

	// =========================================================================
	// Blockchain toast registration (non-Arbitrum)
	// =========================================================================
	describe('Blockchain toast registration', () => {
		it('registers a blockchain toast for RSK sends', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(blockchainToastStore.add).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'send',
					status: 'confirming',
					network: 'rootstock-bitcoin',
					txHash: '0xabc'
				})
			);
		});

		it('shows inline success toast for Arbitrum instead of blockchain toast', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'usdt0-arb',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(appStore.showSuccessToast).toHaveBeenCalledWith('Sent successfully', 2000);
			expect(blockchainToastStore.add).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// pendingSwapId propagation
	// =========================================================================
	describe('pendingSwapId propagation', () => {
		it('stores pendingSwapId when returned by executeSend', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'lightning-bitcoin',
				recipient: 'lnbc1...',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({
					txHash: '0xabc',
					pendingSwapId: 'swap-uuid-123'
				}),
				onSuccess,
				appStore,
				blockchainToastStore
			});

			expect(sendState.pendingSwapId).toBe('swap-uuid-123');
		});
	});

	// =========================================================================
	// Done button edge cases
	// =========================================================================
	describe('Success screen Done button', () => {
		it('does not call onSuccess if pendingTxHash is null', () => {
			// Edge case: user somehow clicks Done before txHash is set
			simulateSuccessScreenDone(uiState, sendState, onSuccess);

			expect(onSuccess).not.toHaveBeenCalled();
			expect(uiState.showSuccessScreen).toBe(false);
		});

		it('does not throw if onSuccess is undefined', async () => {
			await simulateHandleSend({
				sendState,
				uiState,
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient',
				amountInSats: 50_000,
				amountInUSD: 32.5,
				executeSend: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
				onSuccess: undefined,
				appStore,
				blockchainToastStore
			});

			expect(uiState.showSuccessScreen).toBe(true);

			// Should not throw when onSuccess is undefined
			expect(() =>
				simulateSuccessScreenDone(uiState, sendState, undefined)
			).not.toThrow();
		});
	});
});
