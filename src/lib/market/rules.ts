import { distanceKm } from './distance';
import { goodsContractId, goodsOrderId } from './ids';
import { handoverWindowPassed, usdToSats } from './money';
import { defaultZones } from './nip15';
import { pubkeyHex, samePerson } from '$lib/staffing/ids';
import {
	isGoodsCategory,
	isGoodsCondition,
	isGoodsFulfillment,
	isRentalCategory,
	isRentPeriod
} from './categories';
import type {
	GoodsFilters,
	GoodsListing,
	GoodsOrder,
	GoodsVariant,
	ListingDraft,
	ListingOffer,
	PayAsset,
	RentPeriod,
	SellerStall,
	ShippingExtra,
	ShippingService,
	ShippingZone
} from './types';
import { SHIPPING_SERVICES, STALL_ID } from './types';

export class MarketRuleError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const PHOTO = /^https:\/\/\S+$/i;
const LOCKED = new Set(['funded', 'handed_over', 'disputed']);

export function foldMarket(value: string): string {
	return String(value || '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim();
}

export function cleanPhotos(values: readonly string[]): string[] {
	const photos: string[] = [];
	for (const value of values) {
		const photo = value.trim();
		if (!PHOTO.test(photo) || photos.includes(photo)) continue;
		photos.push(photo);
		if (photos.length === 4) break;
	}
	return photos;
}

function coordinate(value: number | null, min: number, max: number): number | null {
	if (value == null || !Number.isFinite(value) || value < min || value > max) return null;
	return value;
}

export function listingFromDraft(
	draft: ListingDraft,
	sellerPubkey: string,
	id: string,
	createdAt: number
): GoodsListing {
	const seller = pubkeyHex(sellerPubkey);
	if (!seller) throw new MarketRuleError('login');
	const title = draft.title.trim().slice(0, 120);
	const description = draft.description.trim().slice(0, 4000);
	if (title.length < 3 || !description) throw new MarketRuleError('fields');
	const rent = draft.offer === 'rent';
	if (rent) {
		if (!isRentalCategory(draft.category) || !isGoodsCondition(draft.condition)) {
			throw new MarketRuleError('fields');
		}
		if (!isRentPeriod(draft.rentPeriod ?? '')) throw new MarketRuleError('period');
	} else if (!isGoodsCategory(draft.category) || !isGoodsCondition(draft.condition)) {
		throw new MarketRuleError('fields');
	}
	const digital = draft.category === 'digital';
	const fulfillment = digital ? 'digital' : draft.fulfillment;
	if (!isGoodsFulfillment(fulfillment) || (!digital && fulfillment === 'digital')) {
		throw new MarketRuleError('fields');
	}
	const priceUsd = Math.round(draft.priceUsd * 100) / 100;
	if (!(priceUsd > 0) || priceUsd > 1_000_000) throw new MarketRuleError('price');
	const location = (digital ? draft.location.trim() || 'Online' : draft.location.trim()).slice(
		0,
		200
	);
	if (!location) throw new MarketRuleError('fields');
	const category = draft.category;
	if (!isGoodsCategory(category) && !isRentalCategory(category))
		throw new MarketRuleError('fields');
	return {
		id,
		sellerPubkey: seller,
		title,
		description,
		category,
		condition: draft.condition,
		priceUsd,
		location,
		latitude: coordinate(draft.latitude, -90, 90),
		longitude: coordinate(draft.longitude, -180, 180),
		fulfillment,
		photos: cleanPhotos(draft.photos),
		status: 'active',
		createdAt,
		...listingOffer(draft),
		...reserveTerms(draft, fulfillment, priceUsd, createdAt),
		stallId: (draft.stallId || STALL_ID).trim().slice(0, 80) || STALL_ID,
		quantity: cleanQuantity(draft.quantity, fulfillment),
		variants: cleanDraftVariants(draft.variants),
		shippingExtra: cleanDraftExtra(draft.extraShippingUsd),
		priceSats: 0,
		source: 'bittasker'
	};
}

function cleanQuantity(value: number | null | undefined, fulfillment: string): number | null {
	if (value == null) return fulfillment === 'digital' ? null : 1;
	const quantity = Math.floor(value);
	if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100_000) {
		throw new MarketRuleError('quantity');
	}
	return quantity;
}

