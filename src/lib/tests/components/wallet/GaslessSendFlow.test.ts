import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables (must be hoisted to match vi.mock hoisting)
// ---------------------------------------------------------------------------
const {
	mockSendToken,
	mockSendTokenDirect,
	mockEstimateFee,
	mockCheckSufficientBalance,
	mockCheckETHBalance,
	mockFetch
} = vi.hoisted(() => ({
	mockSendToken: vi.fn(),
	mockSendTokenDirect: vi.fn(),
	mockEstimateFee: vi.fn(),
	mockCheckSufficientBalance: vi.fn(),
	mockCheckETHBalance: vi.fn(),
	mockFetch: vi.fn()
}));

// ---------------------------------------------------------------------------
// Mock gasless-store
// ---------------------------------------------------------------------------
vi.mock('$lib/wallet/gasless-store', () => ({
	sendToken: mockSendToken,
	sendTokenDirect: mockSendTokenDirect,
	estimateFee: mockEstimateFee,
	checkSufficientBalance: mockCheckSufficientBalance,
	checkETHBalance: mockCheckETHBalance,
	walletAddress: { subscribe: vi.fn(), set: vi.fn() },
	walletReady: { subscribe: vi.fn(), set: vi.fn() },
	walletLoading: { subscribe: vi.fn(), set: vi.fn() },
	walletError: { subscribe: vi.fn(), set: vi.fn() },
	gaslessWallet: { subscribe: vi.fn(), set: vi.fn() }
}));

// ---------------------------------------------------------------------------
// Mock gasless.config
// ---------------------------------------------------------------------------
const MOCK_ALTO_URL = 'https://alto.example.com';

vi.mock('$lib/wallet/gasless.config', () => ({
	TOKENS: [
		{ address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT0', decimals: 6, chainId: 42161 },
		{ address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8, chainId: 42161 }
	],
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	ALTO_URLS: ['https://alto.example.com'],
	ARBITRUM_CHAIN_ID: 42161,
	ARBITRUM_RPC_URL: 'https://arb-mainnet.g.alchemy.com/v2/test',
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	FEE_BUFFER_MAX: {
		'0xfd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 150_000n,
		'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 230n
	}
}));

vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import constants AFTER mocks
// ---------------------------------------------------------------------------
import { ALTO_URLS, TOKENS, USDT0_ADDRESS, FEE_BUFFER_MAX } from '$lib/wallet/gasless.config';
import { ethers } from 'ethers';
import {
	estimateFee,
	sendToken,
	sendTokenDirect,
	checkSufficientBalance,
	checkETHBalance
} from '$lib/wallet/gasless-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const VALID_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const FEE_ESTIMATE = {
	feeBuffer: '150000',
	feeCostUSD: 0.01,
	feeTier: 'Low',
	totalWithBuffer: '100150000',
	estimatedGas: {
		callGasLimit: '200000',
		verificationGasLimit: '100000',
		preVerificationGas: '50000'
	}
};

// ---------------------------------------------------------------------------
// Extracted logic from GaslessSendFlow.svelte — testable without rendering
// ---------------------------------------------------------------------------

type FlowStep = 'input' | 'confirm' | 'pending' | 'success' | 'error' | 'fallback-confirm';

interface TokenInfo {
	address: string;
	symbol: string;
	decimals: number;
	chainId: number;
}

function findToken(address: string): TokenInfo | undefined {
	return TOKENS.find((tk) => tk.address.toLowerCase() === address.toLowerCase());
}

function parseAmountBigInt(amount: string, token: TokenInfo | undefined): bigint {
	if (!amount || !token) return 0n;
	try {
		const parts = amount.split('.');
		const whole = parts[0] || '0';
		const frac = (parts[1] || '')
			.padEnd(token.decimals, '0')
			.slice(0, token.decimals);
		return BigInt(whole) * 10n ** BigInt(token.decimals) + BigInt(frac);
	} catch {
		return 0n;
	}
}

function isValidForm(recipient: string, amount: string, selectedToken: string): boolean {
	const token = findToken(selectedToken);
	const amountBI = parseAmountBigInt(amount, token);
	return recipient.length > 0 && ethers.isAddress(recipient) && amountBI > 0n && token !== undefined;
}

function isRelayError(msg: string): boolean {
	return (
		msg.includes('relay') ||
		msg.includes('fetch') ||
		msg.includes('network') ||
		msg.includes('timeout') ||
		msg.includes('temporarily unavailable') ||
		msg.includes('ECONNREFUSED')
	);
}

