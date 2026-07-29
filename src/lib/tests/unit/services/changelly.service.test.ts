/**
 * Changelly Swap Service — Unit Tests
 *
 * Tests for changellyService covering: feature-flag guard, estimateSwap,
 * createSwap, getSwapStatus, getCurrencies, and getLimits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must come before importing the service
// ---------------------------------------------------------------------------

vi.mock('$lib/services/kill-switch', () => ({
	isChangeallySwapsEnabled: vi.fn(() => true),
	isChangeallyFiatEnabled: vi.fn(() => false),
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

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
	changellyService,
	type ChangellyEstimateResult,
	type ChangellySwap,
	type ChangellyCurrency,
	type ChangellyLimitResult
} from '$lib/services/changelly.service';
import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEstimate: ChangellyEstimateResult = {
	estimatedAmount: '950.123456',
	rate: '65000.00',
	fee: '0.25',
	minerFee: '0.0001'
};

const mockSwap: ChangellySwap = {
	id: 'swap-abc-123',
	status: 'waiting',
	from: 'btc',
	to: 'usdt',
	amountExpectedFrom: '0.01',
	amountExpectedTo: '650.00',
	payinAddress: 'bc1q-sender-address',
	payoutAddress: '0x-receiver-address',
	createdAt: '2025-01-01T00:00:00Z',
	updatedAt: '2025-01-01T00:00:00Z'
};

const mockCurrency: ChangellyCurrency = {
	name: 'Bitcoin',
	ticker: 'btc',
	enabled: true,
	network: 'bitcoin',
	precision: 8
};

const mockLimits: ChangellyLimitResult = {
	min: '0.001',
	max: '10'
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

describe('changellyService', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		vi.mocked(isChangeallySwapsEnabled).mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =========================================================================
	// Feature flag guard
	// =========================================================================

	describe('feature flag guard', () => {
		beforeEach(() => {
			vi.mocked(isChangeallySwapsEnabled).mockReturnValue(false);
		});

		it('estimateSwap throws when disabled', async () => {
			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Changelly swaps are not enabled');
		});

		it('createSwap throws when disabled', async () => {
			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: 'usdt',
					amount: '0.01',
					address: '0x...'
				})
			).rejects.toThrow('Changelly swaps are not enabled');
		});

		it('getSwapStatus throws when disabled', async () => {
			await expect(changellyService.getSwapStatus('swap-123')).rejects.toThrow(
				'Changelly swaps are not enabled'
			);
		});

		it('getCurrencies throws when disabled', async () => {
			await expect(changellyService.getCurrencies()).rejects.toThrow(
				'Changelly swaps are not enabled'
			);
		});

		it('getLimits throws when disabled', async () => {
			await expect(changellyService.getLimits('btc', 'usdt')).rejects.toThrow(
				'Changelly swaps are not enabled'
			);
		});
	});

	// =========================================================================
	// estimateSwap
	// =========================================================================

	describe('estimateSwap', () => {
		it('returns estimate on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockEstimate));

			const result = await changellyService.estimateSwap({
				from: 'btc',
				to: 'usdt',
				amount: '0.01'
			});

			expect(result.estimatedAmount).toBe('950.123456');
			expect(result.rate).toBe('65000.00');
			expect(result.fee).toBe('0.25');
			expect(result.minerFee).toBe('0.0001');
		});

		it('sends lowercase tickers in request body', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockEstimate));

			await changellyService.estimateSwap({
				from: 'BTC',
				to: 'USDT',
				amount: '0.01'
			});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body.from).toBe('btc');
			expect(body.to).toBe('usdt');
			expect(body.amount).toBe('0.01');
		});

		it('throws on missing from', async () => {
			await expect(
				changellyService.estimateSwap({ from: '', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('estimateSwap requires from, to, and amount');
		});

		it('throws on missing to', async () => {
			await expect(
				changellyService.estimateSwap({ from: 'btc', to: '', amount: '0.01' })
			).rejects.toThrow('estimateSwap requires from, to, and amount');
		});

		it('throws on missing amount', async () => {
			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '' })
			).rejects.toThrow('estimateSwap requires from, to, and amount');
		});

		it('throws on network error', async () => {
			fetchMock.mockRejectedValue(new Error('Network down'));

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Changelly proxy network error');
		});

		it('throws on HTTP error', async () => {
			fetchMock.mockResolvedValue(
				textErrorResponse(JSON.stringify({ message: 'Invalid pair' }), 400)
			);

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Invalid pair');
		});

		it('throws on invalid JSON response', async () => {
			fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Invalid response from Changelly proxy');
		});
	});

	// =========================================================================
	// createSwap
	// =========================================================================

	describe('createSwap', () => {
		it('returns swap on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockSwap));

			const result = await changellyService.createSwap({
				from: 'btc',
				to: 'usdt',
				amount: '0.01',
				address: '0x-receiver-address'
			});

			expect(result.id).toBe('swap-abc-123');
			expect(result.status).toBe('waiting');
			expect(result.payinAddress).toBe('bc1q-sender-address');
		});

		it('includes refundAddress when provided', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockSwap));

			await changellyService.createSwap({
				from: 'btc',
				to: 'usdt',
				amount: '0.01',
				address: '0x-receiver-address',
				refundAddress: 'bc1q-refund'
			});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body.refundAddress).toBe('bc1q-refund');
		});

		it('excludes refundAddress when not provided', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockSwap));

			await changellyService.createSwap({
				from: 'btc',
				to: 'usdt',
				amount: '0.01',
				address: '0x-receiver-address'
			});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body).not.toHaveProperty('refundAddress');
		});

		it('throws on missing from', async () => {
			await expect(
				changellyService.createSwap({
					from: '',
					to: 'usdt',
					amount: '0.01',
					address: '0x...'
				})
			).rejects.toThrow('createSwap requires from, to, amount, and address');
		});

		it('throws on missing to', async () => {
			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: '',
					amount: '0.01',
					address: '0x...'
				})
			).rejects.toThrow('createSwap requires from, to, amount, and address');
		});

		it('throws on missing amount', async () => {
			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: 'usdt',
					amount: '',
					address: '0x...'
				})
			).rejects.toThrow('createSwap requires from, to, amount, and address');
		});

		it('throws on missing address', async () => {
			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: 'usdt',
					amount: '0.01',
					address: ''
				})
			).rejects.toThrow('createSwap requires from, to, amount, and address');
		});

		it('throws on network error', async () => {
			fetchMock.mockRejectedValue(new Error('Connection refused'));

			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: 'usdt',
					amount: '0.01',
					address: '0x...'
				})
			).rejects.toThrow('Changelly proxy network error');
		});

		it('throws on HTTP error with server message', async () => {
			fetchMock.mockResolvedValue(
				textErrorResponse(JSON.stringify({ error: 'Insufficient liquidity' }), 422)
			);

			await expect(
				changellyService.createSwap({
					from: 'btc',
					to: 'usdt',
					amount: '0.01',
					address: '0x...'
				})
			).rejects.toThrow('Insufficient liquidity');
		});
	});

	// =========================================================================
	// getSwapStatus
	// =========================================================================

	describe('getSwapStatus', () => {
		it('returns swap status on success', async () => {
			const statusSwap: ChangellySwap = { ...mockSwap, status: 'confirming' };
			fetchMock.mockResolvedValue(jsonResponse(statusSwap));

			const result = await changellyService.getSwapStatus('swap-abc-123');
			expect(result.status).toBe('confirming');
			expect(result.id).toBe('swap-abc-123');
		});

		it('throws on empty ID', async () => {
			await expect(changellyService.getSwapStatus('')).rejects.toThrow(
				'getSwapStatus requires a swap ID'
			);
		});

		it('sends id in request body', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockSwap));

			await changellyService.getSwapStatus('swap-abc-123');

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body.id).toBe('swap-abc-123');
		});
	});

	// =========================================================================
	// getCurrencies
	// =========================================================================

	describe('getCurrencies', () => {
		it('returns currencies on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse([mockCurrency]));

			const result = await changellyService.getCurrencies();
			expect(result).toHaveLength(1);
			expect(result[0].ticker).toBe('btc');
			expect(result[0].name).toBe('Bitcoin');
		});

		it('returns empty array when proxy returns empty list', async () => {
			fetchMock.mockResolvedValue(jsonResponse([]));

			const result = await changellyService.getCurrencies();
			expect(result).toEqual([]);
		});

		it('throws on network error', async () => {
			fetchMock.mockRejectedValue(new Error('Timeout'));

			await expect(changellyService.getCurrencies()).rejects.toThrow(
				'Changelly proxy network error'
			);
		});
	});

	// =========================================================================
	// getLimits
	// =========================================================================

	describe('getLimits', () => {
		it('returns limits on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockLimits));

			const result = await changellyService.getLimits('btc', 'usdt');
			expect(result.min).toBe('0.001');
			expect(result.max).toBe('10');
		});

		it('sends lowercase tickers in request body', async () => {
			fetchMock.mockResolvedValue(jsonResponse(mockLimits));

			await changellyService.getLimits('BTC', 'USDT');

			const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
			expect(body.from).toBe('btc');
			expect(body.to).toBe('usdt');
		});

		it('throws on missing from', async () => {
			await expect(changellyService.getLimits('', 'usdt')).rejects.toThrow(
				'getLimits requires from and to currency tickers'
			);
		});

		it('throws on missing to', async () => {
			await expect(changellyService.getLimits('btc', '')).rejects.toThrow(
				'getLimits requires from and to currency tickers'
			);
		});

		it('throws on network error', async () => {
			fetchMock.mockRejectedValue(new Error('Connection reset'));

			await expect(changellyService.getLimits('btc', 'usdt')).rejects.toThrow(
				'Changelly proxy network error'
			);
		});

		it('throws on HTTP error with parsed message', async () => {
			fetchMock.mockResolvedValue(
				textErrorResponse(JSON.stringify({ message: 'Currency not found' }), 404)
			);

			await expect(changellyService.getLimits('xyz', 'abc')).rejects.toThrow('Currency not found');
		});
	});

	// =========================================================================
	// HTTP error body parsing
	// =========================================================================

	describe('HTTP error body parsing', () => {
		it('falls back to status text when body is empty', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('', 500));

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow(/HTTP 500/);
		});

		it('parses JSON error body with error field', async () => {
			fetchMock.mockResolvedValue(
				textErrorResponse(JSON.stringify({ error: 'Rate limit exceeded' }), 429)
			);

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Rate limit exceeded');
		});

		it('uses raw body when not valid JSON', async () => {
			fetchMock.mockResolvedValue(textErrorResponse('Bad Gateway', 502));

			await expect(
				changellyService.estimateSwap({ from: 'btc', to: 'usdt', amount: '0.01' })
			).rejects.toThrow('Bad Gateway');
		});
	});
});
