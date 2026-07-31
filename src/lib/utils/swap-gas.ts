/**
 * Gas price fetching and EVM balance utilities for swap operations.
 *
 * Extracted from SwapForm.svelte to isolate network I/O from UI reactivity.
 * All functions are pure async — no Svelte stores, runes, or browser globals.
 */

import { createDebug } from '$lib/utils/debug';

const d = createDebug('swap-gas');

// ---------------------------------------------------------------------------
// RPC endpoints
// ---------------------------------------------------------------------------

export const RSK_RPC = 'https://mainnet.sovryn.app/rpc';
export const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Validate hex string for BigInt parsing. */
function isValidHex(value: unknown): value is string {
	return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Gas price
// ---------------------------------------------------------------------------

/**
 * Fetch the current gas price from an EVM-compatible RPC endpoint via
 * `eth_gasPrice`.
 *
 * @param rpcUrl - Full JSON-RPC endpoint URL
 * @returns Gas price in wei as a bigint
 * @throws When the RPC response is non-OK or contains an invalid hex result
 */
export async function fetchGasPrice(rpcUrl: string): Promise<bigint> {
	const resp = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'eth_gasPrice',
			params: [],
			id: 1
		})
	});
	if (!resp.ok) throw new Error(`RPC ${rpcUrl} returned ${resp.status}`);
	const data = (await resp.json()) as { result?: string };
	if (!data.result || !isValidHex(data.result)) {
		throw new Error(`Invalid gas price response from ${rpcUrl}`);
	}
	return BigInt(data.result);
}

// ---------------------------------------------------------------------------
// Live fees aggregate
// ---------------------------------------------------------------------------

/**
 * Fetch live gas prices for RSK + Arbitrum, plus BTC/USD and ETH/USD spot
 * prices. Uses `Promise.allSettled` so a single failure does not block the
 * rest — callers receive `null` for any sub-request that failed.
 */
export async function fetchLiveFees(): Promise<{
	rskGasPriceWei: bigint | null;
	arbGasPriceWei: bigint | null;
	btcUsdPrice: number | null;
	ethUsdPrice: number | null;
}> {
	const { default: cryptoPriceService } = await import('$lib/api/services/crypto-price.service');

	const [rskResult, arbResult, btcResult, ethResult] = await Promise.allSettled([
		fetchGasPrice(RSK_RPC),
		fetchGasPrice(ARB_RPC),
		cryptoPriceService.getCurrentPrice('BTC'),
		cryptoPriceService.getCurrentPrice('ETH')
	]);

	return {
		rskGasPriceWei: rskResult.status === 'fulfilled' ? rskResult.value : null,
		arbGasPriceWei: arbResult.status === 'fulfilled' ? arbResult.value : null,
		btcUsdPrice: btcResult.status === 'fulfilled' ? btcResult.value : null,
		ethUsdPrice: ethResult.status === 'fulfilled' ? ethResult.value : null
	};
}

// ---------------------------------------------------------------------------
// Arbitrum ETH balance
// ---------------------------------------------------------------------------

/**
 * Check the ETH balance on Arbitrum for a given address.
 *
 * Returns the balance in ETH as a fixed-6 decimal string (e.g. "0.001234"),
 * `'0'` when the address is empty or the response is malformed, or `'unknown'`
 * when the RPC call itself fails.
 */
export async function checkArbEthBalance(address: string): Promise<string> {
	if (!address) return '0';
	try {
		const res = await fetch(ARB_RPC, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_getBalance',
				params: [address, 'latest'],
				id: 1
			})
		});
		const data = await res.json();
		if (!isValidHex(data.result)) return '0';
		const wei = BigInt(data.result);
		return (Number(wei) / 1e18).toFixed(6);
	} catch (e) {
		d.warn('ARB ETH balance check failed: %s', e instanceof Error ? e.message : String(e));
		return 'unknown';
	}
}
