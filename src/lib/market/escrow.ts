import type { ContractRune, ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import {
	disputeEscrow,
	fundFromWallet,
	openWalletContract,
	releaseEscrow,
	type HoldLabel
} from '$lib/escrow/wallet-escrow';
import { goodsContractId } from './ids';
import type { GoodsOrder, PayAsset } from './types';

export function openGoodsContract(input: {
	listingId: string;
	buyerPubkey: string;
	title: string;
	amountUsd: number;
	amountSats: number;
	asset: PayAsset;
	partyPubkeys: string[];
}): ContractRune {
	return openWalletContract({
		contractId: goodsContractId(input.listingId, input.buyerPubkey),
		title: input.title,
		amountUsd: input.amountUsd,
		amountSats: input.amountSats,
		asset: input.asset,
		partyPubkeys: input.partyPubkeys
	});
}

export function contractForOrder(order: GoodsOrder, title: string): ContractRune {
	const rune = openGoodsContract({
		listingId: order.listingId,
		buyerPubkey: order.buyerPubkey,
		title,
		amountUsd: order.holdUsd > 0 ? order.holdUsd : order.priceUsd,
		amountSats: order.amountSats,
		asset: order.asset,
		partyPubkeys: [order.buyerPubkey, order.sellerPubkey]
	});
	if (rune.status === 'draft' && order.contractStatus === 'disputed') rune.status = 'disputed';
	else if (rune.status === 'draft' && order.contractStatus === 'funded') rune.status = 'funded';
	else if (
		rune.status === 'draft' &&
		(order.contractStatus === 'released' || order.contractStatus === 'refunded')
	) {
		rune.status = 'released';
	}
	return rune;
}

/** Fund the existing non-custodial contract. The order is saved only after status is funded. */
export async function fundGoodsContract(
	rune: ContractRune,
	hold?: HoldLabel
): Promise<ContractRuneSnapshot> {
	return fundFromWallet(rune, { title: rune.contractTitle, ...hold });
}

/** Dispute only reaches the contract when that contract is funded. */
export async function disputeGoodsContract(rune: ContractRune, reason: string): Promise<void> {
	await disputeEscrow(rune, reason);
}

/** Release to one invoice. A dispute blocks this. */
export async function releaseGoodsContract(
	rune: ContractRune,
	invoice: string,
	asset: PayAsset,
	priceUsd: number,
	amountSats: number,
	acceptStuckChange = false
): Promise<ContractRuneSnapshot> {
	const units =
		asset === 'btc' ? Math.max(1, amountSats) : Math.max(1, Math.round(priceUsd * 1_000_000));
	return releaseEscrow(rune, invoice, units, 'Item handed over', acceptStuckChange);
}
