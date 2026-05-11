/**
 * Wallet Escrow Module
 *
 * Re-exports escrow utilities for review system and other wallet-related features.
 * Provides getEscrow(escrowId) for loading escrow data by ID without a full contract.
 */

import { escrow as v1Escrow } from '$lib/utils/escrow/v1/escrow';
import type { EscrowData } from '$lib/types/wallet';

/**
 * Load escrow details by escrow ID.
 * Used by review system to verify completion status before publishing reviews.
 */
export async function getEscrow(escrowId: string): Promise<EscrowData | null> {
	try {
		return await v1Escrow.loadEscrowDetails(escrowId);
	} catch (error) {
		console.error('[wallet/escrow] Failed to load escrow:', escrowId, error);
		return null;
	}
}

export const escrow = {
	...v1Escrow,
	getEscrow
};

export { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';
