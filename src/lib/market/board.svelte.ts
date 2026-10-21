import { saveListing, saveOrder, loadGoodsBoard } from './relay';
import { nowSeconds } from './money';
import type { GoodsListing, GoodsOrder } from './types';

export const goodsBoard = $state({
	listings: [] as GoodsListing[],
	orders: [] as GoodsOrder[],
	loaded: false,
	error: ''
});

function mergeById<T extends { id: string; createdAt: number }>(current: T[], incoming: T[]): T[] {
	const byId: Record<string, T> = {};
	for (const item of [...current, ...incoming]) {
		const previous = byId[item.id];
		if (!previous || item.createdAt >= previous.createdAt) byId[item.id] = item;
	}
	return Object.values(byId).sort((left, right) => right.createdAt - left.createdAt);
}

export async function refreshGoodsBoard(): Promise<void> {
	try {
		const loaded = await loadGoodsBoard();
		goodsBoard.listings = mergeById(goodsBoard.listings, loaded.listings);
		goodsBoard.orders = mergeById(goodsBoard.orders, loaded.orders);
		goodsBoard.error = '';
	} catch {
		goodsBoard.error = 'publish';
	} finally {
		goodsBoard.loaded = true;
	}
}

export async function publishListing(listing: GoodsListing): Promise<GoodsListing> {
	const next = listing.createdAt > 0 ? listing : { ...listing, createdAt: nowSeconds() };
	await saveListing(next);
	goodsBoard.listings = mergeById(goodsBoard.listings, [next]);
	return next;
}

export async function publishOrder(order: GoodsOrder): Promise<GoodsOrder> {
	const next = { ...order, createdAt: nowSeconds() };
	await saveOrder(next);
	goodsBoard.orders = mergeById(goodsBoard.orders, [next]);
	return next;
}
