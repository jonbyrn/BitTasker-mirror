import { pubkeyHex } from '$lib/staffing/ids';

const TASK_CONTRACT = /^contract-[0-9a-f]{64}-[0-9a-f]{64}$/i;

function slug(value: string): string {
	return value
		.trim()
		.replace(/[^a-zA-Z0-9-]/g, '')
		.slice(0, 36);
}

/** Goods contracts must not look like a task contract. */
export function goodsContractId(listingId: string, buyerPubkey: string): string {
	const buyer = pubkeyHex(buyerPubkey).slice(0, 12) || 'buyer';
	const id = `goods-${slug(listingId)}-${buyer}`;
	if (TASK_CONTRACT.test(id)) throw new Error('contract-id');
	return id;
}

export function goodsOrderId(listingId: string, buyerPubkey: string): string {
	const buyer = pubkeyHex(buyerPubkey).slice(0, 12) || 'buyer';
	return `order-${slug(listingId)}-${buyer}`;
}

export function newGoodsId(): string {
	const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
	return `goods-${random}`;
}