function variantId(name: string, index: number): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 24);
	return slug || `option-${index + 1}`;
}

function cleanDraftVariants(rows: ListingDraft['variants']): GoodsVariant[] {
	const variants: GoodsVariant[] = [];
	for (const row of rows ?? []) {
		const name = row.name.trim().slice(0, 60);
		const priceUsd = Math.round(row.priceUsd * 100) / 100;
		if (!name && !(priceUsd > 0)) continue;
		if (!name || !(priceUsd > 0) || priceUsd > 1_000_000) throw new MarketRuleError('option');
		const id = variantId(name, variants.length);
		if (variants.some((variant) => variant.id === id)) continue;
		variants.push({ id, name, priceUsd, specs: [['option', name]] });
		if (variants.length === 12) break;
	}
	return variants;
}

function cleanDraftExtra(value: number | undefined): ShippingExtra[] {
	if (value == null || value === 0) return [];
	const costUsd = Math.round(value * 100) / 100;
	if (!(costUsd > 0) || costUsd > 100_000) throw new MarketRuleError('shipping');
	return [{ id: '*', costUsd }];
}

const ZONE_SERVICES = new Set<string>(SHIPPING_SERVICES);

export function stallFromDraft(
	draft: { name: string; description: string; shipping: ShippingZone[] },
	sellerPubkey: string,
	createdAt: number
): SellerStall {
	const seller = pubkeyHex(sellerPubkey);
	if (!seller) throw new MarketRuleError('login');
	const name = draft.name.trim().slice(0, 80);
	if (name.length < 2) throw new MarketRuleError('fields');
	const shipping = draft.shipping.slice(0, 8).map((zone, index) => {
		const zoneName = zone.name.trim().slice(0, 60);
		if (!zoneName) throw new MarketRuleError('shipping');
		const costUsd = Math.round(zone.costUsd * 100) / 100;
		if (costUsd < 0 || costUsd > 100_000) throw new MarketRuleError('shipping');
		const regions = zone.regions
			.map((region) => region.trim())
			.filter(Boolean)
			.slice(0, 12);
		if (regions.length === 0) throw new MarketRuleError('shipping');
		const service = ZONE_SERVICES.has(zone.service) ? zone.service : 'standard';
		const id = zone.id.trim().slice(0, 40) || variantId(zoneName, index);
		return { id, name: zoneName, costUsd, regions, service: service as ShippingService };
	});
	if (shipping.length === 0) throw new MarketRuleError('shipping');
	return {
		id: STALL_ID,
		sellerPubkey: seller,
		name,
		description: draft.description.trim().slice(0, 500),
		shipping,
		createdAt
	};
}

function listingOffer(draft: ListingDraft): { offer: ListingOffer; rentPeriod: RentPeriod | '' } {
	if (draft.offer !== 'rent') return { offer: 'sell', rentPeriod: '' };
	const period = draft.rentPeriod ?? '';
	if (!isRentPeriod(period)) throw new MarketRuleError('period');
	return { offer: 'rent', rentPeriod: period };
}

function reserveTerms(
	draft: ListingDraft,
	fulfillment: string,
	priceUsd: number,
	createdAt: number
): Pick<GoodsListing, 'reserve' | 'depositUsd' | 'collectBy' | 'noShowPercent'> {
	if (draft.offer === 'rent') {
		const depositUsd = Math.round((draft.depositUsd ?? 0) * 100) / 100;
		if (!Number.isFinite(depositUsd) || depositUsd < 0 || depositUsd > 1_000_000) {
			throw new MarketRuleError('deposit');
		}
		return { reserve: 'pay', depositUsd, collectBy: 0, noShowPercent: 0 };
	}
	const inPerson = fulfillment === 'pickup' || fulfillment === 'both';
	if (draft.reserve !== 'collect' || !inPerson) {
		return { reserve: 'pay', depositUsd: 0, collectBy: 0, noShowPercent: 0 };
	}
	const depositUsd = Math.round((draft.depositUsd ?? 0) * 100) / 100;
	if (!(depositUsd > 0) || depositUsd > priceUsd) throw new MarketRuleError('deposit');
	const collectBy = Math.floor(draft.collectBy ?? 0);
	if (!(collectBy > createdAt)) throw new MarketRuleError('date');
	const noShowPercent = Math.floor(draft.noShowPercent ?? 0);
	if (noShowPercent < 0 || noShowPercent > 100) throw new MarketRuleError('deposit');
	return { reserve: 'collect', depositUsd, collectBy, noShowPercent };
}

