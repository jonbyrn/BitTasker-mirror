/**
 * Built-In Wallet Tier 2 Token Balance Checker
 *
 * Fetches USDT/USDC balances on BSC and Ethereum for the built-in BitTasker
 * wallet using free public RPC endpoints. The user's RSK address is valid on
 * all EVM chains (same private key), so we can check balances cross-chain.
 *
 * Unlike the MetaMask connector which uses the MultiChain SDK's invokeMethod,
 * this uses direct ethers JsonRpcProvider calls.
 */
import { ethers } from 'ethers';
import { VERIFIED_TOKENS, CHAIN_LABELS } from '$lib/data/verified-tokens';
import { ARB_PUBLIC_RPC } from '$lib/config/defi.constants';

const balanceOfSelector = '0x70a08231';

/**
 * RPC endpoints for built-in wallet cross-chain checks.
 * Only includes chains with free public endpoints (no API key required).
 */
const FREE_RPC_ENDPOINTS: Record<number, string> = {
	56: 'https://bsc-dataseed.binance.org',
	42161: ARB_PUBLIC_RPC
};

/**
 * Max time (ms) to wait for a single cross-chain balance check.
 * Keep it tight so slow chains don't block the wallet UI.
 */
const PER_CALL_TIMEOUT = 4000;

/**
 * Chain ID → cached ethers provider (lazily created).
 * Reused across calls to avoid re-connecting on each poll.
 */
const providerCache = new Map<number, ethers.JsonRpcProvider>();

function getProvider(chainId: number): ethers.JsonRpcProvider | null {
	const endpoint = FREE_RPC_ENDPOINTS[chainId];
	if (!endpoint) return null;

	let provider = providerCache.get(chainId);
	if (!provider) {
		provider = new ethers.JsonRpcProvider(endpoint);
		providerCache.set(chainId, provider);
	}
	return provider;
}

export interface Tier2BalanceEntry {
	raw: string;
	formatted: string;
	loading: boolean;
}

/**
 * Fetches USDT/USDC balances across BSC, Polygon, and Arbitrum for the given
 * address. Uses free public RPCs with per-call timeouts.
 *
 * @param address — the wallet's EVM address (same on all EVM chains)
 * @returns map of balance key → balance entry (matches fetchBalances format)
 */
export async function fetchBuiltinWalletTier2Balances(
	address: string
): Promise<Record<string, Tier2BalanceEntry>> {
	const result: Record<string, Tier2BalanceEntry> = {};
	const paddedAddress = address.startsWith('0x') ? address.slice(2).padStart(64, '0') : address;
	const callData = balanceOfSelector + paddedAddress;

	const tasks: Promise<void>[] = [];

	for (const [chainIdStr, tokens] of Object.entries(VERIFIED_TOKENS)) {
		const chainId = Number(chainIdStr);

		// Only check chains with free RPC endpoints
		if (!FREE_RPC_ENDPOINTS[chainId]) continue;

		for (const token of tokens) {
			const balanceKey = `${chainId}-${token.symbol}`;

			tasks.push(
				(async () => {
					try {
						const provider = getProvider(chainId);
						if (!provider) return;

						const rawHex = await Promise.race([
							provider.call({
								to: token.address,
								data: callData
							}),
							new Promise<never>((_, reject) =>
								setTimeout(() => reject(new Error('timeout')), PER_CALL_TIMEOUT)
							)
						]);

						const raw = BigInt(rawHex || '0x0');
						if (raw > 0n) {
							const human = Number(raw) / Math.pow(10, token.decimals);
							const chainLabel = CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
							result[balanceKey] = {
								raw: raw.toString(),
								formatted: `${human.toFixed(2)} ${token.symbol} (${chainLabel})`,
								loading: false
							};
						}
					} catch (_e) {
						// Silently skip — chain may be unreachable or rate-limited
					}
				})()
			);
		}
	}

	await Promise.allSettled(tasks);
	return result;
}
