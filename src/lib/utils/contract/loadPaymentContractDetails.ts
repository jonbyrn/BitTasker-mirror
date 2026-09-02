/**
 * Version-agnostic payment contract details loader.
 *
 * Loaders are auto-discovered at build time via {@code import.meta.glob}.
 * Each {@code ./v{n}/loader.ts} must export a function named
 * {@code onLoadPaymentContract} with signature
 * {@code (paymentId, contractAddress, chain) => Promise<SecurePaymentLegacy>}.
 *
 * Adding a new version (v3, v4, …) only requires creating
 * {@code ./v{n}/loader.ts} — zero changes to this file or to calling code.
 */
import type { BigNumberish } from 'ethers';
import type { ContractChain, SecurePaymentLegacy } from './types';

type LoaderFn = (
	paymentId: BigNumberish,
	contractAddress: string,
	chain: ContractChain
) => Promise<SecurePaymentLegacy>;

// ── Auto-discover version loaders ──────────────────────────────
// Each ./v{n}/loader.ts must export `onLoadPaymentContract: LoaderFn`.
// Newest version is tried first (numeric sort on directory name).

const loaderModules = import.meta.glob<{ onLoadPaymentContract: LoaderFn }>('./v*/loader.ts', {
	eager: true
});

const LOADERS: LoaderFn[] = Object.entries(loaderModules)
	.sort(([a], [b]) => {
		const va = parseInt(a.match(/v(\d+)/)?.[1] ?? '0', 10);
		const vb = parseInt(b.match(/v(\d+)/)?.[1] ?? '0', 10);
		return vb - va; // newest first
	})
	.map(([, mod]) => mod.onLoadPaymentContract);

// ── Per-address cache ───────────────────────────────────────────

const addressVersionCache = new Map<string, number>();

// ── Public API ──────────────────────────────────────────────────

/**
 * Load payment contract details (escrow state, parties, amounts, timestamps, fees)
 * without requiring the caller to know the contract version.
 *
 * Tries each registered loader in order (newest first). On first
 * success the contract address is cached so subsequent calls use one RPC.
 */
export async function loadPaymentContractDetails(
	paymentId: BigNumberish,
	contractAddress: string,
	chain: ContractChain = 'rsk'
): Promise<SecurePaymentLegacy> {
	const cachedIdx = addressVersionCache.get(contractAddress);
	if (cachedIdx !== undefined) {
		return LOADERS[cachedIdx](paymentId, contractAddress, chain);
	}

	const errors: Error[] = [];
	for (let i = 0; i < LOADERS.length; i++) {
		try {
			const result = await LOADERS[i](paymentId, contractAddress, chain);
			addressVersionCache.set(contractAddress, i);
			return result;
		} catch (err) {
			errors.push(err instanceof Error ? err : new Error(String(err)));
		}
	}

	throw new Error(
		`Failed to load payment contract details from ${contractAddress}: ${errors.map((e) => e.message).join('; ')}`
	);
}
