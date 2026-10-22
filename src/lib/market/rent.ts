import type { ContractRune } from '$lib/runes/contract.svelte';
import { fundGoodsContract, openGoodsContract, releaseGoodsContract } from '$lib/market/escrow';
import { buildRentalDepositOrder, MarketRuleError } from '$lib/market/rules';
import type { GoodsOrder, PayAsset } from '$lib/market/types';

type DepositOrderInput = Parameters<typeof buildRentalDepositOrder>[0];

/** Arguments for the existing goods escrow API. The amount is the deposit, not the rate. */
export function rentalDepositFunding(order: GoodsOrder, title: string) {
	if (!(order.holdUsd > 0)) throw new MarketRuleError('deposit');
	return {
		contract: {
			listingId: order.listingId,
			buyerPubkey: order.buyerPubkey,
			title,
			amountUsd: order.holdUsd,
			amountSats: order.amountSats,
			asset: order.asset,
			partyPubkeys: [order.buyerPubkey, order.sellerPubkey]
		},
		hold: { title, collectBy: 0 }
	};
}

/** Fund the refundable deposit by calling the existing goods escrow API. */
export async function payRentalDeposit(
	input: DepositOrderInput,
	language: string
): Promise<GoodsOrder> {
	const order = buildRentalDepositOrder(input);
	const plan = rentalDepositFunding(order, input.listing.title);
	const rune = openGoodsContract(plan.contract);
	await fundGoodsContract(rune, {
		title: plan.hold.title,
		collectBy: plan.hold.collectBy,
		language
	});
	return order;
}

/** Return a funded deposit through the existing release API. */
export async function refundRentalDeposit(
	rune: ContractRune,
	order: GoodsOrder,
	invoice: string,
	asset: PayAsset,
	acceptStuckChange = false
): Promise<GoodsOrder> {
	if (order.holdUsd <= 0) throw new MarketRuleError('deposit');
	await releaseGoodsContract(
		rune,
		invoice,
		asset,
		order.holdUsd,
		order.amountSats,
		acceptStuckChange
	);
	return { ...order, status: 'refunded', contractStatus: 'refunded' };
}
