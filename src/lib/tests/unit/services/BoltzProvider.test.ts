/**
 * BoltzProvider — Unit Tests
 *
 * Tests the BoltzProvider class from `src/lib/services/BoltzProvider.ts`.
 * Mocks: global fetch, @sentry/sveltekit, $lib/utils/debug.
 *
 * Covers: getQuote, createSwap, createReverseSwap, createSubmarineSwap,
 *         getSwapStatus, claimSwap — input validation, API calls, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

import { BoltzProvider } from '$lib/services/BoltzProvider';

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ETH_ADDRESS = '0x' + 'a'.repeat(40);
const VALID_PREIMAGE_HASH = 'b'.repeat(64);
const VALID_PUBKEY = 'c'.repeat(66);

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		json: async () => body,
		text: async () => JSON.stringify(body),
		headers: new Headers(),
		body: null,
		bodyUsed: false,
		arrayBuffer: async () => new ArrayBuffer(0),
		blob: async () => new Blob(),
		formData: async () => new FormData(),
		clone: () => jsonResponse(body, status),
		bytes: async () => new Uint8Array(0)
	} as Response;
}

function errorResponse(status: number, body: { error?: string }): Response {
	return {
		ok: false,
		status,
		statusText: 'Error',
		json: async () => body,
		text: async () => JSON.stringify(body),
		headers: new Headers(),
		body: null,
		bodyUsed: false,
		arrayBuffer: async () => new ArrayBuffer(0),
		blob: async () => new Blob(),
		formData: async () => new FormData(),
		clone: () => errorResponse(status, body),
		bytes: async () => new Uint8Array(0)
	} as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BoltzProvider', () => {
	let provider: BoltzProvider;

	beforeEach(() => {
		provider = new BoltzProvider();
		mockFetch.mockReset();
	});

	// =========================================================================
	// getQuote
	// =========================================================================

	describe('getQuote', () => {
		const pairsResponse = {
			pairs: {
				RBTC: {
					TBTC: {
						hash: 'abc',
						rate: 1.0,
						limits: { minimal: 2500, maximal: 5_000_000 },
						fees: {
							percentage: 0.25,
							minerFees: {
								server: 200,
								user: { lockup: 100, claim: 150 }
							}
						}
					}
				}
			}
		};

		it('returns null for zero amount', async () => {
			const result = await provider.getQuote(0);
			expect(result).toBeNull();
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('returns null for negative amount', async () => {
			const result = await provider.getQuote(-100);
			expect(result).toBeNull();
		});

		it('returns null for NaN amount', async () => {
			const result = await provider.getQuote(NaN);
			expect(result).toBeNull();
		});

		it('returns null for Infinity amount', async () => {
			const result = await provider.getQuote(Infinity);
			expect(result).toBeNull();
		});

		it('returns a valid quote for a known pair', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(pairsResponse));

			const quote = await provider.getQuote(100_000, 'RBTC', 'TBTC');

			expect(quote).not.toBeNull();
			expect(quote!.fromAsset).toBe('RBTC');
			expect(quote!.toAsset).toBe('TBTC');
			expect(quote!.rate).toBe(1.0);
			expect(quote!.protocolFeePercent).toBe(0.25);
			expect(quote!.minerFeeSats).toBe(450); // 200 + 100 + 150
			expect(quote!.totalFeeSats).toBe(450 + Math.floor(100_000 * 0.0025));
			expect(quote!.estimatedTimeMin).toBe(5);
			expect(quote!.limits).toEqual({ min: 2500, max: 5_000_000 });
		});

		it('returns null when pair is not found', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(pairsResponse));

			const quote = await provider.getQuote(100_000, 'RBTC', 'ETH');
			expect(quote).toBeNull();
		});

		it('returns null when pairs object is empty', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const quote = await provider.getQuote(100_000);
			expect(quote).toBeNull();
		});

		it('propagates fetch errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network failure'));

			await expect(provider.getQuote(100_000)).rejects.toThrow('Boltz API network error');
		});

		it('handles API error responses', async () => {
			mockFetch.mockResolvedValueOnce(errorResponse(500, { error: 'Internal server error' }));

			await expect(provider.getQuote(100_000)).rejects.toThrow();
		});

		it('defaults to RBTC → TBTC pair', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(pairsResponse));

			const quote = await provider.getQuote(50_000);
			expect(quote).not.toBeNull();
			expect(quote!.fromAsset).toBe('RBTC');
			expect(quote!.toAsset).toBe('TBTC');
		});

		it('computes zero miner fees when minerFees is missing', async () => {
			const noMinerFees = {
				pairs: {
					RBTC: {
						TBTC: {
							hash: 'abc',
							rate: 1.0,
							limits: { minimal: 2500, maximal: 5_000_000 },
							fees: { percentage: 0.5 }
						}
					}
				}
			};
			mockFetch.mockResolvedValueOnce(jsonResponse(noMinerFees));

			const quote = await provider.getQuote(100_000);
			expect(quote!.minerFeeSats).toBe(0);
		});
	});

	// =========================================================================
	// createSwap
	// =========================================================================

	describe('createSwap', () => {
		const validParams = {
			amountSats: 10_000,
			claimAddress: VALID_ETH_ADDRESS,
			preimageHash: VALID_PREIMAGE_HASH,
			refundPublicKey: VALID_PUBKEY
		};

		it('rejects zero amount', async () => {
			await expect(provider.createSwap({ ...validParams, amountSats: 0 })).rejects.toThrow(
				'Invalid amount'
			);
		});

		it('rejects negative amount', async () => {
			await expect(provider.createSwap({ ...validParams, amountSats: -1 })).rejects.toThrow(
				'Invalid amount'
			);
		});

		it('rejects invalid claim address', async () => {
			await expect(
				provider.createSwap({ ...validParams, claimAddress: 'not-an-address' })
			).rejects.toThrow('Invalid claim address');
		});

		it('rejects short preimage hash', async () => {
			await expect(
				provider.createSwap({ ...validParams, preimageHash: 'tooshort' })
			).rejects.toThrow('Invalid preimage hash');
		});

		it('rejects empty preimage hash', async () => {
			await expect(provider.createSwap({ ...validParams, preimageHash: '' })).rejects.toThrow(
				'Invalid preimage hash'
			);
		});

		it('returns swap details on success', async () => {
			const lockupAddr = '0x' + 'd'.repeat(40);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'swap-abc-123',
					lockupDetails: {
						lockupAddress: lockupAddr,
						amount: 10_000,
						timeoutBlockHeight: 850_000,
						claimAddress: VALID_ETH_ADDRESS
					}
				})
			);

			const result = await provider.createSwap(validParams);

			expect(result.swapId).toBe('swap-abc-123');
			expect(result.lockupAddress).toBe(lockupAddr);
			expect(result.expectedAmount).toBe(10_000);
			expect(result.timeoutBlockHeight).toBe(850_000);
			expect(result.claimAddress).toBe(VALID_ETH_ADDRESS);
		});

		it('validates lockup address from API response', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'swap-abc-123',
					lockupDetails: {
						lockupAddress: 'invalid-lockup',
						amount: 10_000,
						claimAddress: '0x' + 'a'.repeat(40)
					}
				})
			);

			await expect(provider.createSwap(validParams)).rejects.toThrow(
				'Boltz returned invalid lockup address'
			);
		});

		it('rejects response with missing id', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					lockupDetails: {
						lockupAddress: '0x' + 'e'.repeat(40),
						amount: 10_000
					}
				})
			);

			await expect(provider.createSwap(validParams)).rejects.toThrow('Invalid response from Boltz');
		});

		it('rejects response with missing lockupAddress', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'swap-abc-123',
					lockupDetails: { amount: 10_000 }
				})
			);

			await expect(provider.createSwap(validParams)).rejects.toThrow('Invalid response from Boltz');
		});

		it('propagates API error responses', async () => {
			mockFetch.mockResolvedValueOnce(errorResponse(400, { error: 'Amount below minimum' }));

			await expect(provider.createSwap(validParams)).rejects.toThrow();
		});

		it('propagates network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('timeout'));

			await expect(provider.createSwap(validParams)).rejects.toThrow('Boltz API network error');
		});
	});

	// =========================================================================
	// createReverseSwap
	// =========================================================================

	describe('createReverseSwap', () => {
		it('rejects zero amount', async () => {
			await expect(provider.createReverseSwap(0, VALID_ETH_ADDRESS)).rejects.toThrow(
				'Invalid amount'
			);
		});

		it('rejects negative amount', async () => {
			await expect(provider.createReverseSwap(-500, VALID_ETH_ADDRESS)).rejects.toThrow(
				'Invalid amount'
			);
		});

		it('rejects invalid claim address', async () => {
			await expect(provider.createReverseSwap(10_000, 'bad')).rejects.toThrow(
				'Invalid claim address'
			);
		});

		it('returns invoice on success', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'rev-swap-456',
					invoice: 'lnbc1000n1...',
					expectedAmount: 10_000
				})
			);

			const result = await provider.createReverseSwap(10_000, VALID_ETH_ADDRESS);

			expect(result.swapId).toBe('rev-swap-456');
			expect(result.invoice).toBe('lnbc1000n1...');
			expect(result.expectedAmount).toBe(10_000);
		});

		it('propagates network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('offline'));

			await expect(provider.createReverseSwap(10_000, VALID_ETH_ADDRESS)).rejects.toThrow(
				'Boltz API network error'
			);
		});
	});

	// =========================================================================
	// createSubmarineSwap
	// =========================================================================

	describe('createSubmarineSwap', () => {
		it('rejects empty invoice', async () => {
			await expect(provider.createSubmarineSwap('', VALID_PUBKEY)).rejects.toThrow(
				'Invalid Lightning invoice'
			);
		});

		it('rejects short invoice', async () => {
			await expect(provider.createSubmarineSwap('short', VALID_PUBKEY)).rejects.toThrow(
				'Invalid Lightning invoice'
			);
		});

		it('returns lockup address on success', async () => {
			const lockupAddr = '0x' + 'f'.repeat(40);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'sub-swap-789',
					address: lockupAddr,
					expectedAmount: 50_000
				})
			);

			const result = await provider.createSubmarineSwap(
				'lnbc500n1abcdefghijklmnopqrstuvwxyz',
				VALID_PUBKEY
			);

			expect(result.swapId).toBe('sub-swap-789');
			expect(result.lockupAddress).toBe(lockupAddr);
			expect(result.expectedAmount).toBe(50_000);
		});

		it('validates lockup address from API response', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					id: 'sub-swap-789',
					address: 'not-valid',
					expectedAmount: 50_000
				})
			);

			await expect(
				provider.createSubmarineSwap('lnbc500n1abcdefghijklmnopqrstuvwxyz', VALID_PUBKEY)
			).rejects.toThrow('Boltz returned invalid lockup address');
		});

		it('propagates network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

			await expect(
				provider.createSubmarineSwap('lnbc500n1abcdefghijklmnopqrstuvwxyz', VALID_PUBKEY)
			).rejects.toThrow('Boltz API network error');
		});
	});

	// =========================================================================
	// getSwapStatus
	// =========================================================================

	describe('getSwapStatus', () => {
		it('returns status and transactionId on success', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					status: 'transaction.claimed',
					transaction: { id: 'tx-hash-123' }
				})
			);

			const result = await provider.getSwapStatus('swap-abc-123');

			expect(result.status).toBe('transaction.claimed');
			expect(result.transactionId).toBe('tx-hash-123');
		});

		it('returns "unknown" when status is missing', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await provider.getSwapStatus('swap-abc-123');
			expect(result.status).toBe('unknown');
		});

		it('returns claimDetails when present', async () => {
			const claimAddr = '0x' + '1'.repeat(40);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					status: 'transaction.lockup',
					claimDetails: {
						lockupAddress: claimAddr,
						amount: 10_000,
						refundAddress: VALID_ETH_ADDRESS,
						timeoutBlockHeight: 850_000
					}
				})
			);

			const result = await provider.getSwapStatus('swap-abc-123');

			expect(result.claimDetails).toBeDefined();
			expect(result.claimDetails!.lockupAddress).toBe(claimAddr);
		});

		it('validates claimDetails lockup address', async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					status: 'transaction.lockup',
					claimDetails: {
						lockupAddress: 'garbage',
						amount: 10_000,
						refundAddress: VALID_ETH_ADDRESS,
						timeoutBlockHeight: 850_000
					}
				})
			);

			await expect(provider.getSwapStatus('swap-abc-123')).rejects.toThrow(
				'Boltz returned invalid claimDetails lockup address'
			);
		});

		it('validates claimDetails refund address', async () => {
			const validClaimAddr = '0x' + '2'.repeat(40);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					status: 'transaction.lockup',
					claimDetails: {
						lockupAddress: validClaimAddr,
						amount: 10_000,
						refundAddress: 'garbage',
						timeoutBlockHeight: 850_000
					}
				})
			);

			await expect(provider.getSwapStatus('swap-abc-123')).rejects.toThrow(
				'Boltz returned invalid claimDetails refund address'
			);
		});

		it('propagates network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('aborted'));

			await expect(provider.getSwapStatus('swap-abc-123')).rejects.toThrow(
				'Boltz API network error'
			);
		});
	});

	// =========================================================================
	// claimSwap
	// =========================================================================

	describe('claimSwap', () => {
		it('returns transactionHex on success', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ transactionHex: '0xdeadbeef' }));

			const result = await provider.claimSwap('swap-abc-123', 'a'.repeat(64));
			expect(result.transactionHex).toBe('0xdeadbeef');
		});

		it('returns empty string when transactionHex is missing', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await provider.claimSwap('swap-abc-123', 'a'.repeat(64));
			expect(result.transactionHex).toBe('');
		});

		it('propagates network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('connection reset'));

			await expect(provider.claimSwap('swap-abc-123', 'a'.repeat(64))).rejects.toThrow(
				'Boltz API network error'
			);
		});
	});
});
