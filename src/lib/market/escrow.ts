import { ContractRune, type ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import { state } from '$lib/stores/wallet/wallet-state';
import type { PaymentSplitConfig } from '$lib/types/rgb-contract';
import { goodsContractId } from './ids';
import type { GoodsOrder, PayAsset } from './types';

const RELEASED = new Set(['released', 'releasing', 'settled']);

export function goodsSplit(asset: PayAsset): PaymentSplitConfig {
	if (asset === 'btc') {
		return {
			primaryAsset: 'btc_lightning',
			primaryPercentage: 100,
			secondaryAsset: 'usdt_rgb',
			secondaryPercentage: 0
		};
	}
	return {
		primaryAsset: 'usdt_rgb',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};
}

export function openGoodsContract(input: {
	listingId: string;
	buyerPubkey: string;
	title: string;
	amountUsd: number;
	amountSats: number;
	asset: PayAsset;
	partyPubkeys: string[];
}): ContractRune {
	const contractId = goodsContractId(input.listingId, input.buyerPubkey);
	const existing = ContractRune.get(contractId);
	if (existing) return existing;
	return new ContractRune({
		contractId,
		contractTitle: input.title,
		totalAmountUsd: input.amountUsd,
		amountSats: input.asset === 'btc' ? input.amountSats : undefined,
		lockedAmount: input.amountUsd,
		lockedCurrency: 'USD',
		split: goodsSplit(input.asset),
		partyPubkeys: input.partyPubkeys
	});
}

export function contractForOrder(order: GoodsOrder, title: string): ContractRune {
	const rune = openGoodsContract({
		listingId: order.listingId,
		buyerPubkey: order.buyerPubkey,
		title,
		amountUsd: order.priceUsd,
		amountSats: order.amountSats,
		asset: order.asset,
		partyPubkeys: [order.buyerPubkey, order.sellerPubkey]
	});
	if (
		rune.status === 'draft' &&
		(order.contractStatus === 'funded' || order.contractStatus === 'disputed')
	) {
		rune.status = order.contractStatus === 'disputed' ? 'disputed' : 'funded';
	}
	return rune;
}

function asError(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	if (/wallet is not initialized|rgb wallet/i.test(message)) return new Error('wallet-closed');
	return error instanceof Error ? error : new Error(message);
}

/** Fund the existing non-custodial contract. The order is saved only after status is funded. */
export async function fundGoodsContract(rune: ContractRune): Promise<ContractRuneSnapshot> {
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
export async function disputeGoodsContract(rune: ContractRune, reason: string): Promise<void> {
	if (rune.status !== 'funded') throw new Error('fund-first');
	await rune.dispute(reason);
}

/** Release to the seller invoice. A dispute blocks this. */
export async function releaseGoodsContract(
	rune: ContractRune,
	invoice: string,
	asset: PayAsset,
	priceUsd: number,
	amountSats: number
): Promise<ContractRuneSnapshot> {
	if (rune.status === 'disputed') throw new Error('disputed');
	const payout = invoice.trim();
	if (!payout) throw new Error('invoice');
	const units =
		asset === 'btc' ? Math.max(1, amountSats) : Math.max(1, Math.round(priceUsd * 1_000_000));
	try {
		if (rune.status === 'funded') await rune.startWork();
		if (rune.status === 'work_in_progress') await rune.submitWork('Item handed over');
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
