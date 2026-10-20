/**
 * Fee rate for RGB and on-chain sends on UTEXO signet, in sat/vB.
 *
 * `send_begin` passes this integer to `FeeRate::from_sat_per_vb` and does not
 * read Esplora. `/fee-estimates` is sat/vB; an empty map makes
 * `get_fee_estimation` fail rather than invent a number.
 *
 * c68e940b paid exactly 100 sat/vB (21,200 sats on 212 vB), which is
 * `from_sat_per_vb(100)`. It is not a conversion of the 2 this app passes:
 * 2 sat/kvB would be 0.002 sat/vB, and 2 sat/vB written as sat/kvB would be
 * 2000. 100 is also what `0.001 BTC/kvB * 1e5` produces, so a sub-1 figure
 * is not scaled. A figure of 1000 or more is sat/kvB and is divided by 1000
 * before the same cap.
 */
export const TEST_NETWORK_FEE_SAT_VB = 2;

/** Highest sat/vB accepted from an estimate on this test network. */
export const SANE_FEE_SAT_VB_MAX = 10;

const SAT_PER_KVB = 1000;

export function resolveSendFeeRate(estimate?: number | null): number {
	if (estimate == null || !Number.isFinite(estimate) || estimate <= 0) {
		return TEST_NETWORK_FEE_SAT_VB;
	}
	const satPerVb = estimate >= SAT_PER_KVB ? estimate / SAT_PER_KVB : estimate;
	const rounded = Math.round(satPerVb);
	if (rounded >= 1 && rounded <= SANE_FEE_SAT_VB_MAX) return rounded;
	return TEST_NETWORK_FEE_SAT_VB;
}

type FeeQuote = { feeRate?: number } | number;

/** Esplora quote when it is a sane sat/vB, otherwise {@link TEST_NETWORK_FEE_SAT_VB}. */
export async function quotedSendFeeRate(
	wallet: { estimateFeeRate?: (blocks: number) => Promise<FeeQuote> } | null | undefined
): Promise<number> {
	const estimate = wallet?.estimateFeeRate;
	if (typeof estimate !== 'function') return TEST_NETWORK_FEE_SAT_VB;
	try {
		const quote = await estimate.call(wallet, 6);
		const raw = typeof quote === 'number' ? quote : quote?.feeRate;
		return resolveSendFeeRate(raw);
	} catch {
		return TEST_NETWORK_FEE_SAT_VB;
	}
}
