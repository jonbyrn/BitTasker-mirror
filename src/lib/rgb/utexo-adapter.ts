import {
	assessFullAllocation,
	PARTIAL_SEND_DETAIL,
	settleNeedsPartialSend,
	type RgbAllocation,
	type RgbCreditAdapter,
	type SettleLeg,
	type TransferDraft
} from './adapter';
import type { CreditNetwork } from '$lib/credit/types';

interface ListedUnspent {
	rgbAllocations?: { assignment?: { amount?: number } }[];
	utxo?: { outpoint?: { txid?: string; vout?: number } };
}

export interface UtexoCreditWallet {
	listUnspents?: () => Promise<ListedUnspent[]>;
}

/**
 * Read-only view of an already-open RGB wallet.
 * It never calls onchainSend. Partial amounts are refused before a send exists.
 */
export function createUtexoCreditAdapter(input: {
	network: Extract<CreditNetwork, 'signet' | 'regtest'>;
	assetId: string;
	wallet: UtexoCreditWallet | null;
	confirmationsOf?: (txid: string) => Promise<number>;
}): RgbCreditAdapter {
	async function allocations(): Promise<RgbAllocation[]> {
		if (!input.wallet?.listUnspents) return [];
		const rows = await input.wallet.listUnspents();
		const listed: RgbAllocation[] = [];
		for (const row of rows) {
			const amount = row.rgbAllocations?.[0]?.assignment?.amount;
			const txid = row.utxo?.outpoint?.txid;
			const vout = row.utxo?.outpoint?.vout;
			if (!Number.isSafeInteger(amount) || amount <= 0 || !txid || vout == null) continue;
			listed.push({
				id: `${txid}:${vout}`,
				assetId: input.assetId,
				owner: 'wallet',
				units: amount
			});
		}
		return listed;
	}

	return {
		network: input.network,
		kind: 'utexo',
		listAllocations: allocations,
		async buildFullAllocationTransfer(transfer): Promise<TransferDraft> {
			const rows = await allocations();
			const verdict = assessFullAllocation(rows, transfer.allocationId, transfer.units);
			if (!verdict.ok) throw new Error(verdict.reason);
			return { ...transfer, fullAllocation: true };
		},
		validateTransfer(draft) {
			if (draft.fullAllocation !== true) return { ok: false, reason: PARTIAL_SEND_DETAIL };
			return { ok: true };
		},
		async broadcast(): Promise<{ txid: string }> {
			throw new Error(
				'Live USDT sends stay off in this beta. A partial send can lose the change, and this screen does not broadcast one.'
			);
		},
		async confirmations(txid: string): Promise<number> {
			if (!input.confirmationsOf) return 0;
			const count = await input.confirmationsOf(txid);
			return Number.isSafeInteger(count) && count > 0 ? count : 0;
		},
		async settle(request: { assetId: string; escrowUnits: number; legs: SettleLeg[] }) {
			if (settleNeedsPartialSend(request.escrowUnits, request.legs)) {
				return {
					ok: false as const,
					reason: 'partial-send-blocked' as const,
					detail: PARTIAL_SEND_DETAIL
				};
			}
			return {
				ok: false as const,
				reason: 'partial-send-blocked' as const,
				detail:
					'Live escrow release is not broadcast from BitTasker Credit yet. The test ledger settles this split.'
			};
		}
	};
}

/** Confirmed signet transactions count as 1. Anything else stays at 0, including a failed lookup. */
export async function signetConfirmations(
	txid: string,
	fetchImpl: typeof fetch = fetch
): Promise<number> {
	if (!/^[0-9a-f]{64}$/i.test(txid)) return 0;
	try {
		const response = await fetchImpl(`https://esplora-api.utexo.com/tx/${txid}`);
		if (!response.ok) return 0;
		const body = (await response.json()) as { status?: { confirmed?: boolean } };
		return body.status?.confirmed === true ? 1 : 0;
	} catch {
		return 0;
	}
}
