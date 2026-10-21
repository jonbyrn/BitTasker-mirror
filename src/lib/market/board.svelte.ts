import {
	saveListing,
	saveOrder,
	saveStall,
	loadForeignMarket,
	loadGoodsBoard,
	loadGoodsExtras
} from './relay';
import { defaultStall } from './nip15';
import { nowSeconds } from './money';
import { samePerson } from '$lib/staffing/ids';
import type { GoodsListing, GoodsOrder, SellerStall } from './types';
import { STALL_ID } from './types';

export const goodsBoard = $state({
	listings: [] as GoodsListing[],
	orders: [] as GoodsOrder[],
	stalls: [] as SellerStall[],
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

function mergeStalls(current: SellerStall[], incoming: SellerStall[]): SellerStall[] {
	const byKey: Record<string, SellerStall> = {};
	for (const stall of [...current, ...incoming]) {
		const key = `${stall.sellerPubkey}:${stall.id}`;
		const previous = byKey[key];
		if (!previous || stall.createdAt >= previous.createdAt) byKey[key] = stall;
	}
	return Object.values(byKey);
}

function apply(loaded: {
	listings: GoodsListing[];
	orders: GoodsOrder[];
	stalls: SellerStall[];
}): void {
	goodsBoard.listings = mergeById(goodsBoard.listings, loaded.listings);
	goodsBoard.orders = mergeById(goodsBoard.orders, loaded.orders);
	goodsBoard.stalls = mergeStalls(goodsBoard.stalls, loaded.stalls);
}

export function stallForSeller(pubkey: string): SellerStall | undefined {
	const mine = goodsBoard.stalls.filter((stall) => samePerson(stall.sellerPubkey, pubkey));
	return mine.find((stall) => stall.id === STALL_ID) ?? mine[0];
}

export async function refreshGoodsBoard(): Promise<void> {
	try {
		apply(await loadGoodsBoard());
		goodsBoard.error = '';
	} catch {
		goodsBoard.error = 'publish';
	} finally {
		goodsBoard.loaded = true;
	}
	void refreshGoodsExtras();
}

async function refreshGoodsExtras(): Promise<void> {
	try {
		apply(await loadGoodsExtras());
	} catch {
		// Market kinds can be slow. The goods list is already on screen.
	}
	await refreshForeignGoods();
}

export async function refreshForeignGoods(): Promise<void> {
	try {
		apply(await loadForeignMarket());
	} catch {
		// A public market relay can be down. Local listings stay.
	}
}

export async function publishListing(listing: GoodsListing): Promise<GoodsListing> {
	const next = listing.createdAt > 0 ? listing : { ...listing, createdAt: nowSeconds() };
	let stall = stallForSeller(next.sellerPubkey);
	if (!stall && goodsBoard.loaded && !goodsBoard.error) stall = defaultStall(next);
	await saveListing(next, stall ?? null);
	if (stall) goodsBoard.stalls = mergeStalls(goodsBoard.stalls, [stall]);
	goodsBoard.listings = mergeById(goodsBoard.listings, [next]);
	return next;
}

export async function publishStall(stall: SellerStall): Promise<SellerStall> {
	const next = stall.createdAt > 0 ? stall : { ...stall, createdAt: nowSeconds() };
	await saveStall(next);
	goodsBoard.stalls = mergeStalls(goodsBoard.stalls, [next]);
	return next;
}

export async function publishOrder(order: GoodsOrder): Promise<GoodsOrder> {
	const next = { ...order, createdAt: nowSeconds() };
	await saveOrder(next);
	goodsBoard.orders = mergeById(goodsBoard.orders, [next]);
	return next;
}
