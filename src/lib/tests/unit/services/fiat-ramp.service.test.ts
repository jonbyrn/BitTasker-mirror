/**
 * Fiat Ramp Service — Unit Tests
 *
 * Tests for changellyFiatService and its exported helpers.
 * Covers: feature-flag guard, cache layer, pure helpers, error mapping,
 * AbortSignal, concurrency guard, and input validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must come before importing the service
// ---------------------------------------------------------------------------

vi.mock('$lib/services/kill-switch', () => ({
	isChangeallyFiatEnabled: vi.fn(() => true),
	isChangeallySwapsEnabled: vi.fn(() => false),
	isLifiEnabled: vi.fn(() => false),
	isSymbiosisEnabled: vi.fn(() => false),
	FEATURE_FLAGS: {
		CHANGELLY_SWAPS: 'changelly-swaps',
		CHANGELLY_FIAT: 'changelly-fiat',
		LIFI_SWAPS: 'lifi-swaps',
		SYMBIOSIS_SWAPS: 'symbiosis-swaps'
	},
	FeatureFlagService: { isEnabled: vi.fn(() => true) }
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
	changellyFiatService,
	isOfferSuccess,
	isOfferError,
	sortOffersByBestRate,
	isTerminalStatus,
	isPendingStatus,
	type ChangellyOffer,
	type ChangellyOfferSuccess,
	type ChangellyOfferError,
	type ChangellyProvider,
	type ChangellyCurrency,
	type ChangellyCountry,
	type ChangellyOrder,
	type ChangellyTransactionStatus,
	type ChangellyTransactionStatusResponse
} from '$lib/services/fiat-ramp.service';
import { isChangeallyFiatEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProvider: ChangellyProvider = {
	code: 'moonpay',
	name: 'MoonPay',
	trustPilotRating: '4.5',
	iconUrl: 'https://example.com/moonpay.png'
};

const mockCurrency: ChangellyCurrency = {
	ticker: 'btc',
	name: 'Bitcoin',
	type: 'crypto',
	extraIdName: null,
	iconUrl: 'https://example.com/btc.png',
	precision: '8'
};

const mockCountry: ChangellyCountry = {
	code: 'US',
	name: 'United States'
};

const mockSuccessOffer: ChangellyOfferSuccess = {
	providerCode: 'moonpay',
	rate: '65000.00',
	invertedRate: '0.00001538',
	fee: '1.5',
	amountFrom: '100',
	amountExpectedTo: '0.001538',
	paymentMethodOffer: [
		{
			method: 'credit_card',
			methodName: 'Credit Card',
			amountExpectedTo: '0.001538',
			invertedRate: '0.00001538',
			fee: '1.5'
		}
	]
};

const mockErrorOffer: ChangellyOfferError = {
	providerCode: 'banxa',
	errorType: 'UNSUPPORTED_PAIR',
	errorMessage: 'Pair not supported',
	errorDetails: null
};

const mockOrder: ChangellyOrder = {
	orderId: 'order-123',
	externalOrderId: 'ext-123',
	externalUserId: 'user-123',
	providerCode: 'moonpay',
	currencyFrom: 'USD',
	currencyTo: 'BTC',
	amountFrom: '100',
	walletAddress: 'bc1q...',
	redirectUrl: 'https://moonpay.com/checkout',
	createdAt: '2025-01-01T00:00:00Z'
};

const mockTxStatus: ChangellyTransactionStatusResponse = {
	orderId: 'order-123',
	externalOrderId: 'ext-123',
	status: 'pending',
	currencyFrom: 'USD',
	currencyTo: 'BTC',
	amountFrom: '100',
	amountTo: null,
	walletAddress: 'bc1q...',
	createdAt: '2025-01-01T00:00:00Z',
	updatedAt: '2025-01-01T00:05:00Z'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function textErrorResponse(body: string, status: number): Response {
	return new Response(body, { status });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fiat-ramp.service', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		vi.mocked(isChangeallyFiatEnabled).mockReturnValue(true);
		// Reset the module-level cache by calling invalidateCache
		changellyFiatService.invalidateCache();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// =========================================================================
	// Exported pure helpers
	// =========================================================================

	describe('isOfferSuccess', () => {
		it('returns true for an offer with rate data', () => {
			expect(isOfferSuccess(mockSuccessOffer)).toBe(true);
		});

		it('returns false for an error offer', () => {
			expect(isOfferSuccess(mockErrorOffer as unknown as ChangellyOffer)).toBe(false);
		});
	});

	describe('isOfferError', () => {
		it('returns true for an error offer', () => {
			expect(isOfferError(mockErrorOffer as unknown as ChangellyOffer)).toBe(true);
		});

		it('returns false for a success offer', () => {
			expect(isOfferError(mockSuccessOffer as unknown as ChangellyOffer)).toBe(false);
		});
	});

	describe('sortOffersByBestRate', () => {
		it('returns only success offers sorted by amountExpectedTo descending', () => {
			const lowOffer: ChangellyOfferSuccess = {
				...mockSuccessOffer,
				providerCode: 'low',
				amountExpectedTo: '0.001000'
			};
			const highOffer: ChangellyOfferSuccess = {
				...mockSuccessOffer,
				providerCode: 'high',
				amountExpectedTo: '0.002000'
			};
			const offers: ChangellyOffer[] = [
				mockErrorOffer as unknown as ChangellyOffer,
				lowOffer,
				highOffer
			];

			const sorted = sortOffersByBestRate(offers);
			expect(sorted).toHaveLength(2);
			expect(sorted[0].providerCode).toBe('high');
			expect(sorted[1].providerCode).toBe('low');
		});

		it('returns empty array when all offers are errors', () => {
			const offers: ChangellyOffer[] = [
				mockErrorOffer as unknown as ChangellyOffer,
				{ ...mockErrorOffer, providerCode: 'transak' } as unknown as ChangellyOffer
			];
			expect(sortOffersByBestRate(offers)).toEqual([]);
		});

		it('returns empty array for empty input', () => {
			expect(sortOffersByBestRate([])).toEqual([]);
		});
	});

	describe('isTerminalStatus', () => {
		it.each(['complete', 'failed', 'expired', 'refunded'] as ChangellyTransactionStatus[])(
			'returns true for %s',
			(status) => {
				expect(isTerminalStatus(status)).toBe(true);
			}
		);

		it.each(['created', 'pending', 'hold'] as ChangellyTransactionStatus[])(
			'returns false for %s',
			(status) => {
				expect(isTerminalStatus(status)).toBe(false);
			}
		);
	});

	describe('isPendingStatus', () => {
		it.each(['created', 'pending', 'hold'] as ChangellyTransactionStatus[])(
			'returns true for %s',
			(status) => {
				expect(isPendingStatus(status)).toBe(true);
			}
		);

		it.each(['complete', 'failed', 'expired', 'refunded'] as ChangellyTransactionStatus[])(
			'returns false for %s',
			(status) => {
				expect(isPendingStatus(status)).toBe(false);
			}
		);
	});

	// =========================================================================
	// Feature flag guard
	// =========================================================================

	describe('feature flag guard', () => {
		beforeEach(() => {
			vi.mocked(isChangeallyFiatEnabled).mockReturnValue(false);
		});

		it('getProviders throws when disabled', async () => {
			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Changelly fiat ramp is not enabled'
			);
		});

		it('getCurrencies throws when disabled', async () => {
			await expect(changellyFiatService.getCurrencies()).rejects.toThrow(
				'Changelly fiat ramp is not enabled'
			);
		});

		it('getAvailableCountries throws when disabled', async () => {
			await expect(changellyFiatService.getAvailableCountries()).rejects.toThrow(
				'Changelly fiat ramp is not enabled'
			);
		});

		it('getOffers throws when disabled', async () => {
			await expect(
				changellyFiatService.getOffers({
					currencyFrom: 'USD',
					currencyTo: 'BTC',
					amountFrom: '100',
					country: 'US'
				})
			).rejects.toThrow('Changelly fiat ramp is not enabled');
		});

		it('getSellOffers throws when disabled', async () => {
			await expect(
				changellyFiatService.getSellOffers({
					currencyFrom: 'BTC',
					currencyTo: 'USD',
					amountFrom: '0.01',
					country: 'US'
				})
			).rejects.toThrow('Changelly fiat ramp is not enabled');
		});

		it('createOnRampOrder throws when disabled', async () => {
			await expect(
				changellyFiatService.createOnRampOrder({
					fiatCurrency: 'USD',
					fiatAmount: '100',
					cryptoCurrency: 'BTC',
					cryptoAddress: 'bc1q...',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('Changelly fiat ramp is not enabled');
		});

		it('createOffRampOrder throws when disabled', async () => {
			await expect(
				changellyFiatService.createOffRampOrder({
					cryptoCurrency: 'BTC',
					cryptoAmount: '0.01',
					fiatCurrency: 'USD',
					fiatAddress: 'bank-account',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('Changelly fiat ramp is not enabled');
		});

		it('getTransactionStatus throws when disabled', async () => {
			await expect(changellyFiatService.getTransactionStatus('ext-123')).rejects.toThrow(
				'Changelly fiat ramp is not enabled'
			);
		});

		it('validateAddress throws when disabled', async () => {
			await expect(
				changellyFiatService.validateAddress({
					currency: 'btc',
					walletAddress: 'bc1q...'
				})
			).rejects.toThrow('Changelly fiat ramp is not enabled');
		});
	});

	// =========================================================================
	// Cache layer
	// =========================================================================

	describe('cache layer', () => {
		it('caches providers and avoids duplicate fetches', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockProvider]));

			const first = await changellyFiatService.getProviders();
			const second = await changellyFiatService.getProviders();

			expect(first).toEqual([mockProvider]);
			expect(second).toEqual([mockProvider]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('cache expires after TTL (5 minutes)', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([mockProvider])));

			await changellyFiatService.getProviders();
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Advance time past the 5-minute TTL
			vi.advanceTimersByTime(5 * 60 * 1000 + 1);

			await changellyFiatService.getProviders();
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it('invalidateCache forces refetch', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([mockProvider])));

			await changellyFiatService.getProviders();
			expect(fetchMock).toHaveBeenCalledTimes(1);

			changellyFiatService.invalidateCache();

			await changellyFiatService.getProviders();
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it('currencies are cached per parameter combination', async () => {
			fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([mockCurrency])));

			await changellyFiatService.getCurrencies({ type: 'crypto' });
			await changellyFiatService.getCurrencies({ type: 'fiat' });

			expect(fetchMock).toHaveBeenCalledTimes(2);

			// Same params → cache hit
			await changellyFiatService.getCurrencies({ type: 'crypto' });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	// =========================================================================
	// Error mapping (tested through service methods)
	// =========================================================================

	describe('error mapping', () => {
		it('maps 400 to validation error message', async () => {
			fetchMock.mockResolvedValue(
				textErrorResponse(JSON.stringify({ message: 'Bad amount' }), 400)
			);

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Validation error: Bad amount'
			);
		});

		it('maps 401 to authentication error', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Unauthorized', 401));

			await expect(changellyFiatService.getProviders()).rejects.toThrow('Authentication failed');
		});

		it('maps 429 to rate limit error', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Rate limited', 429));

			await expect(changellyFiatService.getProviders()).rejects.toThrow('Too many requests');
		});

		it('maps 502 to provider unavailable', async () => {
			fetchMock.mockResolvedValue(textErrorResponse(JSON.stringify({ error: 'Bad Gateway' }), 502));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Provider temporarily unavailable'
			);
		});

		it('maps 503 to provider unavailable', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Service Unavailable', 503));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Provider temporarily unavailable'
			);
		});

		it('maps 504 to provider unavailable', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Gateway Timeout', 504));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Provider temporarily unavailable'
			);
		});

		it('uses fallback message for unknown status with plain text', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Something broke', 500));

			await expect(changellyFiatService.getProviders()).rejects.toThrow('Something broke');
		});

		it('uses HTTP status in fallback when body is empty', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('', 418));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(/HTTP 418/);
		});
	});

	// =========================================================================
	// Network errors
	// =========================================================================

	describe('network errors', () => {
		it('wraps fetch rejection into a descriptive error', async () => {
			fetchMock.mockRejectedValue(new Error('DNS resolution failed'));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Fiat ramp proxy network error'
			);
		});
	});

	// =========================================================================
	// Input validation (assertString)
	// =========================================================================

	describe('input validation', () => {
		it('getOffers throws on empty currencyFrom', async () => {
			await expect(
				changellyFiatService.getOffers({
					currencyFrom: '',
					currencyTo: 'BTC',
					amountFrom: '100',
					country: 'US'
				})
			).rejects.toThrow('currencyFrom is required');
		});

		it('getOffers throws on empty currencyTo', async () => {
			await expect(
				changellyFiatService.getOffers({
					currencyFrom: 'USD',
					currencyTo: '',
					amountFrom: '100',
					country: 'US'
				})
			).rejects.toThrow('currencyTo is required');
		});

		it('getOffers throws on empty amountFrom', async () => {
			await expect(
				changellyFiatService.getOffers({
					currencyFrom: 'USD',
					currencyTo: 'BTC',
					amountFrom: '',
					country: 'US'
				})
			).rejects.toThrow('amountFrom is required');
		});

		it('getOffers throws on empty country', async () => {
			await expect(
				changellyFiatService.getOffers({
					currencyFrom: 'USD',
					currencyTo: 'BTC',
					amountFrom: '100',
					country: ''
				})
			).rejects.toThrow('country is required');
		});

		it('getTransactionStatus throws on empty externalOrderId', async () => {
			await expect(changellyFiatService.getTransactionStatus('')).rejects.toThrow(
				'externalOrderId is required'
			);
		});

		it('validateAddress throws on empty currency', async () => {
			await expect(
				changellyFiatService.validateAddress({ currency: '', walletAddress: 'bc1q...' })
			).rejects.toThrow('currency is required');
		});

		it('validateAddress throws on empty walletAddress', async () => {
			await expect(
				changellyFiatService.validateAddress({ currency: 'btc', walletAddress: '' })
			).rejects.toThrow('walletAddress is required');
		});

		it('createOnRampOrder throws on missing fiatCurrency', async () => {
			await expect(
				changellyFiatService.createOnRampOrder({
					fiatCurrency: '',
					fiatAmount: '100',
					cryptoCurrency: 'BTC',
					cryptoAddress: 'bc1q...',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('fiatCurrency is required');
		});

		it('createOffRampOrder throws on missing cryptoAmount', async () => {
			await expect(
				changellyFiatService.createOffRampOrder({
					cryptoCurrency: 'BTC',
					cryptoAmount: '',
					fiatCurrency: 'USD',
					fiatAddress: 'bank',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('cryptoAmount is required');
		});
	});

	// =========================================================================
	// AbortSignal
	// =========================================================================

	describe('AbortSignal', () => {
		it('getOffers passes signal through to fetch', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockSuccessOffer]));
			const controller = new AbortController();

			await changellyFiatService.getOffers(
				{
					currencyFrom: 'USD',
					currencyTo: 'BTC',
					amountFrom: '100',
					country: 'US'
				},
				controller.signal
			);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ signal: controller.signal })
			);
		});

		it('getSellOffers passes signal through to fetch', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockSuccessOffer]));
			const controller = new AbortController();

			await changellyFiatService.getSellOffers(
				{
					currencyFrom: 'BTC',
					currencyTo: 'USD',
					amountFrom: '0.01',
					country: 'US'
				},
				controller.signal
			);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ signal: controller.signal })
			);
		});

		it('propagates AbortError when signal is aborted', async () => {
			const abortError = new DOMException('The operation was aborted.', 'AbortError');
			fetchMock.mockRejectedValue(abortError);

			await expect(
				changellyFiatService.getOffers(
					{
						currencyFrom: 'USD',
						currencyTo: 'BTC',
						amountFrom: '100',
						country: 'US'
					},
					AbortSignal.abort()
				)
			).rejects.toThrow('aborted');
		});
	});

	// =========================================================================
	// Concurrency guard
	// =========================================================================

	describe('concurrency guard', () => {
		it('createOnRampOrder rejects double-submit', async () => {
			// Make the first request hang so orderInProgress stays true
			let resolveFirst!: (value: Response) => void;
			fetchMock.mockImplementation(
				() => new Promise<Response>((resolve) => (resolveFirst = resolve))
			);

			const firstCall = changellyFiatService.createOnRampOrder({
				fiatCurrency: 'USD',
				fiatAmount: '100',
				cryptoCurrency: 'BTC',
				cryptoAddress: 'bc1q...',
				providerCode: 'moonpay',
				country: 'US'
			});

			// Give the first call time to start and set orderInProgress
			await vi.advanceTimersByTimeAsync(0);

			await expect(
				changellyFiatService.createOnRampOrder({
					fiatCurrency: 'USD',
					fiatAmount: '200',
					cryptoCurrency: 'BTC',
					cryptoAddress: 'bc1q...',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('Order already in progress');

			// Clean up: resolve the first call
			resolveFirst(jsonResponse(mockOrder));
			await firstCall;
		});

		it('createOffRampOrder rejects double-submit', async () => {
			let resolveFirst!: (value: Response) => void;
			fetchMock.mockImplementation(
				() => new Promise<Response>((resolve) => (resolveFirst = resolve))
			);

			const firstCall = changellyFiatService.createOffRampOrder({
				cryptoCurrency: 'BTC',
				cryptoAmount: '0.01',
				fiatCurrency: 'USD',
				fiatAddress: 'bank-account',
				providerCode: 'moonpay',
				country: 'US'
			});

			await vi.advanceTimersByTimeAsync(0);

			await expect(
				changellyFiatService.createOffRampOrder({
					cryptoCurrency: 'BTC',
					cryptoAmount: '0.02',
					fiatCurrency: 'USD',
					fiatAddress: 'bank-account',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('Order already in progress');

			resolveFirst(jsonResponse(mockOrder));
			await firstCall;
		});
	});

	// =========================================================================
	// Service methods — success paths
	// =========================================================================

	describe('getProviders', () => {
		it('returns providers on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockProvider]));

			const result = await changellyFiatService.getProviders();
			expect(result).toEqual([mockProvider]);
		});
	});

	describe('getCurrencies', () => {
		it('returns currencies on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockCurrency]));

			const result = await changellyFiatService.getCurrencies();
			expect(result).toEqual([mockCurrency]);
		});

		it('passes type and providerCode as query params', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockCurrency]));

			await changellyFiatService.getCurrencies({ type: 'crypto', providerCode: 'moonpay' });

			const calledUrl = fetchMock.mock.calls[0][0] as string;
			expect(calledUrl).toContain('type=crypto');
			expect(calledUrl).toContain('providerCode=moonpay');
		});
	});

	describe('getAvailableCountries', () => {
		it('returns countries on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockCountry]));

			const result = await changellyFiatService.getAvailableCountries();
			expect(result).toEqual([mockCountry]);
		});
	});

	describe('getOffers', () => {
		it('returns offers on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockSuccessOffer, mockErrorOffer]));

			const result = await changellyFiatService.getOffers({
				currencyFrom: 'USD',
				currencyTo: 'BTC',
				amountFrom: '100',
				country: 'US'
			});

			expect(result).toHaveLength(2);
			expect(isOfferSuccess(result[0])).toBe(true);
			expect(isOfferError(result[1])).toBe(true);
		});
	});

	describe('getSellOffers', () => {
		it('returns sell offers on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockSuccessOffer]));

			const result = await changellyFiatService.getSellOffers({
				currencyFrom: 'BTC',
				currencyTo: 'USD',
				amountFrom: '0.01',
				country: 'US'
			});

			expect(result).toHaveLength(1);
		});
	});

	describe('createOnRampOrder', () => {
		it('creates an order and returns mapped result', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockOrder));

			const result = await changellyFiatService.createOnRampOrder({
				fiatCurrency: 'USD',
				fiatAmount: '100',
				cryptoCurrency: 'BTC',
				cryptoAddress: 'bc1q...',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(result.orderId).toBe('order-123');
			expect(result.redirectUrl).toBe('https://moonpay.com/checkout');
		});

		it('uppercases currency codes in the request body', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockOrder));

			await changellyFiatService.createOnRampOrder({
				fiatCurrency: 'usd',
				fiatAmount: '100',
				cryptoCurrency: 'btc',
				cryptoAddress: 'bc1q...',
				providerCode: 'moonpay',
				country: 'US'
			});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body.currencyFrom).toBe('USD');
			expect(body.currencyTo).toBe('BTC');
		});
	});

	describe('createOffRampOrder', () => {
		it('creates an order and returns mapped result', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockOrder));

			const result = await changellyFiatService.createOffRampOrder({
				cryptoCurrency: 'BTC',
				cryptoAmount: '0.01',
				fiatCurrency: 'USD',
				fiatAddress: 'bank-account',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(result.orderId).toBe('order-123');
		});
	});

	describe('getTransactionStatus', () => {
		it('returns transaction status on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockTxStatus));

			const result = await changellyFiatService.getTransactionStatus('ext-123');
			expect(result.status).toBe('pending');
			expect(result.externalOrderId).toBe('ext-123');
		});
	});

	describe('validateAddress', () => {
		it('returns validation result on success', async () => {
			const validation = { result: true, cause: null };
			fetchMock.mockResolvedValue(jsonResponse(validation));

			const result = await changellyFiatService.validateAddress({
				currency: 'btc',
				walletAddress: 'bc1q...'
			});

			expect(result.result).toBe(true);
		});

		it('returns false result for invalid address', async () => {
			const validation = { result: false, cause: 'walletAddress' };
			fetchMock.mockResolvedValue(jsonResponse(validation));

			const result = await changellyFiatService.validateAddress({
				currency: 'btc',
				walletAddress: 'invalid'
			});

			expect(result.result).toBe(false);
			expect(result.cause).toBe('walletAddress');
		});
	});

	// =========================================================================
	// JSON parse error
	// =========================================================================

	describe('JSON parse error', () => {
		it('throws on invalid JSON response', async () => {
			fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

			await expect(changellyFiatService.getProviders()).rejects.toThrow(
				'Invalid response from fiat ramp proxy'
			);
		});
	});
});
