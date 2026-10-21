import { distanceKm } from './distance';
import { goodsContractId, goodsOrderId } from './ids';
import { handoverWindowPassed, usdToSats } from './money';
import { pubkeyHex, samePerson } from '$lib/staffing/ids';
import { isGoodsCategory, isGoodsCondition, isGoodsFulfillment } from './categories';
import type { GoodsFilters, GoodsListing, GoodsOrder, ListingDraft, PayAsset } from './types';

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
	if (!isGoodsCategory(draft.category) || !isGoodsCondition(draft.condition)) {
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
	return {
		id,
		sellerPubkey: seller,
		title,
		description,
		category: draft.category,
		condition: draft.condition,
		priceUsd,
		location,
		latitude: coordinate(draft.latitude, -90, 90),
		longitude: coordinate(draft.longitude, -180, 180),
		fulfillment,
		photos: cleanPhotos(draft.photos),
		status: 'active',
		createdAt,
		...reserveTerms(draft, fulfillment, priceUsd, createdAt)
	};
}

function reserveTerms(
	draft: ListingDraft,
	fulfillment: string,
	priceUsd: number,
	createdAt: number
): Pick<GoodsListing, 'reserve' | 'depositUsd' | 'collectBy' | 'noShowPercent'> {
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

export function canBuy(
	listing: GoodsListing,
	orders: readonly GoodsOrder[],
	buyerPubkey: string
): boolean {
	const buyer = pubkeyHex(buyerPubkey);
	if (!buyer || listing.status !== 'active') return false;
	if (samePerson(listing.sellerPubkey, buyer)) return false;
	return !lockedOrder(orders, listing.id);
}

export function buildFundedOrder(input: {
	listing: GoodsListing;
	orders: readonly GoodsOrder[];
	buyerPubkey: string;
	asset: PayAsset;
	btcUsd: number;
	now: number;
	codeHash?: string;
}): GoodsOrder {
	const buyer = pubkeyHex(input.buyerPubkey);
	if (!buyer) throw new MarketRuleError('login');
	if (samePerson(input.listing.sellerPubkey, buyer)) throw new MarketRuleError('own-item');
	if (!canBuy(input.listing, input.orders, buyer)) throw new MarketRuleError('closed');
	const collect = input.listing.reserve === 'collect';
	const holdUsd = collect ? input.listing.depositUsd : input.listing.priceUsd;
	const codeHash = (input.codeHash ?? '').trim().toLowerCase();
	if (collect && codeHash.length !== 64) throw new MarketRuleError('code');
	const amountSats = input.asset === 'btc' ? usdToSats(holdUsd, input.btcUsd) : 0;
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
		reserve: collect ? 'collect' : 'pay',
		holdUsd,
		collectBy: collect ? input.listing.collectBy : 0,
		noShowPercent: collect ? input.listing.noShowPercent : 0,
		codeHash: collect ? codeHash : '',
		collectedAt: 0,
		sellerPaid: false,
		buyerPaid: false
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