export function matchesGoods(listing: GoodsListing, filters: GoodsFilters): boolean {
	if (listing.status !== 'active') return false;
	if (filters.offer === 'rent' && listing.offer !== 'rent') return false;
	if (filters.offer === 'sell' && listing.offer === 'rent') return false;
	if (filters.category && listing.category !== filters.category) return false;
	if (filters.condition && listing.condition !== filters.condition) return false;
	if (
		filters.fulfillment &&
		listing.fulfillment !== filters.fulfillment &&
		listing.fulfillment !== 'both'
	) {
		return false;
	}
	if (filters.maxPrice > 0 && listing.priceUsd > filters.maxPrice) return false;
	if (filters.location && !foldMarket(listing.location).includes(foldMarket(filters.location))) {
		return false;
	}
	if (filters.maxKm > 0) {
		if (
			!filters.near ||
			listing.latitude == null ||
			listing.longitude == null ||
			distanceKm(filters.near, { latitude: listing.latitude, longitude: listing.longitude }) >
				filters.maxKm
		) {
			return false;
		}
	}
	const query = foldMarket(filters.query);
	if (!query) return true;
	const haystack = foldMarket(`${listing.title} ${listing.description} ${listing.location}`);
	return haystack.includes(query);
}

export function ordersForListing(orders: readonly GoodsOrder[], listingId: string): GoodsOrder[] {
	return orders.filter((order) => order.listingId === listingId);
}

export function lockedOrder(
	orders: readonly GoodsOrder[],
	listingId: string
): GoodsOrder | undefined {
	return ordersForListing(orders, listingId).find((order) => LOCKED.has(order.status));
}

const COUNTED = new Set(['funded', 'handed_over', 'disputed', 'released']);

export function stockLeft(listing: GoodsListing, orders: readonly GoodsOrder[]): number | null {
	if (listing.quantity == null) return null;
	const used = orders
		.filter((order) => order.listingId === listing.id && COUNTED.has(order.status))
		.reduce((sum, order) => sum + Math.max(1, order.quantity || 1), 0);
	return Math.max(0, listing.quantity - used);
}

export function canBuy(
	listing: GoodsListing,
	orders: readonly GoodsOrder[],
	buyerPubkey: string
): boolean {
	const buyer = pubkeyHex(buyerPubkey);
	if (!buyer || listing.status !== 'active') return false;
	if (samePerson(listing.sellerPubkey, buyer)) return false;
	if (
		orders.some(
			(order) =>
				order.listingId === listing.id &&
				LOCKED.has(order.status) &&
				samePerson(order.buyerPubkey, buyer)
		)
	) {
		return false;
	}
	return stockLeft(listing, orders) !== 0;
}

