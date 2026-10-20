/**
 * Native platform fee tiers — basis points (percentage / 10000 = fractional rate).
 *
 * Replaces the legacy `@bittasker/wallet-core` `FEE_TIERS` export, which pulled
 * Node's `randomBytes` into the browser bundle. The same tiers apply to USDT,
 * Bitcoin, and Lightning: tier 1 = 2.5%, tier 2 = 2.0%, tier 3 = 1.5% per side.
 */
export interface FeeTier {
	percentage: number;
}

export const FEE_TIERS: Record<number, FeeTier> = {
	1: { percentage: 250 }, // 2.5%
	2: { percentage: 200 }, // 2.0%
	3: { percentage: 150 } // 1.5%
};