async function pollForReceipt(
	rpcUrl: string,
	txHash: string,
	{ maxAttempts = 30, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<{ success: boolean; cancelled: boolean; attempts: number }> {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((r) => setTimeout(r, intervalMs));

		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_getTransactionReceipt',
				params: [txHash],
				id: 1
			})
		});

		if (!response.ok) continue;
		const data = await response.json();

		if (data.result) {
			return { success: data.result.status === '0x1', cancelled: false, attempts: i + 1 };
		}
	}
	return { success: false, cancelled: false, attempts: maxAttempts };
}

async function runEstimationFlow(
	recipient: string,
	amount: string,
	selectedToken: string,
	walletAddress: string | null,
	walletReady: boolean
): Promise<{
	step: FlowStep;
	feeEstimate: typeof FEE_ESTIMATE | null;
	estimationError: string | null;
	balanceCheckResult: { sufficient: boolean; balance: bigint; required: bigint } | null;
}> {
	let step: FlowStep = 'input';
	let feeEst: typeof FEE_ESTIMATE | null = null;
	let estimationError: string | null = null;
	let balanceCheck: { sufficient: boolean; balance: bigint; required: bigint } | null = null;
	const token = findToken(selectedToken);
	const amountBI = parseAmountBigInt(amount, token);

	if (!isValidForm(recipient, amount, selectedToken)) {
		return { step, feeEstimate: null, estimationError: null, balanceCheckResult: null };
	}

	if (!walletReady || !walletAddress) {
		estimationError = 'Wallet not connected. Please connect your wallet first.';
		return { step, feeEstimate: null, estimationError, balanceCheckResult: null };
	}

	try {
		const initialBalance = await checkSufficientBalance(selectedToken, walletAddress, amountBI, 0n);
		balanceCheck = initialBalance;

		if (!initialBalance.sufficient) {
			estimationError = 'Insufficient balance for transfer amount.';
			return { step, feeEstimate: null, estimationError, balanceCheckResult: balanceCheck };
		}

		const estimate = await estimateFee(selectedToken, amountBI, recipient);
		feeEst = estimate as typeof FEE_ESTIMATE;

		balanceCheck = await checkSufficientBalance(
			selectedToken,
			walletAddress,
			amountBI,
			BigInt(estimate.feeBuffer)
		);

		if (!balanceCheck.sufficient) {
			estimationError = 'Insufficient balance to cover transfer + network fee.';
			return { step, feeEstimate: feeEst, estimationError, balanceCheckResult: balanceCheck };
		}

		step = 'confirm';
	} catch (err) {
		estimationError = err instanceof Error ? err.message : 'Fee estimation failed';
	}

	return { step, feeEstimate: feeEst, estimationError, balanceCheckResult: balanceCheck };
}

async function runConfirmSendFlow(
	feeEstimate: typeof FEE_ESTIMATE | null,
	selectedToken: string,
	recipient: string,
	amount: string,
	walletAddress: string | null
): Promise<{
	step: FlowStep;
	pendingTxHash: string;
	sendError: string | null;
	isDirectFallback: boolean;
}> {
	let step: FlowStep = 'confirm';
	let pendingTxHash = '';
	let sendError: string | null = null;
	let isDirectFallback = false;
	const token = findToken(selectedToken);
	const amountBI = parseAmountBigInt(amount, token);

	if (!feeEstimate) return { step, pendingTxHash, sendError, isDirectFallback };

	try {
		const txHash = await sendToken(
			selectedToken,
			recipient,
			amountBI,
			BigInt(feeEstimate.feeBuffer),
			feeEstimate.estimatedGas
		);
		pendingTxHash = txHash;
		step = 'pending';
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Transaction failed';

		if (isRelayError(msg) && walletAddress) {
			try {
				const bal = await checkETHBalance(walletAddress);
				if (bal > 0n) {
					sendError = msg;
					isDirectFallback = true;
					step = 'fallback-confirm';
					return { step, pendingTxHash, sendError, isDirectFallback };
				}
			} catch {
				// ETH balance check failed — fall through to error
			}
		}

		sendError = msg;
		step = 'error';
	}

	return { step, pendingTxHash, sendError, isDirectFallback };
}

