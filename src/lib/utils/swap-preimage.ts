/**
 * Swap preimage/hash generation utility for Boltz and HTLC swaps.
 *
 * Extracted from swap-chain.service.ts to eliminate 4x duplication of the
 * same crypto.getRandomValues + SHA-256 pattern.
 */

/**
 * Convert a Uint8Array to a lowercase hex string (without 0x prefix).
 */
function bufferToHex(buf: Uint8Array): string {
	return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random preimage and its SHA-256 hash for Boltz/HTLC swaps.
 * Returns both as hex strings (without 0x prefix) for direct use in Boltz API calls.
 *
 * The preimage is 32 bytes of cryptographically secure random data.
 * The hash is the SHA-256 digest of the preimage — used as the lock key in
 * on-chain HTLC contracts (EtherSwap.lock, ERC20Swap, etc.).
 */
export async function generateSwapPreimage(): Promise<{
	preimageHex: string;
	hashHex: string;
}> {
	const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
	const preimageHex = bufferToHex(preimageBytes);
	const hashBytes = await crypto.subtle.digest('SHA-256', preimageBytes);
	const hashHex = bufferToHex(new Uint8Array(hashBytes));
	return { preimageHex, hashHex };
}
