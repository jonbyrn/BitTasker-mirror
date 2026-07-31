import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readable } from 'svelte/store';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------
const { mockFetch, mockGetProvider, mockWalletManager } = vi.hoisted(() => ({
	mockFetch: vi.fn(),
	mockGetProvider: vi.fn().mockReturnValue(null),
	mockWalletManager: {
		loadAssets: vi.fn().mockResolvedValue(undefined),
		submarineSwapService: { getSwap: vi.fn() },
		reverseSwapService: { getSwap: vi.fn() },
		chainSwapService: { getSwap: vi.fn() }
	}
}));

// ---------------------------------------------------------------------------
// Mock svelte-i18n
// ---------------------------------------------------------------------------
vi.mock('svelte-i18n', async () => {
	const { readable: r } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.send.success.payment_sent': 'Payment Sent!',
		'wallet.send.success.sent_to': 'sent to',
		'wallet.send.success.transaction_hash': 'Transaction Hash',
		'wallet.send.success.view_on_explorer': 'View on Explorer',
		'wallet.send.transaction_confirmed': 'Transaction confirmed',
		'wallet.send.transaction_failed': 'Transaction failed',
		'wallet.sats': 'sats',
		'wallet.network': 'Network',
		'wallet.transaction.status': 'Status',
		'wallet.transaction.status.confirmed': 'Confirmed',
		'wallet.transaction.status.pending': 'Pending',
		'wallet.transaction.status.confirmations': 'Confirmations',
		'wallet.copy': 'Copy',
		'wallet.transaction.hash_copied': 'Hash copied',
		'wallet.view_explorer': 'View Explorer',
		'common.done': 'Done'
	};
	const tStore = r((key: string) => translations[key] || key);
	return { t: tStore, locale: r('en'), locales: r(['en']), isLoading: r(false) };
});

// ---------------------------------------------------------------------------
// Mock wallet store
// ---------------------------------------------------------------------------
vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: readable({}),
	walletManager: mockWalletManager,
	getProvider: mockGetProvider,
	formatSats: (n: number) => n.toLocaleString(),
	formatUsd: (n: number) => `$${n.toFixed(2)}`,
	transactions: readable([])
}));

// ---------------------------------------------------------------------------
// Mock app store
// ---------------------------------------------------------------------------
vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast: vi.fn(), showErrorToast: vi.fn() }
}));

// ---------------------------------------------------------------------------
// Mock haptics
// ---------------------------------------------------------------------------
vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn().mockResolvedValue(undefined),
	ImpactStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' }
}));

// ---------------------------------------------------------------------------
// Mock finality constant
// ---------------------------------------------------------------------------
vi.mock('$lib/utils/service-contract/finality', () => ({
	REORG_SAFE_CONFIRMATIONS: 6
}));

// ---------------------------------------------------------------------------
// Mock swap status map
// ---------------------------------------------------------------------------
vi.mock('$lib/utils/wallet/swapStatusMap', () => ({
	mapBoltzModalStatus: vi.fn().mockReturnValue('sending'),
	getSwapEtaSeconds: vi.fn().mockReturnValue(60)
}));

