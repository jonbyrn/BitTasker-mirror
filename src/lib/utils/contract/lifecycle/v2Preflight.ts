/**
 * SecurePayment v2 — fresh chain read + `computePermittedActions` (awaitingTx: false).
 */

import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import { buildDisputeProjectionForPayment } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import {
	computePermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import type { ContractLifecycleResult } from './types';
import type { PaymentContractRuneLike } from './types';
import type { RuneWriteIds } from './writeHelpers';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v2:preflight');

/**
 * @returns `undefined` if OK; otherwise early-return **`ContractLifecycleResult`** for the caller.
 */
export async function runV2Preflight(
	rune: PaymentContractRuneLike,
	ids: RuneWriteIds,
	opts: {
		isAllowed: (p: PermittedActions) => boolean;
		logLabel: string;
	}
): Promise<ContractLifecycleResult | undefined> {
	try {
		const payment = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
		const disputeProjection = buildDisputeProjectionForPayment(
			{
				taskerPubkey: rune.taskerPubkey,
				taskeePubkey: rune.contract.taskeePubkey,
				statusEventsByNewest: rune.statusEventsByNewest
			},
			payment.state
		);
		const perms = computePermittedActions({
			payment,
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