export function quotePurchase(input: {
	listing: GoodsListing;
	orders: readonly GoodsOrder[];
	zones: readonly ShippingZone[];
	variantId: string;
	quantity: number;
	shippingId: string;
}): {
	unitUsd: number;
	quantity: number;
	shippingUsd: number;
	goodsUsd: number;
	totalUsd: number;
	holdUsd: number;
	collect: boolean;
	shippingId: string;
	variantId: string;
	priceSats: number;
} {
	const variant = input.listing.variants.find((item) => item.id === input.variantId);
	if (input.listing.variants.length > 0 && !variant) throw new MarketRuleError('option');
	const quantity = Math.floor(input.quantity);
	if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100)
		throw new MarketRuleError('quantity');
	const left = stockLeft(input.listing, input.orders);
	if (left !== null && quantity > left) throw new MarketRuleError('quantity');
	const zones = input.zones.length > 0 ? input.zones : defaultZones(input.listing.fulfillment);
	const zone = zones.find((item) => item.id === input.shippingId) ?? zones[0];
	if (!zone) throw new MarketRuleError('shipping');
	const needsShip =
		input.listing.fulfillment === 'shipping' || input.listing.fulfillment === 'both';
	if (needsShip && input.shippingId && !zones.some((item) => item.id === input.shippingId)) {
		throw new MarketRuleError('shipping');
	}
	const unitUsd = variant?.priceUsd || input.listing.priceUsd || 0;
	const extra =
		input.listing.shippingExtra.find((item) => item.id === zone.id) ??
		input.listing.shippingExtra.find((item) => item.id === '*');
	const extraEach = extra?.costUsd ?? 0;
	const shippingUsd = Math.round((zone.costUsd + extraEach * quantity) * 100) / 100;
	const goodsUsd = Math.round(unitUsd * quantity * 100) / 100;
	const totalUsd = Math.round((goodsUsd + shippingUsd) * 100) / 100;
	const pickup = zone.service === 'pickup' || zone.service === 'digital';
	const collect = input.listing.reserve === 'collect' && pickup;
	const holdUsd = collect ? Math.round(input.listing.depositUsd * quantity * 100) / 100 : totalUsd;
	const priceSats = variant ? 0 : input.listing.priceSats;
	if (!(holdUsd > 0) && !(priceSats > 0)) throw new MarketRuleError('price');
	return {
		unitUsd,
		quantity,
		shippingUsd,
		goodsUsd: goodsUsd > 0 ? goodsUsd : input.listing.priceUsd,
		totalUsd,
		holdUsd,
		collect,
		shippingId: zone.id,
		variantId: variant?.id ?? '',
		priceSats
	};
}

export function buildFundedOrder(input: {
	listing: GoodsListing;
	orders: readonly GoodsOrder[];
	buyerPubkey: string;
	asset: PayAsset;
	btcUsd: number;
	now: number;
	codeHash?: string;
	zones?: readonly ShippingZone[];
	variantId?: string;
	quantity?: number;
	shippingId?: string;
}): GoodsOrder {
	if (input.listing.offer === 'rent') throw new MarketRuleError('rent');
	const buyer = pubkeyHex(input.buyerPubkey);
	if (!buyer) throw new MarketRuleError('login');
	if (samePerson(input.listing.sellerPubkey, buyer)) throw new MarketRuleError('own-item');
	if (!canBuy(input.listing, input.orders, buyer)) throw new MarketRuleError('closed');
	const quoted = quotePurchase({
		listing: input.listing,
		orders: input.orders,
		zones: input.zones ?? [],
		variantId: input.variantId ?? '',
		quantity: input.quantity ?? 1,
		shippingId: input.shippingId ?? ''
	});
	const collect = quoted.collect;
	const codeHash = (input.codeHash ?? '').trim().toLowerCase();
	if (collect && codeHash.length !== 64) throw new MarketRuleError('code');
	const amountSats =
		input.asset === 'btc'
			? quoted.priceSats > 0 && quoted.unitUsd <= 0
				? quoted.priceSats * quoted.quantity + usdToSats(quoted.shippingUsd, input.btcUsd)
				: usdToSats(quoted.holdUsd, input.btcUsd)
			: 0;
	if (input.asset === 'btc' && amountSats <= 0) throw new MarketRuleError('price');
	if (input.asset === 'usdt' && !(quoted.holdUsd > 0)) throw new MarketRuleError('price');
	return {
		id: goodsOrderId(input.listing.id, buyer),
		listingId: input.listing.id,
		buyerPubkey: buyer,
		sellerPubkey: input.listing.sellerPubkey,
		asset: input.asset,
		priceUsd: quoted.goodsUsd > 0 ? quoted.goodsUsd : input.listing.priceUsd,
		amountSats,
		status: 'funded',
		fundedAt: input.now,
		handedAt: 0,
		payoutInvoice: '',
		disputeNote: '',
		sellerRating: 0,
		buyerRating: 0,
		sellerNote: '',
		buyerNote: '',
		contractId: goodsContractId(input.listing.id, buyer),
		contractStatus: 'funded',
		createdAt: input.now,
		reserve: collect ? 'collect' : 'pay',
		holdUsd: quoted.holdUsd,
		collectBy: collect ? input.listing.collectBy : 0,
		noShowPercent: collect ? input.listing.noShowPercent : 0,
		codeHash: collect ? codeHash : '',
		collectedAt: 0,
		sellerPaid: false,
		buyerPaid: false,
		quantity: quoted.quantity,
		variantId: quoted.variantId,
		shippingId: quoted.shippingId,
		shippingUsd: quoted.shippingUsd,
		unitUsd: quoted.unitUsd
	};
}

