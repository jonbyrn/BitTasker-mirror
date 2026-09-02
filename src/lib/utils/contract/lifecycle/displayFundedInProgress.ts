import type { PaymentContractRuneLike } from './types';
import { permissionsNowSeconds } from './time';
import {
	ContractStatus,
	DisplayOnlyStatus,
	type ContractDisplayStatus
} from '$lib/utils/contract/types';

function normalizeEstimatedStartToSeconds(raw: number): number {
	if (!Number.isFinite(raw)) return NaN;
	return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw;
}

/**
 * Card UX: when the effective display is still {@link ContractStatus.Funded} but the scheduled
 * start (Kind 30006 `estimatedStartTime`, else on-chain snapshot) has passed, show
 * {@link DisplayOnlyStatus.InProgress}.
 */
export function applyFundedStartedInProgressDisplay(
	base: ContractDisplayStatus,
	rune: PaymentContractRuneLike
): ContractDisplayStatus {
	if (base !== ContractStatus.Funded) return base;
	const raw = rune.effectiveEstimatedStartTime;
	if (raw === undefined) return base;
	const startSec = normalizeEstimatedStartToSeconds(Number(raw));
	if (!Number.isFinite(startSec)) return base;
	const now = permissionsNowSeconds();
	if (now >= startSec) return DisplayOnlyStatus.InProgress;
	return base;
}
