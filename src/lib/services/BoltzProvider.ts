/**
 * Boltz.exchange Chain Swap Provider
 *
 * Client-side wrapper for the Boltz v2 chain swap REST API.
 * Handles rBTC → tBTC swaps via the Boltz HTTP API.
 *
 * Creates are stubbed for now — only getQuote is fully implemented.
 *
 * @see https://docs.boltz.exchange/v/api/api-v2
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';

const debug = createDebug('boltz-provider');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOLTZ_BASE_URL = import.meta.env.VITE_BOLTZ_API_URL || 'https://api.boltz.exchange/v2';

/** Timeout for Boltz API requests (ms). */
const BOLTZ_REQUEST_TIMEOUT_MS = 10000;

/** Estimated on-chain swap time in minutes. */
const SWAP_ESTIMATED_TIME_MIN = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoltzQuote {
	fromAsset: string;
	toAsset: string;
	rate: number;
	protocolFeePercent: number;
	minerFeeSats: number;
	totalFeeSats: number;
	estimatedTimeMin: number;
	limits: { min: number; max: number };
}

interface BoltzLimits {
	minimal: number;
	maximal: number;
}

interface BoltzFees {
	percentage: number;
	minerFees?: {
		server?: number;
		user?: { lockup?: number; claim?: number };
	};
}

interface BoltzPairInfo {
	hash: string;
	rate: number;
	limits: BoltzLimits;
	fees: BoltzFees;
}

interface BoltzPairsResponse {
	pairs: Record<string, Record<string, BoltzPairInfo>>;
}

/**
 * Boltz API returns either `{ pairs: {...} }` (with wrapper) or a flat
 * `{ RBTC: {...}, TBTC: {...} }` (no wrapper). This union handles both.
 */
type BoltzPairsApiResponse = BoltzPairsResponse | Record<string, Record<string, BoltzPairInfo>>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate an EVM address returned by the Boltz API.
 * Throws if the address does not match the expected 0x + 40 hex chars format.
 * Logs a Sentry breadcrumb on failure for production debugging.
 */
function validateBoltzAddress(address: string, label: string): void {
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
		Sentry.addBreadcrumb({
			category: 'boltz-provider',
			message: `Invalid ${label} from Boltz API: ${address.slice(0, 10)}...`,
			level: 'warning'
		});
		throw new Error(`Boltz returned invalid ${label}: ${address.slice(0, 10)}...`);
	}
}

async function fetchBoltz<TResponse>(url: string, options?: RequestInit): Promise<TResponse> {
	debug.log('%s %s', options?.method || 'GET', url);

	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		throw new Error('Device is offline — cannot reach Boltz API');
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), BOLTZ_REQUEST_TIMEOUT_MS);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			...options,
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				...(options?.headers || {})
			}
		})
	);

	clearTimeout(timeoutId);

	if (fetchError) {
		debug.error('Boltz network error: %s', fetchError.message);
		throw new Error(`Boltz API network error: ${fetchError.message}`);
	}

	if (!response || !response.ok) {
		const errorBody = await parseBoltzErrorBody(response);
		debug.error('Boltz returned error: %s', errorBody);
		throw new Error(errorBody);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('Boltz parse error: %s', parseError.message);
		throw new Error('Invalid response from Boltz API');
	}

	return json;
}

async function parseBoltzErrorBody(response: Response | null): Promise<string> {
	if (!response) return 'No response from Boltz API';
	const { data: body } = await tryCatch<string>(response.text());
	if (body) {
		try {
			const parsed = JSON.parse(body) as { error?: string; message?: string };
			return parsed.error || parsed.message || body;
		} catch {
			return body;
		}
	}
	return response.statusText || `HTTP ${response.status}`;
}

function resolvePair(
	pairs: Record<string, Record<string, BoltzPairInfo>>,
	from: string,
	to: string
): BoltzPairInfo | null {
	const fromPairs = pairs[from];
	if (!fromPairs) return null;
	return fromPairs[to] ?? null;
}