/** Hold only the refundable deposit. The rental rate stays between the two people. */
export function buildRentalDepositOrder(input: {
	listing: GoodsListing;
	orders: readonly GoodsOrder[];
	buyerPubkey: string;
	asset: PayAsset;
	btcUsd: number;
	now: number;
}): GoodsOrder {
	if (input.listing.offer !== 'rent') throw new MarketRuleError('rent');
	const depositUsd = Math.round(input.listing.depositUsd * 100) / 100;
	if (!(depositUsd > 0)) throw new MarketRuleError('deposit');
	const buyer = pubkeyHex(input.buyerPubkey);
	if (!buyer) throw new MarketRuleError('login');
	if (samePerson(input.listing.sellerPubkey, buyer)) throw new MarketRuleError('own-item');
	if (!canBuy(input.listing, input.orders, buyer)) throw new MarketRuleError('closed');
	const amountSats = input.asset === 'btc' ? usdToSats(depositUsd, input.btcUsd) : 0;
	if (input.asset === 'btc' && amountSats <= 0) throw new MarketRuleError('price');
	return {
		id: goodsOrderId(input.listing.id, buyer),
		listingId: input.listing.id,
		buyerPubkey: buyer,
		sellerPubkey: input.listing.sellerPubkey,
		asset: input.asset,
		priceUsd: input.listing.priceUsd,
		amountSats,
		status: 'funded',
		fundedAt: input.now,
		handedAt: 0,
		payoutInvoice: '',
		disputeNote: '',
		sellerRating: 0,
		buyerRating: 0,
		sellerNote: '',
		buyerNote: '',
		contractId: goodsContractId(input.listing.id, buyer),
		contractStatus: 'funded',
		createdAt: input.now,
		reserve: 'pay',
		holdUsd: depositUsd,
		collectBy: 0,
		noShowPercent: 0,
		codeHash: '',
		collectedAt: 0,
		sellerPaid: false,
		buyerPaid: false,
		quantity: 1,
		variantId: '',
		shippingId: '',
		shippingUsd: 0,
		unitUsd: input.listing.priceUsd
	};
}

export function acceptCollection(
	order: GoodsOrder,
	sellerPubkey: string,
	codeHash: string,
	now: number
): GoodsOrder {
	requireParty(order, sellerPubkey, 'seller');
	if (order.reserve !== 'collect' || order.status !== 'funded') throw new MarketRuleError('closed');
	if (order.collectBy > 0 && now > order.collectBy) throw new MarketRuleError('late');
	const hash = codeHash.trim().toLowerCase();
	if (!hash || hash !== order.codeHash) throw new MarketRuleError('code');
	return { ...order, collectedAt: now };
}

export function uncollectedShares(
	order: GoodsOrder,
	now: number
): { sellerUsd: number; buyerUsd: number } {
	if (order.reserve !== 'collect' || order.status !== 'funded' || order.collectedAt > 0) {
		throw new MarketRuleError('closed');
	}
	if (!(order.collectBy > 0) || now <= order.collectBy) throw new MarketRuleError('early');
	const sellerCents = Math.round(order.holdUsd * order.noShowPercent);
	const sellerUsd = sellerCents / 100;
	const buyerUsd = Math.round(order.holdUsd * 100 - sellerCents) / 100;
	return { sellerUsd, buyerUsd };
}

export function shareUnits(order: GoodsOrder, usd: number): number {
	if (!(usd > 0)) return 0;
	if (order.asset === 'btc') {
		if (!(order.holdUsd > 0)) return 0;
		return Math.max(1, Math.round(order.amountSats * (usd / order.holdUsd)));
	}
	return Math.max(1, Math.round(usd * 1_000_000));
}

