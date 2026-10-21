import type { ContractRune, ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import {
	disputeEscrow,
	fundFromWallet,
	openWalletContract,
	releaseEscrow
} from '$lib/escrow/wallet-escrow';
import { releaseUnits } from './hours';
import { staffContractId } from './ids';
import type { PayAsset, StaffSeat } from './types';

export function openStaffContract(input: {
	jobId: string;
	workerPubkey: string;
	title: string;
	amountUsd: number;
	amountSats?: number;
	asset: PayAsset;
	partyPubkeys: string[];
}): ContractRune {
	return openWalletContract({
		contractId: staffContractId(input.jobId, input.workerPubkey),
		title: input.title,
		amountUsd: input.amountUsd,
		amountSats: input.asset === 'btc' ? input.amountSats : undefined,
		asset: input.asset,
		partyPubkeys: input.partyPubkeys
	});
}

export function contractForSeat(seat: StaffSeat, title: string, amountUsd: number): ContractRune {
	const rune = openStaffContract({
		jobId: seat.jobId,
		workerPubkey: seat.workerPubkey,
		title,
		amountUsd,
		amountSats: seat.escrowSats,
		asset: seat.asset === 'btc' ? 'btc' : 'usdt',
		partyPubkeys: [seat.businessPubkey, seat.workerPubkey]
	});
	if (
		rune.status === 'draft' &&
		(seat.contractStatus === 'funded' || seat.contractStatus === 'disputed')
	) {
		rune.status = seat.contractStatus === 'disputed' ? 'disputed' : 'funded';
	}
	return rune;
}

/** Fund the existing non-custodial contract. Check-in stays closed until status is funded. */
export async function fundStaffContract(rune: ContractRune): Promise<ContractRuneSnapshot> {
	return fundFromWallet(rune, { title: rune.contractTitle });
}

/** Dispute only reaches the contract when that contract is funded. */
export async function disputeStaffContract(rune: ContractRune, reason: string): Promise<void> {
	await disputeEscrow(rune, reason);
}

/** Release the approved amount through the contract. A dispute blocks this. No fee is added. */
export async function releaseStaffContract(
	rune: ContractRune,
	invoice: string,
	seat: Pick<StaffSeat, 'asset' | 'releaseUsd' | 'escrowUsd' | 'escrowSats'>,
	acceptStuckChange = false
): Promise<ContractRuneSnapshot> {
	if (seat.asset === 'btc' && seat.releaseUsd + 0.001 < seat.escrowUsd) {
		throw new Error('btc-partial');
	}
	const units = releaseUnits({
		asset: seat.asset === 'btc' ? 'btc' : 'usdt',
		releaseUsd: seat.releaseUsd,
		escrowUsd: seat.escrowUsd || seat.releaseUsd,
		escrowSats: seat.escrowSats
	});
	return releaseEscrow(rune, invoice, units, 'Approved shift hours', acceptStuckChange);
}