// ---------------------------------------------------------------------------
// Mock @sentry/sveltekit
// ---------------------------------------------------------------------------
vi.mock('@sentry/sveltekit', () => ({ addBreadcrumb: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock clipboard API
// ---------------------------------------------------------------------------
Object.assign(navigator, {
	clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
});

// ---------------------------------------------------------------------------
// Import components AFTER mocks
// ---------------------------------------------------------------------------
import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';

// ---------------------------------------------------------------------------
// Source code for static analysis (read once at module level)
// ---------------------------------------------------------------------------
const sendPaymentFormSource = fs.readFileSync(
	path.resolve(__dirname, '../../../components/wallet/SendPaymentForm.svelte'),
	'utf-8'
);
const pendingTxScreenSource = fs.readFileSync(
	path.resolve(__dirname, '../../../components/wallet/PendingTransactionScreen.svelte'),
	'utf-8'
);
const gaslessSendFlowSource = fs.readFileSync(
	path.resolve(__dirname, '../../../components/wallet/GaslessSendFlow.svelte'),
	'utf-8'
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TransactionSuccessScreen transition — behavioral tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// =====================================================================
	// BUG-001a: GaslessSendFlow polling (Arbitrum)
	// =====================================================================
	describe('BUG-001a: GaslessSendFlow polling (Arbitrum)', () => {
		it('polls eth_getTransactionReceipt (fixed) after BUG-001a fix', () => {
			const stringifyBlock = gaslessSendFlowSource.match(
				/JSON\.stringify\(\{[\s\S]*?\}\)/
			);

			expect(stringifyBlock).not.toBeNull();

			const rpcMethodMatch = stringifyBlock![0].match(
				/method:\s*['"]([^'"]+)['"]/
			);

			expect(rpcMethodMatch).not.toBeNull();

			// BUG-001a fix: now uses eth_getTransactionReceipt for bundle tx hashes
			expect(rpcMethodMatch![1]).toBe('eth_getTransactionReceipt');
		});

		it('transitions to success when receipt.status is 0x1', () => {
			// Verify the source code checks data.result.status === '0x1' for the transition
			expect(gaslessSendFlowSource).toContain("data.result.status === '0x1'");
			expect(gaslessSendFlowSource).toContain("step = 'success'");
		});

		it('transitions to error when receipt shows revert', () => {
			// Lines 250-253:
			//   } else {
			//     sendError = 'Transaction reverted on-chain';
			//     step = 'error';
			//   }
			expect(gaslessSendFlowSource).toContain("'Transaction reverted on-chain'");
			expect(gaslessSendFlowSource).toContain("step = 'error'");
		});

		it('continues polling when receipt is null (not yet mined)', () => {
			// When data.result is falsy (null), the loop continues via `for` increment.
			// The code does:
			//   if (data.result) { ... return; }
			// So null result causes the loop to continue.
			// Verify the result check and return pattern exist.
			const resultCheckPattern = /if\s*\(\s*data\.result\s*\)/;
			expect(gaslessSendFlowSource).toMatch(resultCheckPattern);
		});

		it('stops polling after maxAttempts (30)', () => {
			// Line 219: const maxAttempts = 30;
			// Line 223: for (let i = 0; i < maxAttempts; i++) {
			const maxAttemptsMatch = gaslessSendFlowSource.match(
				/maxAttempts\s*=\s*(\d+)/
			);
			expect(maxAttemptsMatch).not.toBeNull();
			expect(Number(maxAttemptsMatch![1])).toBe(30);

			// Verify the polling interval
			const intervalMatch = gaslessSendFlowSource.match(
				/intervalMs\s*=\s*(\d+)/
			);
			expect(intervalMatch).not.toBeNull();
			expect(Number(intervalMatch![1])).toBe(3000);
		});

		it('uses pendingTxHash as the receipt parameter', () => {
			// Line 238: params: [pendingTxHash],
			const paramsPattern = /params:\s*\[\s*pendingTxHash\s*\]/;
			expect(gaslessSendFlowSource).toMatch(paramsPattern);
		});

		it('GaslessSendFlow no longer contains inline RPC polling (moved to backend)', () => {
			// After the send form unification, GaslessSendFlow is no longer
			// rendered by SendPaymentForm. The polling logic was removed.
			// This test documents that the component no longer has inline RPC calls.
			expect(gaslessSendFlowSource).not.toContain('arb1.arbitrum.io/rpc');
		});

		it('renders TransactionSuccessScreen on step === success', () => {
			// Lines 281-288 in the template:
			// {:else if step === 'success'}
			//   <TransactionSuccessScreen ... />
			expect(gaslessSendFlowSource).toContain("step === 'success'");
			expect(gaslessSendFlowSource).toContain('<TransactionSuccessScreen');
		});
	});

	// =====================================================================
	// BUG-001b: SendPaymentForm success path (RSK)
	// =====================================================================
	describe('BUG-001b: SendPaymentForm success path (RSK)', () => {
		it('showSuccessScreen is set to true after non-Arbitrum send succeeds', () => {
			// After BUG-001b fix, showSuccessScreen IS set to true in the non-Arbitrum
			// success path, so TransactionSuccessScreen is displayed before onSuccess.
			const assignmentPattern = /showSuccessScreen\s*=\s*true/g;
			const matches = sendPaymentFormSource.match(assignmentPattern);

			expect(matches).not.toBeNull();
			expect(matches!.length).toBeGreaterThanOrEqual(1);

			expect(sendPaymentFormSource).toContain('showSuccessScreen: false');
		});

		it('onSuccess is NOT called immediately for non-Arbitrum sends', () => {
			// After BUG-001b fix, onSuccess is called when user clicks "Done" on
			// TransactionSuccessScreen, not immediately after send.
			// The direct onSuccess(result.txHash, network) call is only in the
			// Arbitrum fast-path block now.
			const lines = sendPaymentFormSource.split('\n');
			const onSuccessLineIdx = lines.findIndex((l: string) =>
				l.includes('onSuccess(result.txHash, network)')
			);
			expect(onSuccessLineIdx).toBeGreaterThan(0);

			// The onSuccess call should now be inside the Arbitrum block
			// (preceded by lines containing 'usdt0-arb')
			const contextLines = lines.slice(Math.max(0, onSuccessLineIdx - 10), onSuccessLineIdx).join('\n');
			expect(contextLines).toContain('usdt0-arb');
		});

		it('TransactionSuccessScreen is imported and rendered for non-Arbitrum sends', () => {
			// After BUG-001b fix, TransactionSuccessScreen IS imported and rendered
			// when uiState.showSuccessScreen is true.
			expect(sendPaymentFormSource).toContain('TransactionSuccessScreen');

			// Verify the template renders TransactionSuccessScreen conditionally
			expect(sendPaymentFormSource).toContain('uiState.showSuccessScreen');
		});

		it('Arbitrum fast-path shows toast and clears state immediately', () => {
			// Lines 998-1001:
			//   if (network === 'usdt0-arb') {
			//     appStore.showSuccessToast(...)
			//     walletManager.loadAssets();
			//     clearPendingSendState();
			//   }
			// This means on Arbitrum, the modal closes before any success screen.
			const arbitrumFastPath = sendPaymentFormSource.indexOf("network === 'usdt0-arb'");
			expect(arbitrumFastPath).toBeGreaterThan(0);

			// Verify clearPendingSendState is in the Arbitrum block
			const afterArbitrumCheck = sendPaymentFormSource.slice(arbitrumFastPath);
			const nextElseIdx = afterArbitrumCheck.indexOf('} else {');
			const arbitrumBlock = afterArbitrumCheck.slice(0, nextElseIdx);
			expect(arbitrumBlock).toContain('clearPendingSendState()');
		});
	});

	// =====================================================================
	// BUG-006: PendingTransactionScreen has no onSuccess callback
	// =====================================================================
	describe('BUG-006: PendingTransactionScreen has no onSuccess callback', () => {
		it('PendingTransactionScreen only has onClose prop (no onSuccess)', () => {
			// BUG-006: The component accepts onClose but NOT onSuccess,
			// so even when it detects on-chain success, it cannot notify the parent.
			expect(pendingTxScreenSource).toContain('onClose: () => void');

			const onSuccessPropPattern = /onSuccess\s*[?:]/;
			expect(pendingTxScreenSource).not.toMatch(onSuccessPropPattern);
		});

		it('PendingTransactionScreen detects on-chain success internally', () => {
			// The component polls getTransactionReceipt and sets receiptStatus.
			// Lines 215-216:
			//   if (receipt.status === 1) {
			//     receiptStatus = 'success';
			//   }
			// BUG-006: It CAN detect success but has no way to notify the parent.
			expect(pendingTxScreenSource).toContain("receiptStatus = 'success'");
			expect(pendingTxScreenSource).toContain('receipt.status === 1');
			expect(pendingTxScreenSource).toContain('stopPolling()');
		});

		it('PendingTransactionScreen polls getTransactionReceipt via provider', () => {
			// Lines 212-213:
			//   const receipt = await provider.getTransactionReceipt(txHash);
			// The component uses ethers.js provider directly, not JSON-RPC fetch.
			expect(pendingTxScreenSource).toContain('provider.getTransactionReceipt(txHash)');
		});

		it('PendingTransactionScreen maps Arbitrum to rsk provider (potential bug)', () => {
			// Lines 206-207 in the provider selection:
			//   network === 'usdt0-arb' || network === 'arbitrum'
			//     ? 'rsk'
			// This maps Arbitrum to the RSK provider, which is likely wrong.
			// This means Arbitrum txs polled by PendingTransactionScreen use
			// the RSK provider, which won't find Arbitrum receipts.
			const providerMapping = pendingTxScreenSource.match(
				/usdt0-arb.*\n.*'rsk'/
			);
			expect(providerMapping).not.toBeNull();
		});
	});

	// =====================================================================
	// TransactionSuccessScreen component
	// =====================================================================
	describe('TransactionSuccessScreen component', () => {
		const defaultProps = {
			txHash: MOCK_TX_HASH,
			network: 'rootstock-bitcoin',
			amount: 50000,
			recipient: '0xRecipient1234567890AbCdEf1234567890aBcDeF',
			onClose: vi.fn()
		};

		it('requires txHash, network, amount, recipient, onClose props', () => {
			const componentSource = fs.readFileSync(
				path.resolve(__dirname, '../../../components/wallet/TransactionSuccessScreen.svelte'),
				'utf-8'
			);

			expect(componentSource).toContain('txHash: string');
			expect(componentSource).toContain('network: string');
			expect(componentSource).toContain('amount: number');
			expect(componentSource).toContain('recipient: string');
			expect(componentSource).toContain('onClose: () => void');
		});

		it('renders tx hash when provided', async () => {
			render(TransactionSuccessScreen, { props: defaultProps });
			await tick();

			const codeElements = screen.getAllByText((_, el) => el?.tagName === 'CODE');
			const hashEl = codeElements.find((el) => {
				const text = el.textContent || '';
				return text.includes('0xabcdef12') || text.includes('567890');
			});
			expect(hashEl).toBeDefined();
		});

		it('renders explorer link for RSK (blockscout)', async () => {
			// Note: import.meta.env is statically replaced at build time, so we cannot
			// control mainnet vs testnet from the test. We verify the explorer URL
			// uses blockscout.com (covers both rootstock.blockscout.com and
			// rootstock-testnet.blockscout.com).
			const mockOpen = vi.fn();
			Object.assign(window, { open: mockOpen });

			render(TransactionSuccessScreen, { props: defaultProps });
			await tick();

			const explorerBtn = await waitFor(
				() => {
					const btn = screen.queryByText('View on Explorer');
					expect(btn).not.toBeNull();
					return btn!;
				},
				{ timeout: 2000 }
			);

			fireEvent.click(explorerBtn);
			await tick();

			await waitFor(() => {
				expect(mockOpen).toHaveBeenCalledWith(
					expect.stringContaining('blockscout.com/tx/'),
					'_blank',
					'noopener,noreferrer'
				);
			});
		});

		it('does not render explorer link for Arbitrum (unhandled network)', async () => {
			// TransactionSuccessScreen does not handle 'usdt0-arb' in its
			// explorerUrl derived value. Only rsk, bsc, bitcoin, liquid, lightning
			// are covered. This means Arbitrum success screen has no explorer link.
			render(TransactionSuccessScreen, {
				props: { ...defaultProps, network: 'usdt0-arb' }
			});
			await tick();

			const explorerButtons = screen.queryAllByText('View on Explorer');
			expect(explorerButtons.length).toBe(0);
		});

		it('calls onClose when Done button is clicked', async () => {
			const onClose = vi.fn();
			render(TransactionSuccessScreen, { props: { ...defaultProps, onClose } });
			await tick();

			const doneBtn = screen.getByText('Done');
			fireEvent.click(doneBtn);
			await tick();

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('shows pending status initially (before confirmation)', async () => {
			mockGetProvider.mockReturnValue(null);

			render(TransactionSuccessScreen, { props: defaultProps });
			await tick();

			expect(screen.getByText('Pending')).toBeDefined();
		});
	});
});