async function runDirectFallbackFlow(
	selectedToken: string,
	recipient: string,
	amount: string
): Promise<{ step: FlowStep; successTxHash: string; sendError: string | null }> {
	const token = findToken(selectedToken);
	const amountBI = parseAmountBigInt(amount, token);

	try {
		const txHash = await sendTokenDirect(selectedToken, recipient, amountBI);
		return { step: 'success', successTxHash: txHash, sendError: null };
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Direct transaction failed';
		return { step: 'error', successTxHash: '', sendError: msg };
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GaslessSendFlow — logic tests (no rendering)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();

		mockCheckSufficientBalance.mockResolvedValue({
			sufficient: true,
			balance: 100_000_000n,
			required: 10_010_000n
		});
		mockEstimateFee.mockResolvedValue(FEE_ESTIMATE);
		mockSendToken.mockResolvedValue(MOCK_TX_HASH);
		mockSendTokenDirect.mockResolvedValue(MOCK_TX_HASH);
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ result: null })
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── Step transitions ──────────────────────────────────────────────────

	describe('step transitions', () => {
		it('transitions to pending after sendToken succeeds', async () => {
			mockSendToken.mockResolvedValue(MOCK_TX_HASH);

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('pending');
			expect(result.pendingTxHash).toBe(MOCK_TX_HASH);
			expect(result.sendError).toBeNull();
			expect(mockSendToken).toHaveBeenCalledWith(
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				expect.any(BigInt),
				BigInt(FEE_ESTIMATE.feeBuffer),
				FEE_ESTIMATE.estimatedGas
			);
		});

		it('transitions to success when receipt confirms success', async () => {
			vi.useFakeTimers();

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					result: { transactionHash: MOCK_TX_HASH, blockNumber: '0x123', status: '0x1' }
				})
			});

			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts: 5, intervalMs: 1000 });

			await vi.advanceTimersByTimeAsync(1500);
			const result = await pollPromise;

			expect(result.success).toBe(true);
			expect(result.attempts).toBe(1);
		});

		it('stays on pending when receipt not yet available', async () => {
			vi.useFakeTimers();

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ result: null })
			});

			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts: 3, intervalMs: 1000 });

			await vi.advanceTimersByTimeAsync(3500);
			const result = await pollPromise;

			expect(result.success).toBe(false);
			expect(result.attempts).toBe(3);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('transitions to error when receipt shows revert', async () => {
			vi.useFakeTimers();

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					result: { transactionHash: MOCK_TX_HASH, blockNumber: '0x123', status: '0x0' }
				})
			});

			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts: 5, intervalMs: 1000 });

			await vi.advanceTimersByTimeAsync(1500);
			const result = await pollPromise;

			expect(result.success).toBe(false);
			expect(result.attempts).toBe(1);
		});

		it('transitions to error when sendToken rejects', async () => {
			mockSendToken.mockRejectedValue(new Error('Insufficient paymaster deposit'));

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('error');
			expect(result.sendError).toBe('Insufficient paymaster deposit');
		});
	});

	// ── BUG-001 verification: polling uses correct RPC method ─────────────

	describe('BUG-001 verification: polling uses correct RPC method', () => {
		it('uses eth_getTransactionReceipt with the returned tx hash', async () => {
			vi.useFakeTimers();

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ result: null })
			});

			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts: 1, intervalMs: 1000 });

			await vi.advanceTimersByTimeAsync(1500);
			await pollPromise;

			expect(mockFetch).toHaveBeenCalledTimes(1);

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe(MOCK_ALTO_URL);

			const body = JSON.parse(options.body);
			expect(body.method).toBe('eth_getTransactionReceipt');
			expect(body.params[0]).toBe(MOCK_TX_HASH);
			expect(body.jsonrpc).toBe('2.0');
		});

		it('polls until receipt is available', async () => {
			vi.useFakeTimers();

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ result: null })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ result: null })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						result: { transactionHash: MOCK_TX_HASH, blockNumber: '0x123', status: '0x1' }
					})
				});

			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts: 5, intervalMs: 1000 });

			// First poll (1s)
			await vi.advanceTimersByTimeAsync(1200);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Second poll (2s total)
			await vi.advanceTimersByTimeAsync(1200);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Third poll (3s total) — receipt found
			await vi.advanceTimersByTimeAsync(1200);
			const result = await pollPromise;

			expect(mockFetch).toHaveBeenCalledTimes(3);
			expect(result.success).toBe(true);
			expect(result.attempts).toBe(3);
		});

		it('gives up after maxAttempts', async () => {
			vi.useFakeTimers();

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ result: null })
			});

			const maxAttempts = 5;
			const pollPromise = pollForReceipt(MOCK_ALTO_URL, MOCK_TX_HASH, { maxAttempts, intervalMs: 1000 });

			await vi.advanceTimersByTimeAsync(maxAttempts * 1000 + 500);
			const result = await pollPromise;

			expect(mockFetch).toHaveBeenCalledTimes(maxAttempts);
			expect(result.success).toBe(false);
			expect(result.attempts).toBe(maxAttempts);
		});
	});

	// ── Fee estimation ────────────────────────────────────────────────────

	describe('fee estimation', () => {
		it('estimates fee and transitions to confirm when balance sufficient', async () => {
			mockEstimateFee.mockResolvedValue(FEE_ESTIMATE);
			mockCheckSufficientBalance.mockResolvedValue({
				sufficient: true,
				balance: 100_000_000n,
				required: 10_010_000n
			});

			const result = await runEstimationFlow(
				VALID_RECIPIENT,
				'100',
				USDT0_ADDRESS,
				'0xUserAddress',
				true
			);

			expect(result.step).toBe('confirm');
			expect(result.feeEstimate).toEqual(FEE_ESTIMATE);
			expect(result.estimationError).toBeNull();

			// estimateFee called with correct args
			expect(mockEstimateFee).toHaveBeenCalledWith(
				USDT0_ADDRESS,
				expect.any(BigInt),
				VALID_RECIPIENT
			);

			// checkSufficientBalance called twice: before and after fee
			expect(mockCheckSufficientBalance).toHaveBeenCalledTimes(2);
		});

		it('shows error when fee estimation fails', async () => {
			mockEstimateFee.mockRejectedValue(new Error('Network fee too high for this operation'));

			const result = await runEstimationFlow(
				VALID_RECIPIENT,
				'100',
				USDT0_ADDRESS,
				'0xUserAddress',
				true
			);

			expect(result.step).toBe('input');
			expect(result.estimationError).toBe('Network fee too high for this operation');
		});

		it('shows error when initial balance insufficient', async () => {
			mockCheckSufficientBalance.mockResolvedValueOnce({
				sufficient: false,
				balance: 1_000_000n,
				required: 100_000_000n
			});

			const result = await runEstimationFlow(
				VALID_RECIPIENT,
				'100',
				USDT0_ADDRESS,
				'0xUserAddress',
				true
			);

			expect(result.step).toBe('input');
			expect(result.estimationError).toBe('Insufficient balance for transfer amount.');
		});

		it('shows error when balance insufficient to cover fee', async () => {
			mockCheckSufficientBalance
				.mockResolvedValueOnce({
					sufficient: true,
					balance: 100_000_000n,
					required: 100_000_000n
				})
				.mockResolvedValueOnce({
					sufficient: false,
					balance: 100_000_000n,
					required: 100_150_000n
				});

			const result = await runEstimationFlow(
				VALID_RECIPIENT,
				'100',
				USDT0_ADDRESS,
				'0xUserAddress',
				true
			);

			expect(result.step).toBe('input');
			expect(result.estimationError).toBe('Insufficient balance to cover transfer + network fee.');
		});

		it('shows error when wallet is not connected', async () => {
			const result = await runEstimationFlow(
				VALID_RECIPIENT,
				'100',
				USDT0_ADDRESS,
				null,
				false
			);

			expect(result.step).toBe('input');
			expect(result.estimationError).toBe('Wallet not connected. Please connect your wallet first.');
		});

		it('does not estimate when form is invalid', async () => {
			const result = await runEstimationFlow(
				'',
				'100',
				USDT0_ADDRESS,
				'0xUserAddress',
				true
			);

			expect(result.step).toBe('input');
			expect(mockEstimateFee).not.toHaveBeenCalled();
		});
	});

	// ── Address validation ────────────────────────────────────────────────

	describe('address validation', () => {
		it('returns false when recipient is empty', () => {
			expect(isValidForm('', '100', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false when amount is zero', () => {
			expect(isValidForm(VALID_RECIPIENT, '0', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false when amount is empty', () => {
			expect(isValidForm(VALID_RECIPIENT, '', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false when token is unknown', () => {
			expect(isValidForm(VALID_RECIPIENT, '100', '0xUnknownToken')).toBe(false);
		});

		it('returns true when recipient and amount are valid', () => {
			expect(isValidForm(VALID_RECIPIENT, '50', USDT0_ADDRESS)).toBe(true);
		});

		it('handles decimal amounts correctly', () => {
			expect(isValidForm(VALID_RECIPIENT, '0.01', USDT0_ADDRESS)).toBe(true);
		});

		it('returns false for amounts that parse to zero bigint', () => {
			expect(isValidForm(VALID_RECIPIENT, '0.0000000', USDT0_ADDRESS)).toBe(false);
		});
	});

	// ── Relay fallback ────────────────────────────────────────────────────

	describe('relay fallback', () => {
		it('offers direct fallback when relay fails and user has ETH', async () => {
			mockSendToken.mockRejectedValue(new Error('relay fetch timeout'));
			mockCheckETHBalance.mockResolvedValue(1_000_000_000_000_000_000n); // 1 ETH

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('fallback-confirm');
			expect(result.sendError).toBe('relay fetch timeout');
			expect(result.isDirectFallback).toBe(true);
			expect(mockCheckETHBalance).toHaveBeenCalledWith('0xUserAddress');
		});

		it('falls back to error when relay fails and user has no ETH', async () => {
			mockSendToken.mockRejectedValue(new Error('relay fetch timeout'));
			mockCheckETHBalance.mockResolvedValue(0n);

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('error');
			expect(result.sendError).toBe('relay fetch timeout');
			expect(result.isDirectFallback).toBe(false);
		});

		it('falls back to error when relay fails and ETH balance check throws', async () => {
			mockSendToken.mockRejectedValue(new Error('network timeout'));
			mockCheckETHBalance.mockRejectedValue(new Error('RPC down'));

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('error');
			expect(result.sendError).toBe('network timeout');
		});

		it('goes to error for non-relay failures', async () => {
			mockSendToken.mockRejectedValue(new Error('Insufficient paymaster deposit'));

			const result = await runConfirmSendFlow(
				FEE_ESTIMATE,
				USDT0_ADDRESS,
				VALID_RECIPIENT,
				'100',
				'0xUserAddress'
			);

			expect(result.step).toBe('error');
			expect(result.isDirectFallback).toBe(false);
			expect(mockCheckETHBalance).not.toHaveBeenCalled();
		});

		it('executes direct fallback successfully', async () => {
			mockSendTokenDirect.mockResolvedValue(MOCK_TX_HASH);

			const result = await runDirectFallbackFlow(USDT0_ADDRESS, VALID_RECIPIENT, '100');

			expect(result.step).toBe('success');
			expect(result.successTxHash).toBe(MOCK_TX_HASH);
			expect(mockSendTokenDirect).toHaveBeenCalledWith(USDT0_ADDRESS, VALID_RECIPIENT, expect.any(BigInt));
		});

		it('transitions to error when direct fallback fails', async () => {
			mockSendTokenDirect.mockRejectedValue(new Error('user rejected transaction'));

			const result = await runDirectFallbackFlow(USDT0_ADDRESS, VALID_RECIPIENT, '100');

			expect(result.step).toBe('error');
			expect(result.sendError).toBe('user rejected transaction');
		});
	});

	// ── isRelayError helper ───────────────────────────────────────────────

	describe('isRelayError', () => {
		it.each([
			['relay fetch timeout', true],
			['ECONNREFUSED 127.0.0.1:3000', true],
			['temporarily unavailable', true],
			['network error', true],
			['fetch failed', true],
			['timeout waiting for response', true],
			['Insufficient paymaster deposit', false],
			['User op reverted', false],
			['validation failed', false]
		])('"%s" → %s', (msg, expected) => {
			expect(isRelayError(msg)).toBe(expected);
		});
	});

	// ── Amount parsing ────────────────────────────────────────────────────

	describe('amount parsing', () => {
		it('parses integer amount for USDT0 (6 decimals)', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(parseAmountBigInt('100', token)).toBe(100_000_000n);
		});

		it('parses decimal amount for USDT0', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(parseAmountBigInt('0.01', token)).toBe(10_000n);
		});

		it('returns 0n for empty string', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(parseAmountBigInt('', token)).toBe(0n);
		});

		it('returns 0n when token is undefined', () => {
			expect(parseAmountBigInt('100', undefined)).toBe(0n);
		});

		it('truncates excess decimal places', () => {
			const token = findToken(USDT0_ADDRESS)!;
			// 7 decimal places but USDT0 has 6 → truncated
			expect(parseAmountBigInt('1.1234567', token)).toBe(1_123_456n);
		});

		it('pads short decimal with zeros', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(parseAmountBigInt('1.5', token)).toBe(1_500_000n);
		});
	});

	// ── MAX button logic ──────────────────────────────────────────────────

	describe('MAX button', () => {
		function computeMaxAmount(tokenBalance: bigint, selectedToken: string): string {
			const token = findToken(selectedToken);
			if (!token) return '0';
			const lower = selectedToken.toLowerCase();
			const feeBufferKey = Object.keys(FEE_BUFFER_MAX).find((k) => k.toLowerCase() === lower);
			const feeBuffer = feeBufferKey ? FEE_BUFFER_MAX[feeBufferKey] : 0n;
			if (tokenBalance <= feeBuffer) return '0';
			const maxBalance = tokenBalance - feeBuffer;
			const divisor = 10n ** BigInt(token.decimals);
			const whole = maxBalance / divisor;
			const frac = maxBalance % divisor;
			const fracStr = frac.toString().padStart(token.decimals, '0').replace(/0+$/, '');
			return fracStr ? `${whole}.${fracStr}` : whole.toString();
		}

		it('subtracts FEE_BUFFER_MAX from USDT0 balance', () => {
			const balance = 100_000_000n; // 100 USDT0
			const result = computeMaxAmount(balance, USDT0_ADDRESS);
			// 100_000_000 - 150_000 = 99_850_000 → 99.85 USDT0
			expect(result).toBe('99.85');
		});

		it('returns 0 when balance is less than fee buffer', () => {
			const balance = 100_000n; // 0.1 USDT0 < 150_000 fee buffer
			const result = computeMaxAmount(balance, USDT0_ADDRESS);
			expect(result).toBe('0');
		});

		it('returns 0 when balance equals fee buffer', () => {
			const balance = 150_000n;
			const result = computeMaxAmount(balance, USDT0_ADDRESS);
			expect(result).toBe('0');
		});

		it('handles whole number result without trailing zeros', () => {
			// Balance = 150_000 + 1_000_000 = 1_150_000 → max = 1_000_000 → 1
			const balance = 1_150_000n;
			const result = computeMaxAmount(balance, USDT0_ADDRESS);
			expect(result).toBe('1');
		});

		it('subtracts FEE_BUFFER_MAX for WBTC correctly', () => {
			const wbtcAddress = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
			// 0.01 WBTC = 1_000_000 (8 decimals) - 230 fee buffer = 999_770
			const balance = 1_000_000n;
			const result = computeMaxAmount(balance, wbtcAddress);
			expect(result).toBe('0.0099977');
		});
	});

	// ── Address validation (ethers.isAddress) ─────────────────────────────

	describe('address validation with ethers.isAddress', () => {
		it('returns true for valid checksummed address', () => {
			expect(isValidForm(VALID_RECIPIENT, '100', USDT0_ADDRESS)).toBe(true);
		});

		it('returns true for valid lowercase address', () => {
			expect(isValidForm('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', '100', USDT0_ADDRESS)).toBe(true);
		});

		it('returns false for invalid address (too short)', () => {
			expect(isValidForm('0x123', '100', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false for invalid address (no 0x prefix, short)', () => {
			expect(isValidForm('d8da6bf26964af9d7eed', '100', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false for address that is too long', () => {
			expect(isValidForm('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960451234', '100', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false for random string', () => {
			expect(isValidForm('not-an-address', '100', USDT0_ADDRESS)).toBe(false);
		});

		it('returns false for address with invalid checksum (mixed case wrong)', () => {
			// 0xZZZZ... is not valid hex
			expect(isValidForm('0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045', '100', USDT0_ADDRESS)).toBe(false);
		});
	});

	// ── Balance formatting ────────────────────────────────────────────────

	describe('balance formatting', () => {
		function formatBalance(balance: bigint, token: TokenInfo): string {
			const divisor = 10n ** BigInt(token.decimals);
			const whole = balance / divisor;
			const frac = balance % divisor;
			const fracStr = frac.toString().padStart(token.decimals, '0');
			return `${whole}.${fracStr}`;
		}

		it('formats USDT0 balance with 6 decimals', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(formatBalance(100_000_000n, token)).toBe('100.000000');
		});

		it('formats small USDT0 balance', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(formatBalance(10_000n, token)).toBe('0.010000');
		});

		it('formats zero balance', () => {
			const token = findToken(USDT0_ADDRESS)!;
			expect(formatBalance(0n, token)).toBe('0.000000');
		});

		it('formats WBTC balance with 8 decimals', () => {
			const wbtcAddress = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
			const token = findToken(wbtcAddress)!;
			expect(formatBalance(1_000_000n, token)).toBe('0.01000000');
		});
	});
});
