import { ContractRune, type ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import { state } from '$lib/stores/wallet/wallet-state';
import type { PaymentSplitConfig } from '$lib/types/rgb-contract';
import { staffContractId } from './ids';
import type { StaffSeat } from './types';

const SPLIT: PaymentSplitConfig = {
	primaryAsset: 'usdt_rgb',
	primaryPercentage: 100,
	secondaryAsset: 'btc_lightning',
	secondaryPercentage: 0
};

const RELEASED = new Set(['released', 'releasing', 'settled']);

export function openStaffContract(input: {
	jobId: string;
	workerPubkey: string;
	title: string;
	amountUsd: number;
	partyPubkeys: string[];
}): ContractRune {
	const contractId = staffContractId(input.jobId, input.workerPubkey);
	const existing = ContractRune.get(contractId);
	if (existing) return existing;
	return new ContractRune({
		contractId,
		contractTitle: input.title,
		totalAmountUsd: input.amountUsd,
		lockedAmount: input.amountUsd,
		lockedCurrency: 'USD',
		split: SPLIT,
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

function asError(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	if (/wallet is not initialized|rgb wallet/i.test(message)) return new Error('wallet-closed');
	return error instanceof Error ? error : new Error(message);
}

/** Fund the existing non-custodial contract. Check-in stays closed until status is funded. */
export async function fundStaffContract(rune: ContractRune): Promise<ContractRuneSnapshot> {
	if (!state.utexoWallet) throw new Error('wallet-closed');
	try {
		if (rune.status === 'draft' || rune.status === 'failed') await rune.prepareFunding();
		if (rune.status === 'funding') await rune.payFundingFromWallet();
		if (rune.status === 'funding' || rune.status === 'locked') await rune.confirmFunding();
	} catch (error) {
		throw asError(error);
	}
	if (rune.status !== 'funded') throw new Error('escrow-pending');
	return rune.snapshot;
}

/** Dispute only reaches the contract when that contract is funded. */
export async function disputeStaffContract(rune: ContractRune, reason: string): Promise<void> {
	if (rune.status !== 'funded') throw new Error('fund-first');
	await rune.dispute(reason);
}

/** Release the approved amount through the contract. A dispute blocks this. */
export async function releaseStaffContract(
	rune: ContractRune,
	invoice: string,
	releaseUsd: number
): Promise<ContractRuneSnapshot> {
	if (rune.status === 'disputed') throw new Error('disputed');
	const payout = invoice.trim();
	if (!payout) throw new Error('fields');
	const units = Math.max(1, Math.round(releaseUsd * 1_000_000));
	try {
		if (rune.status === 'funded') await rune.startWork();
		if (rune.status === 'work_in_progress') await rune.submitWork('Approved shift hours');
		if (rune.status === 'work_submitted') await rune.approveWork();
		if (rune.status === 'approved') await rune.requestSettlement(payout, units);
		if (rune.status === 'approved' || rune.status === 'settlement_requested') {
			await rune.releaseEscrow(payout);
		}
	} catch (error) {
		throw asError(error);
	}
	if (!RELEASED.has(rune.status)) throw new Error(rune.error || 'release-failed');
	return rune.snapshot;
}
