import { describe, expect, it } from 'vitest';
import { listingBody, parseListingEvent } from '$lib/market/events';
import { goodsContractId } from '$lib/market/ids';
import { HANDOVER_TIMEOUT_SECONDS, handoverWindowPassed, usdToSats } from '$lib/market/money';
import {
	buildFundedOrder,
	canDispute,
	disputeOrder,
	listingFromDraft,
	markSold,
	matchesGoods,
	removeListing
} from '$lib/market/rules';
import type { GoodsFilters, GoodsListing, GoodsOrder } from '$lib/market/types';

const seller = 'a'.repeat(64);
const buyer = 'b'.repeat(64);
const filters: GoodsFilters = {
	query: '',
	category: '',
	condition: '',
	fulfillment: '',
	maxPrice: 0,
	location: '',
	near: null,
	maxKm: 0
};

function listing(overrides: Partial<GoodsListing> = {}): GoodsListing {
	return {
		id: 'goods-1',
		sellerPubkey: seller,
		title: 'Oak desk',
		description: 'Solid wood, a few scratches',
		category: 'furniture',
		condition: 'good',
		priceUsd: 120,
		location: 'Austin, TX',
		latitude: 30.27,
		longitude: -97.74,
		fulfillment: 'pickup',
		photos: ['https://example.com/desk.jpg'],
		status: 'active',
		createdAt: 1,
		...overrides
	};
}

describe('goods marketplace', () => {
	it('converts USD to sats and keeps kind 30402 out of the contract id', () => {
		expect(usdToSats(120, 60_000)).toBe(200_000);
		expect(usdToSats(120, 0)).toBe(0);
		const id = goodsContractId('goods-1', buyer);
		expect(id.startsWith('goods-')).toBe(true);
		expect(id).not.toMatch(/^contract-[0-9a-f]{64}-[0-9a-f]{64}$/i);
	});

	it('filters by text, price, condition, and distance', () => {
		const item = listing();
		expect(matchesGoods(item, { ...filters, query: 'scratches' })).toBe(true);
		expect(matchesGoods(item, { ...filters, maxPrice: 50 })).toBe(false);
		expect(matchesGoods(item, { ...filters, condition: 'new' })).toBe(false);
		expect(
			matchesGoods(item, {
				...filters,
				maxKm: 5,
				near: { latitude: 30.27, longitude: -97.74 }
			})
		).toBe(true);
		expect(
			matchesGoods(item, {
				...filters,
				maxKm: 5,
				near: { latitude: 40, longitude: -74 }
			})
		).toBe(false);
		expect(matchesGoods(listing({ status: 'sold' }), filters)).toBe(false);
	});

	it('rejects a seller buying their own item and a second sale while escrow is open', () => {
		const item = listing();
		expect(() =>
			buildFundedOrder({
				listing: item,
				orders: [],
				buyerPubkey: seller,
				asset: 'usdt',
				btcUsd: 0,
				now: 10
			})
		).toThrow('own-item');
		const order = buildFundedOrder({
			listing: item,
			orders: [],
			buyerPubkey: buyer,
			asset: 'btc',
			btcUsd: 60_000,
			now: 10
		});
		expect(order.amountSats).toBe(200_000);
		expect(order.status).toBe('funded');
		expect(() => markSold(item, [order], seller)).toThrow('locked');
		expect(removeListing(item, [], seller).status).toBe('deleted');
	});

	it('lets the buyer dispute immediately and the seller only after the handover window', () => {
		const order = {
			status: 'funded',
			buyerPubkey: buyer,
			sellerPubkey: seller,
			fundedAt: 1_000,
			disputeNote: ''
		} as GoodsOrder;
		expect(canDispute(order, buyer, 1_000)).toBe(true);
		expect(canDispute(order, seller, 1_000 + HANDOVER_TIMEOUT_SECONDS - 1)).toBe(false);
		expect(handoverWindowPassed(1_000, 1_000 + HANDOVER_TIMEOUT_SECONDS)).toBe(true);
		expect(canDispute(order, seller, 1_000 + HANDOVER_TIMEOUT_SECONDS)).toBe(true);
		expect(disputeOrder(order, buyer, 'Never arrived', 2_000).status).toBe('disputed');
	});

	it('round-trips a listing and treats digital goods as online delivery', () => {
		const digital = listingFromDraft(
			{
				title: 'Photo pack',
				description: 'Ten edited photos',
				category: 'digital',
				condition: 'new',
				priceUsd: 15,
				location: '',
				latitude: null,
				longitude: null,
				fulfillment: 'pickup',
				photos: ['http://insecure.example/a.jpg', 'https://cdn.example/a.jpg']
			},
			seller,
			'goods-2',
			20
		);
		expect(digital.fulfillment).toBe('digital');
		expect(digital.location).toBe('Online');
		expect(digital.photos).toEqual(['https://cdn.example/a.jpg']);
		const parsed = parseListingEvent({
			kind: 31160,
			pubkey: seller,
			created_at: 30,
			content: listingBody(digital),
			tags: [['d', digital.id]],
			id: '1',
			sig: ''
		});
		expect(parsed?.title).toBe('Photo pack');
		expect(parsed?.sellerPubkey).toBe(seller);
	});
});
