/**
 * Mirrors EscrowContract `calculateBaseAmount` / `getPlatformFeePercentage` (Solidity).
 */

function platformFeeBps(tier: number): bigint {
	if (tier === 1) return 250n;
	if (tier === 2) return 200n;
	if (tier === 3) return 150n;
	throw new Error(`Invalid client fee tier: ${tier}`);
}

/** Base escrow amount (excluding client fee), in wei — matches on-chain `calculateBaseAmount`. */
export function calculateV1BaseAmountWei(totalAmountWei: bigint, clientFeeTier: number): bigint {
	const bps = platformFeeBps(clientFeeTier);
	const totalParts = 10000n + bps;
	return (totalAmountWei * 10000n) / totalParts;
}