export function markSharePaid(order: GoodsOrder, who: 'seller' | 'buyer'): GoodsOrder {
	const sellerPaid = who === 'seller' || order.sellerPaid || order.noShowPercent === 0;
	const buyerPaid = who === 'buyer' || order.buyerPaid || order.noShowPercent === 100;
	const next: GoodsOrder = { ...order, sellerPaid, buyerPaid, contractStatus: 'released' };
	if (sellerPaid && buyerPaid) {
		next.status = order.noShowPercent === 0 ? 'refunded' : 'released';
		next.contractStatus = next.status;
	}
	return next;
}

function requireParty(order: GoodsOrder, pubkey: string, who: 'buyer' | 'seller'): void {
	const person = pubkeyHex(pubkey);
	const expected = who === 'buyer' ? order.buyerPubkey : order.sellerPubkey;
	if (!person || !samePerson(expected, person)) throw new MarketRuleError('login');
}

export function markHandedOver(
	order: GoodsOrder,
	sellerPubkey: string,
	invoice: string,
	now: number
): GoodsOrder {
	requireParty(order, sellerPubkey, 'seller');
	if (order.status !== 'funded') throw new MarketRuleError('closed');
	const payoutInvoice = invoice.trim();
	if (!payoutInvoice) throw new MarketRuleError('invoice');
	return { ...order, status: 'handed_over', handedAt: now, payoutInvoice };
}

export function canConfirm(order: GoodsOrder, buyerPubkey: string): boolean {
	return order.status === 'handed_over' && samePerson(order.buyerPubkey, buyerPubkey);
}

export function canDispute(order: GoodsOrder, pubkey: string, now: number): boolean {
	if (order.status !== 'funded' && order.status !== 'handed_over') return false;
	if (samePerson(order.buyerPubkey, pubkey)) return true;
	return samePerson(order.sellerPubkey, pubkey) && handoverWindowPassed(order.fundedAt, now);
}

export function disputeOrder(
	order: GoodsOrder,
	pubkey: string,
	note: string,
	now: number
): GoodsOrder {
	if (!canDispute(order, pubkey, now)) throw new MarketRuleError('dispute');
	const disputeNote = note.trim().slice(0, 500);
	if (disputeNote.length < 3) throw new MarketRuleError('dispute');
	return { ...order, status: 'disputed', disputeNote, contractStatus: 'disputed' };
}

export function rateOrder(
	order: GoodsOrder,
	pubkey: string,
	stars: number,
	note: string
): GoodsOrder {
	if (order.status !== 'released' && order.status !== 'handed_over' && order.status !== 'refunded')
		throw new MarketRuleError('rating');
	const rating = Math.floor(stars);
	if (rating < 1 || rating > 5) throw new MarketRuleError('rating');
	const text = note.trim().slice(0, 300);
	if (samePerson(order.buyerPubkey, pubkey)) {
		return { ...order, sellerRating: rating, buyerNote: text };
	}
	if (samePerson(order.sellerPubkey, pubkey)) {
		return { ...order, buyerRating: rating, sellerNote: text };
	}
	throw new MarketRuleError('login');
}

export function markSold(
	listing: GoodsListing,
	orders: readonly GoodsOrder[],
	sellerPubkey: string
): GoodsListing {
	if (!samePerson(listing.sellerPubkey, sellerPubkey)) throw new MarketRuleError('login');
	if (listing.status !== 'active') throw new MarketRuleError('closed');
	if (lockedOrder(orders, listing.id)) throw new MarketRuleError('locked');
	return { ...listing, status: 'sold' };
}

export function removeListing(
	listing: GoodsListing,
	orders: readonly GoodsOrder[],
	sellerPubkey: string
): GoodsListing {
	if (!samePerson(listing.sellerPubkey, sellerPubkey)) throw new MarketRuleError('login');
	if (lockedOrder(orders, listing.id)) throw new MarketRuleError('locked');
	return { ...listing, status: 'deleted' };
}

export function replaceListing(
	current: GoodsListing,
	draft: ListingDraft,
	sellerPubkey: string
): GoodsListing {
	if (!samePerson(current.sellerPubkey, sellerPubkey)) throw new MarketRuleError('login');
	if (current.status !== 'active') throw new MarketRuleError('closed');
	const next = listingFromDraft(draft, sellerPubkey, current.id, current.createdAt);
	return { ...next, sellerPubkey: current.sellerPubkey };
}
