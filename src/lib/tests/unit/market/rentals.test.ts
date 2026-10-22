import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/market/escrow', () => ({
	openGoodsContract: vi.fn((input: { amountUsd: number; listingId: string }) => ({
		contractId: input.listingId,
		totalAmountUsd: input.amountUsd
	})),
	fundGoodsContract: vi.fn(async () => ({ status: 'funded' })),
	releaseGoodsContract: vi.fn(async () => ({ status: 'refunded' }))
}));

import { categoryLabel, rentPriceHint } from '$lib/market/categories';
import { marketCopy } from '$lib/market/copy';
import { listingBody, parseListingEvent } from '$lib/market/events';
import { fundGoodsContract, openGoodsContract, releaseGoodsContract } from '$lib/market/escrow';
import { payRentalDeposit, refundRentalDeposit, rentalDepositFunding } from '$lib/market/rent';
import {
	buildFundedOrder,
	buildRentalDepositOrder,
	listingFromDraft,
	matchesGoods
} from '$lib/market/rules';
import {
	blankGoodsForm,
	RENTAL_CATEGORIES,
	type GoodsFilters,
	type GoodsListing
} from '$lib/market/types';

const seller = 'a'.repeat(64);
const renter = 'b'.repeat(64);
const filters: GoodsFilters = {
	query: '',
	category: '',
	offer: '',
	condition: '',
	fulfillment: '',
	maxPrice: 0,
	location: '',
	near: null,
	maxKm: 0
};

function rentDraft(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Pickup for the weekend',
		description: 'Available in San Salvador',
		category: 'rent-vehicles',
		condition: 'good',
		priceUsd: 50,
		location: 'San Salvador',
		latitude: null,
		longitude: null,
		fulfillment: 'pickup',
		photos: [],
		offer: 'rent',
		rentPeriod: 'day',
		depositUsd: 0,
		...overrides
	};
}

