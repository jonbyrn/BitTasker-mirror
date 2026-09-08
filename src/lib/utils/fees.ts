/**
 * Native platform fee tiers — basis points (percentage / 10000 = fractional rate).
 *
 * Replaces the legacy `@bittasker/wallet-core` `FEE_TIERS` export, which pulled
 * Node's `randomBytes` into the browser bundle. Tier 1 = 2.5% client fee.
 */
export interface FeeTier {
	percentage: number;
}

export const FEE_TIERS: Record<number, FeeTier> = {
	0: { percentage: 200 }, // 2.0%
	1: { percentage: 250 }, // 2.5%
	2: { percentage: 300 } // 3.0%
};
