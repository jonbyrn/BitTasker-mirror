/**
 * Legacy Escrow (v1 chain) — fresh chain read + `computeV1PermittedActions` (awaitingTx: false).
 */

import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import { deriveV1EffectiveContractStatus } from '$lib/utils/contract/v1/effectiveContractState';
import { computeV1PermittedActions } from '$lib/utils/contract/v1/permittedActions';
import { buildDisputeProjectionForPayment } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import type { PermittedActions } from '$lib/utils/contract/v2/permittedActions';
import type { ContractLifecycleResult } from './types';
import type { PaymentContractRuneLike } from './types';
import type { RuneWriteIds } from './writeHelpers';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v1:preflight');

/**
 * @returns `undefined` if OK; otherwise early-return **`ContractLifecycleResult`** for the caller.
 */
export async function runV1Preflight(
	rune: PaymentContractRuneLike,
	ids: RuneWriteIds,
	opts: {
		isAllowed: (p: PermittedActions) => boolean;
		logLabel: string;
	}
): Promise<ContractLifecycleResult | undefined> {
	try {
		const payment = await loadPaymentContractDetails(ids.paymentId, ids.contractAddress, 'rsk');
		const effectiveState = deriveV1EffectiveContractStatus(
			payment.state,
			rune.statusEventsByNewest
		);
		const paymentForPerms = { ...payment, state: effectiveState };
		const disputeProjection = buildDisputeProjectionForPayment(
			{
				taskerPubkey: rune.taskerPubkey,
				taskeePubkey: rune.contract.taskeePubkey,
				statusEventsByNewest: rune.statusEventsByNewest
			},
			payment.state
		);
		const perms = computeV1PermittedActions({
			payment: paymentForPerms,
			isTasker: rune.isTasker,
			now: permissionsNowSeconds(),
			awaitingTx: false,
			disputeProjection
		});
		if (!opts.isAllowed(perms)) {
			d.warn(`${opts.logLabel}: preflight denied (fresh chain + permissions)`);
			return { ok: false };
		}
	} catch (e) {
		d.error(`${opts.logLabel}: preflight failed`, e);
		return { ok: false };
	}
	return undefined;
}