function computeMinerFeeSats(pair: BoltzPairInfo): number {
	const mf = pair.fees?.minerFees;
	if (!mf) return 0;
	return (mf.server ?? 0) + (mf.user?.lockup ?? 0) + (mf.user?.claim ?? 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class BoltzProvider {
	/**
	 * Fetch a real-time chain swap quote.
	 *
	 * @param fromAmountSats - Amount to swap in satoshis
	 * @param fromSymbol - Source asset symbol (e.g. 'RBTC', 'TBTC', 'BTC'). Defaults to 'RBTC'.
	 * @param toSymbol - Destination asset symbol (e.g. 'TBTC', 'RBTC'). Defaults to 'TBTC'.
	 * @returns A BoltzQuote with fees and limits, or null if the pair is unavailable
	 */
	async getQuote(
		fromAmountSats: number,
		fromSymbol = 'RBTC',
		toSymbol = 'TBTC'
	): Promise<BoltzQuote | null> {
		if (!fromAmountSats || fromAmountSats <= 0 || !Number.isFinite(fromAmountSats)) {
			debug.warn('getQuote rejected: invalid amount %d', fromAmountSats);
			return null;
		}

		const data = await fetchBoltz<BoltzPairsApiResponse>(`${BOLTZ_BASE_URL}/swap/chain`);

		// Boltz API returns either { pairs: {...} } or a flat { RBTC: {...} }
		const pairs: Record<string, Record<string, BoltzPairInfo>> | undefined =
			'pairs' in data
				? (data.pairs as Record<string, Record<string, BoltzPairInfo>>)
				: (data as unknown as Record<string, Record<string, BoltzPairInfo>>);
		if (!pairs || typeof pairs !== 'object') {
			debug.warn('No pairs in Boltz response');
			return null;
		}

		const pair = resolvePair(
			pairs as Record<string, Record<string, BoltzPairInfo>>,
			fromSymbol,
			toSymbol
		);

		if (!pair) {
			debug.warn('%s->%s pair not found in Boltz chain swap response', fromSymbol, toSymbol);
			return null;
		}

		const minerFeeSats = computeMinerFeeSats(pair);
		const protocolFeePercent = pair.fees?.percentage ?? 0.25;
		const protocolFeeSats = Math.floor(fromAmountSats * (protocolFeePercent / 100));
		const totalFeeSats = minerFeeSats + protocolFeeSats;

		return {
			fromAsset: fromSymbol,
			toAsset: toSymbol,
			rate: pair.rate,
			protocolFeePercent,
			minerFeeSats,
			totalFeeSats,
			estimatedTimeMin: SWAP_ESTIMATED_TIME_MIN,
			limits: {
				min: pair.limits?.minimal ?? 2500,
				max: pair.limits?.maximal ?? 5_000_000
			}
		};
	}

	/**
	 * Create a chain swap via Boltz.
	 *
	 * POST /v2/swap/chain — submits the swap request with lockup details.
	 * Returns the lockup address where the source asset must be sent.
	 *
	 * @param fromSymbol - Source asset (e.g. 'RBTC', 'TBTC'). Defaults to 'RBTC'.
	 * @param toSymbol - Destination asset (e.g. 'TBTC', 'RBTC'). Defaults to 'TBTC'.
	 */
	async createSwap(params: {
		amountSats: number;
		claimAddress: string;
		preimageHash: string;
		refundPublicKey: string;
		fromSymbol?: string;
		toSymbol?: string;
	}): Promise<{
		swapId: string;
		lockupAddress: string;
		expectedAmount: number;
		timeoutBlockHeight: number;
		claimAddress: string;
		claimDetails?: {
			lockupAddress: string;
			amount: number;
			refundAddress: string;
			timeoutBlockHeight: number;
		};
	}> {
		if (!params.amountSats || params.amountSats <= 0) throw new Error('Invalid amount');
		if (!params.claimAddress || !/^0x[a-fA-F0-9]{40}$/.test(params.claimAddress))
			throw new Error('Invalid claim address');
		if (!params.preimageHash || params.preimageHash.length !== 64)
			throw new Error('Invalid preimage hash');

		const body = {
			from: params.fromSymbol ?? 'RBTC',
			to: params.toSymbol ?? 'TBTC',
			userLockAmount: params.amountSats,
			preimageHash: params.preimageHash,
			claimAddress: params.claimAddress,
			refundPublicKey: params.refundPublicKey
		};

		const data = await fetchBoltz<{
			id: string;
			lockupDetails?: {
				lockupAddress: string;
				amount: number;
				timeoutBlockHeight?: number;
				claimAddress?: string;
			};
			claimDetails?: {
				lockupAddress: string;
				amount: number;
				refundAddress: string;
				timeoutBlockHeight: number;
			};
		}>(`${BOLTZ_BASE_URL}/swap/chain`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		const lockupAddr = data.lockupDetails?.lockupAddress;
		const expectedAmt = data.lockupDetails?.amount || params.amountSats;
		const claimAddr = data.lockupDetails?.claimAddress || params.claimAddress;
		if (!data.id || !lockupAddr) {
			throw new Error('Invalid response from Boltz: missing swap details');
		}

		// Validate addresses from Boltz API response
		validateBoltzAddress(lockupAddr, 'lockup address');
		if (data.lockupDetails?.claimAddress) {
			validateBoltzAddress(data.lockupDetails.claimAddress, 'claim address');
		}
		if (data.claimDetails?.lockupAddress) {
			validateBoltzAddress(data.claimDetails.lockupAddress, 'claimDetails lockup address');
		}
		if (data.claimDetails?.refundAddress) {
			validateBoltzAddress(data.claimDetails.refundAddress, 'claimDetails refund address');
		}

		debug.log(
			'createSwap: id=%s lockup=%s claim=%s timeout=%s hasClaimDetails=%s',
			data.id,
			lockupAddr,
			claimAddr,
			data.lockupDetails?.timeoutBlockHeight,
			!!data.claimDetails
		);

		return {
			swapId: data.id,
			lockupAddress: lockupAddr,
			expectedAmount: expectedAmt,
			timeoutBlockHeight: data.lockupDetails?.timeoutBlockHeight || 0,
			claimAddress: claimAddr,
			claimDetails: data.claimDetails
		};
	}

	/**
	 * Check the current status of a swap.
	 * Uses /v2/swap/{id} (works for chain swaps, submarine swaps, etc.)
	 * For chain swaps, also returns claimDetails needed for claiming tBTC on Arbitrum.
	 */
	async getSwapStatus(swapId: string): Promise<{
		status: string;
		transactionId?: string;
		claimDetails?: {
			lockupAddress: string;
			amount: number;
			refundAddress: string;
			timeoutBlockHeight: number;
		};
		lockupDetails?: {
			claimAddress: string;
			amount: number;
		};
	}> {
		const data = await fetchBoltz<{
			status: string;
			transaction?: { id: string };
			claimDetails?: {
				lockupAddress: string;
				amount: number;
				refundAddress: string;
				timeoutBlockHeight: number;
			};
			lockupDetails?: {
				claimAddress: string;
				amount: number;
			};
		}>(`${BOLTZ_BASE_URL}/swap/${swapId}`);

		// Validate addresses from Boltz API response
		if (data.claimDetails?.lockupAddress) {
			validateBoltzAddress(data.claimDetails.lockupAddress, 'claimDetails lockup address');
		}
		if (data.claimDetails?.refundAddress) {
			validateBoltzAddress(data.claimDetails.refundAddress, 'claimDetails refund address');
		}
		if (data.lockupDetails?.claimAddress) {
			validateBoltzAddress(data.lockupDetails.claimAddress, 'lockupDetails claim address');
		}

		return {
			status: data.status || 'unknown',
			transactionId: data.transaction?.id,
			claimDetails: data.claimDetails,
			lockupDetails: data.lockupDetails
		};
	}

	/**
	 * Claim tBTC on Arbitrum after Boltz locks. Returns the claim transaction hex.
	 */
	async claimSwap(swapId: string, preimage: string): Promise<{ transactionHex: string }> {
		const data = await fetchBoltz<{ transactionHex?: string }>(
			`${BOLTZ_BASE_URL}/swap/chain/${swapId}/claim`,
			{
				method: 'POST',
				body: JSON.stringify({ preimage })
			}
		);
		return { transactionHex: data.transactionHex || '' };
	}

	/**
	 * Create a reverse swap (Lightning → rBTC). Generates a Lightning invoice.
	 * Returns the invoice and swap details needed by the submarine swap.
	 */
	async createReverseSwap(
		amountSats: number,
		claimAddress: string
	): Promise<{
		swapId: string;
		invoice: string;
		expectedAmount: number;
	}> {
		if (!amountSats || amountSats <= 0) throw new Error('Invalid amount');
		if (!claimAddress || !/^0x[a-fA-F0-9]{40}$/.test(claimAddress))
			throw new Error('Invalid claim address');

		const body = {
			from: 'BTC',
			to: 'RBTC',
			invoiceAmount: amountSats,
			claimAddress
		};

		const data = await fetchBoltz<{
			id: string;
			invoice: string;
			expectedAmount: number;
		}>(`${BOLTZ_BASE_URL}/swap/reverse`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		return { swapId: data.id, invoice: data.invoice, expectedAmount: data.expectedAmount };
	}

	/**
	 * Create a submarine swap (TBTC → Lightning) paying a specific invoice.
	 * Returns the TBTC lockup address on Arbitrum.
	 */
	async createSubmarineSwap(
		invoice: string,
		refundPublicKey: string
	): Promise<{
		swapId: string;
		lockupAddress: string;
		expectedAmount: number;
	}> {
		if (!invoice || typeof invoice !== 'string' || invoice.length < 10)
			throw new Error('Invalid Lightning invoice');

		const body = {
			from: 'TBTC',
			to: 'BTC',
			invoice,
			refundPublicKey
		};

		const data = await fetchBoltz<{
			id: string;
			address: string;
			expectedAmount: number;
		}>(`${BOLTZ_BASE_URL}/swap/submarine`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		// Validate lockup address from Boltz API response
		validateBoltzAddress(data.address, 'lockup address');

		return {
			swapId: data.id,
			lockupAddress: data.address,
			expectedAmount: data.expectedAmount
		};
	}
}

/** Module-level singleton — BoltzProvider is stateless, so reuse is safe. */
export const boltzProvider = new BoltzProvider();
