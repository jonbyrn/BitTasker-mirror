import type { ContractRune, ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import {
	disputeEscrow,
	fundFromWallet,
	openWalletContract,
	releaseEscrow
} from '$lib/escrow/wallet-escrow';
import { staffContractId } from './ids';
import type { StaffSeat } from './types';

export function openStaffContract(input: {
	jobId: string;
	workerPubkey: string;
	title: string;
	amountUsd: number;
	partyPubkeys: string[];
}): ContractRune {
	return openWalletContract({
		contractId: staffContractId(input.jobId, input.workerPubkey),
		title: input.title,
		amountUsd: input.amountUsd,
		asset: 'usdt',
		partyPubkeys: input.partyPubkeys
	});
}

export function contractForSeat(seat: StaffSeat, title: string, amountUsd: number): ContractRune {
	const rune = openStaffContract({
		jobId: seat.jobId,
		workerPubkey: seat.workerPubkey,
		title,
		amountUsd,
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

/** Release the approved amount through the contract. A dispute blocks this. */
export async function releaseStaffContract(
	rune: ContractRune,
	invoice: string,
	releaseUsd: number
): Promise<ContractRuneSnapshot> {
	const units = Math.max(1, Math.round(releaseUsd * 1_000_000));
	return releaseEscrow(rune, invoice, units, 'Approved shift hours');
}
