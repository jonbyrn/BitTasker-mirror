import { describe, expect, it } from 'vitest';
import type { Event } from 'nostr-tools';
import {
	customerOrderMessage,
	isBitTaskerServiceEvent,
	parseClassifiedEvent,
	parseProductEvent,
	parseStallEvent,
	productContent,
	stallContent
} from '$lib/market/nip15';
import { listingFromDraft, quotePurchase, stockLeft, buildFundedOrder } from '$lib/market/rules';
import type { GoodsListing } from '$lib/market/types';

const seller = 'a'.repeat(64);
const buyer = 'b'.repeat(64);
const other = 'c'.repeat(64);

function event(partial: Partial<Event> & Pick<Event, 'kind' | 'content' | 'tags'>): Event {
	return {
		id: 'evt',
		pubkey: seller,
		created_at: 50,
		sig: '',
		...partial
	};
}

function item(overrides: Partial<GoodsListing> = {}): GoodsListing {
	return listingFromDraft(
		{
			title: 'Mug',
			description: 'Clay mug',
			category: 'home',
			condition: 'new',
			priceUsd: 10,
			location: 'Madrid',
			latitude: null,
			longitude: null,
			fulfillment: 'shipping',
			photos: [],
			...overrides
		},
		seller,
		'goods-mug',
		10
	);
}

describe('NIP-15 and NIP-99 goods', () => {
	it('publishes a stall and product a marketplace client can read', () => {
		const withOption = listingFromDraft(
			{
				title: 'Mug',
				description: 'Clay mug',
				category: 'home',
				condition: 'new',
				priceUsd: 10,
				location: 'Madrid',
				latitude: null,
				longitude: null,
				fulfillment: 'shipping',
				photos: [],
				quantity: 5,
				variants: [{ name: 'Blue', priceUsd: 12 }],
				extraShippingUsd: 2
			},
			seller,
			'goods-mug',
			10
		);
		const stall = parseStallEvent(
			event({
				kind: 30017,
				content: stallContent({
					id: 'stall',
					sellerPubkey: seller,
					name: 'Shop',
					description: 'Mugs',
					shipping: [
						{ id: 'ship', name: 'Spain', costUsd: 5, regions: ['ES'], service: 'standard' }
					],
					createdAt: 10
				}),
				tags: [['d', 'stall']]
			})
		);
		expect(stall?.shipping[0]).toMatchObject({ id: 'ship', costUsd: 5, regions: ['ES'] });
		const product = parseProductEvent(
			event({
				kind: 30018,
				content: productContent(withOption, undefined, stall?.shipping ?? []),
				tags: [
					['d', withOption.id],
					['title', withOption.title],
					['t', 'home']
				]
			})
		);
		expect(product?.source).toBe('nip15');
		expect(product?.priceUsd).toBe(10);
		expect(product?.stallId).toBe('stall');
		expect(product?.shippingExtra).toEqual([{ id: 'ship', costUsd: 2 }]);
		const quoted = quotePurchase({
			listing: withOption,
			orders: [],
			zones: stall?.shipping ?? [],
			variantId: 'blue',
			quantity: 3,
			shippingId: 'ship'
		});
		expect(quoted.unitUsd).toBe(12);
		expect(quoted.shippingUsd).toBe(11);
		expect(quoted.goodsUsd).toBe(36);
		expect(quoted.totalUsd).toBe(47);
	});

	it('reads a foreign classified and skips a BitTasker service', () => {
		const service = event({
			kind: 30402,
			content: JSON.stringify({
				title: 'Web development',
				pricing: { type: 'fixed' },
				uniqueId: 'svc'
			}),
			tags: [
				['d', 'svc'],
				['title', 'Web development'],
				['price', '40', 'USD'],
				['Y', 'fixed']
			]
		});
		expect(isBitTaskerServiceEvent(service)).toBe(true);
		expect(parseClassifiedEvent(service)).toBeNull();
		const classified = parseClassifiedEvent(
			event({
				kind: 30402,
				content: 'Red bike, rides well.',
				tags: [
					['d', 'bike-1'],
					['title', 'Red bike'],
					['summary', 'City bike'],
					['price', '40', 'USD'],
					['location', 'Madrid'],
					['status', 'active'],
					['t', 'sports'],
					['stock', '2'],
					['image', 'https://cdn.example/bike.jpg']
				]
			})
		);
		expect(classified?.source).toBe('nip99');
		expect(classified?.category).toBe('sports');
		expect(classified?.priceUsd).toBe(40);
		expect(classified?.quantity).toBe(2);
		expect(classified?.photos).toEqual(['https://cdn.example/bike.jpg']);
	});

	it('keeps one item in stock and lets a second buyer take another copy', () => {
		const single = item();
		expect(single.quantity).toBe(1);
		const first = buildFundedOrder({
			listing: single,
			orders: [],
			buyerPubkey: buyer,
			asset: 'usdt',
			btcUsd: 0,
			now: 20
		});
		expect(stockLeft(single, [first])).toBe(0);
		expect(() =>
			buildFundedOrder({
				listing: single,
				orders: [first],
				buyerPubkey: other,
				asset: 'usdt',
				btcUsd: 0,
				now: 21
			})
		).toThrow('closed');
		const many = { ...single, quantity: 3 };
		expect(stockLeft(many, [first])).toBe(2);
		const second = buildFundedOrder({
			listing: many,
			orders: [first],
			buyerPubkey: other,
			asset: 'usdt',
			btcUsd: 0,
			now: 22
		});
		expect(second.quantity).toBe(1);
		expect(second.buyerPubkey).toBe(other);
	});

	it('sends an order message without a phone or email field', () => {
		const body = customerOrderMessage(
			{
				productId: 'goods-mug',
				quantity: 1,
				shippingId: 'ship',
				address: 'Calle 1',
				message: 'Order for Mug. The money is in BitTasker escrow.'
			},
			'order-1',
			buyer
		);
		const parsed = JSON.parse(body) as {
			type: number;
			items: { quantity: number }[];
			shipping_id: string;
		};
		expect(parsed.type).toBe(0);
		expect(parsed.items[0].quantity).toBe(1);
		expect(parsed.shipping_id).toBe('ship');
		expect(body.includes('phone')).toBe(false);
		expect(body.includes('email')).toBe(false);
		expect(body.includes('Calle 1')).toBe(true);
	});
});