describe('rentals', () => {
	it('keeps the homepage on four tiles and renames Buy & Sell', () => {
		const page = readFileSync(resolve('src/routes/(company)/+page.svelte'), 'utf8');
		const en = JSON.parse(readFileSync(resolve('static/locales/en/home.json'), 'utf8'));
		const es = JSON.parse(readFileSync(resolve('static/locales/es/home.json'), 'utf8'));
		expect(page).toContain('homepage.v2.hero.cards.goods_title');
		expect(page).toContain("font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif");
		expect(page.match(/testId: 'hero-browse-/g)).toHaveLength(4);
		expect(en.homepage.v2.hero.cards.goods_title).toBe('Buy & Sell');
		expect(en.homepage.v2.hero.cards.goods_subtitle).toBe('Shop or rent locally');
		expect(es.homepage.v2.hero.cards.goods_title).toBe('Compra y venta');
		expect(en.navbar.buy_sell).toBe(en.homepage.v2.hero.cards.goods_title);
		expect(es.navbar.buy_sell).toBe(es.homepage.v2.hero.cards.goods_title);
		expect(es.homepage.v2.hero.cards.goods_subtitle).toBe('Compra o alquila cerca');
		expect(en.homepage.v2.hero.description).toContain('buy and sell');
		expect(en.navbar.buy_sell).toBe('Buy & Sell');
	});

	it('labels the eight rental categories in English and Spanish and filters them', () => {
		expect(RENTAL_CATEGORIES).toHaveLength(8);
		const expected: Record<string, [string, string]> = {
			'rent-vehicles': [
				'Vehicles (cars, motorcycles, pickups)',
				'Vehículos (autos, motos, pickups)'
			],
			'rent-tools': ['Tools & equipment', 'Herramientas y equipo'],
			'rent-generators': ['Generators & power', 'Generadores y energía'],
			'rent-sound': ['Sound & events', 'Sonido y eventos'],
			'rent-party': ['Party gear', 'Artículos para fiestas'],
			'rent-cameras': ['Cameras & electronics', 'Cámaras y electrónica'],
			'rent-machinery': ['Construction machinery', 'Maquinaria de construcción'],
			'rent-boats': ['Boats & surf', 'Botes y surf']
		};
		for (const category of RENTAL_CATEGORIES) {
			expect(categoryLabel(category, 'en')).toBe(expected[category][0]);
			expect(categoryLabel(category, 'es')).toBe(expected[category][1]);
			const item = listingFromDraft(
				rentDraft({ category, title: `${category} rental` }),
				seller,
				category,
				10
			);
			expect(matchesGoods(item, { ...filters, category, offer: 'rent' })).toBe(true);
			expect(matchesGoods(item, { ...filters, offer: 'sell' })).toBe(false);
			expect(matchesGoods(item, { ...filters, category: 'furniture' })).toBe(false);
		}
	});

	it('uses example El Salvador rates only as placeholders', () => {
		expect(rentPriceHint('rent-vehicles', 'en')).toEqual({
			placeholder: '50',
			period: 'day',
			text: 'A pickup in El Salvador is often about $40–60 a day.'
		});
		expect(rentPriceHint('rent-generators', 'es')?.text).toBe(
			'Un generador en El Salvador suele costar unos $25 al día.'
		);
		expect(rentPriceHint('rent-sound', 'en')?.text).toContain('$50–80 per event');
		expect(rentPriceHint('rent-boats', 'es')?.placeholder).toBe('12');
		expect(rentPriceHint('rent-party', 'en')).toBeNull();
		expect(rentPriceHint('rent-tools', 'es')).toBeNull();
		expect(rentPriceHint('rent-cameras', 'en')).toBeNull();
		expect(rentPriceHint('rent-machinery', 'en')).toBeNull();
		const form = blankGoodsForm('rent');
		expect(form.price).toBe('');
		expect(form.deposit).toBe('');
		expect(form.offer).toBe('rent');
	});

	it('stores a rental rate and an optional deposit that can exceed one period', () => {
		const plain = listingFromDraft(rentDraft(), seller, 'rent-1', 20);
		expect(plain.offer).toBe('rent');
		expect(plain.rentPeriod).toBe('day');
		expect(plain.depositUsd).toBe(0);
		expect(plain.reserve).toBe('pay');
		const held = listingFromDraft(
			rentDraft({ category: 'rent-boats', priceUsd: 12, depositUsd: 80, rentPeriod: 'day' }),
			seller,
			'rent-board',
			20
		);
		expect(held.priceUsd).toBe(12);
		expect(held.depositUsd).toBe(80);
		const parsed = parseListingEvent({
			kind: 31160,
			pubkey: seller,
			created_at: 30,
			content: listingBody(held),
			tags: [['d', held.id]],
			id: '1',
			sig: ''
		});
		expect(parsed?.offer).toBe('rent');
		expect(parsed?.depositUsd).toBe(80);
		expect(parsed?.rentPeriod).toBe('day');
		expect(() => listingFromDraft(rentDraft({ rentPeriod: 'event' }), seller, 'bad', 20)).toThrow(
			'period'
		);
		expect(() => listingFromDraft(rentDraft({ category: 'furniture' }), seller, 'bad', 20)).toThrow(
			'fields'
		);
	});

	it('shows the peer-to-peer disclaimer in English and Spanish', () => {
		expect(marketCopy('en').rentDisclaimer).toBe(
			'The renter and the owner agree terms and conditions between themselves. BitTasker only holds the escrow deposit.'
		);
		expect(marketCopy('es').rentDisclaimer).toBe(
			'Quien alquila y el dueño acuerdan los términos y condiciones entre ellos. BitTasker solo retiene el depósito en garantía.'
		);
	});

	it('funds and refunds the deposit through the existing escrow API', async () => {
		const listing = listingFromDraft(
			rentDraft({ priceUsd: 55, depositUsd: 100 }),
			seller,
			'rent-truck',
			20
		);
		await expect(
			payRentalDeposit(
				{
					listing: { ...listing, depositUsd: 0 },
					orders: [],
					buyerPubkey: renter,
					asset: 'usdt',
					btcUsd: 0,
					now: 30
				},
				'en'
			)
		).rejects.toThrow('deposit');
		expect(fundGoodsContract).not.toHaveBeenCalled();

		const order = await payRentalDeposit(
			{
				listing,
				orders: [],
				buyerPubkey: renter,
				asset: 'usdt',
				btcUsd: 60_000,
				now: 40
			},
			'es'
		);
		expect(order.holdUsd).toBe(100);
		expect(order.priceUsd).toBe(55);
		expect(openGoodsContract).toHaveBeenCalledWith(
			expect.objectContaining({ amountUsd: 100, listingId: 'rent-truck' })
		);
		expect(fundGoodsContract).toHaveBeenCalledWith(
			expect.objectContaining({ totalAmountUsd: 100 }),
			expect.objectContaining({ title: listing.title, language: 'es', collectBy: 0 })
		);
		const plan = rentalDepositFunding(order, listing.title);
		expect(plan.contract.amountUsd).toBe(order.holdUsd);
		expect(plan.contract.amountUsd).not.toBe(listing.priceUsd);
		expect(() =>
			buildFundedOrder({
				listing,
				orders: [],
				buyerPubkey: renter,
				asset: 'usdt',
				btcUsd: 0,
				now: 40
			})
		).toThrow('rent');
		expect(() =>
			buildRentalDepositOrder({
				listing,
				orders: [],
				buyerPubkey: seller,
				asset: 'usdt',
				btcUsd: 0,
				now: 40
			})
		).toThrow('own-item');

		const refunded = await refundRentalDeposit(
			{ contractId: order.contractId } as never,
			order,
			'invoice',
			'usdt'
		);
		expect(releaseGoodsContract).toHaveBeenCalledWith(
			expect.anything(),
			'invoice',
			'usdt',
			100,
			order.amountSats,
			false
		);
		expect(refunded.status).toBe('refunded');
	});

	it('leaves an older sale listing as a sale', () => {
		const sale = {
			id: 'goods-1',
			sellerPubkey: seller,
			title: 'Oak desk',
			description: 'Solid wood',
			category: 'furniture',
			condition: 'good',
			priceUsd: 120,
			location: 'Austin, TX',
			latitude: null,
			longitude: null,
			fulfillment: 'pickup',
			photos: [],
			status: 'active',
			createdAt: 1,
			reserve: 'pay',
			depositUsd: 0,
			collectBy: 0,
			noShowPercent: 0,
			stallId: 'stall',
			quantity: 1,
			variants: [],
			shippingExtra: [],
			priceSats: 0,
			source: 'bittasker'
		} as GoodsListing;
		const parsed = parseListingEvent({
			kind: 31160,
			pubkey: seller,
			created_at: 1,
			content: JSON.stringify({ v: 1, listing: { ...sale, offer: undefined } }),
			tags: [['d', sale.id]],
			id: '1',
			sig: ''
		});
		expect(parsed?.offer).toBe('sell');
		expect(parsed?.rentPeriod).toBe('');
		expect(parsed?.depositUsd).toBe(0);
	});
});
