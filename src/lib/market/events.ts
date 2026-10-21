import type { Event } from 'nostr-tools';
import { isGoodsCategory, isGoodsCondition, isGoodsFulfillment } from './categories';
import { cleanPhotos } from './rules';
import { pubkeyHex } from '$lib/staffing/ids';
import type {
	GoodsListing,
	GoodsOrder,
	ListingStatus,
	OrderStatus,
	PayAsset,
	ReserveMode
} from './types';
import { LISTING_STATUSES, ORDER_STATUSES } from './types';

const LISTING_STATUS = new Set<string>(LISTING_STATUSES);
const ORDER_STATUS = new Set<string>(ORDER_STATUSES);

function text(value: unknown, max: number): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, max);
}

function numberOr(value: unknown, fallback: number): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function dTag(event: Event): string {
	return event.tags.find((tag) => tag[0] === 'd')?.[1]?.trim() ?? '';
}

function point(value: unknown, min: number, max: number): number | null {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
	return parsed;
}

export function listingBody(listing: GoodsListing): string {
	return JSON.stringify({ v: 1, listing });
}

export function orderBody(order: GoodsOrder): string {
	return JSON.stringify({ v: 1, order });
}

export function parseListingEvent(event: Event): GoodsListing | null {
	const id = dTag(event);
	const seller = pubkeyHex(event.pubkey);
	if (!id || !seller) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || !('listing' in parsed)) return null;
	const listing = (parsed as { listing?: unknown }).listing;
	if (!listing || typeof listing !== 'object') return null;
	const record = listing as Partial<GoodsListing>;
	if (!isGoodsCategory(String(record.category ?? ''))) return null;
	if (!isGoodsCondition(String(record.condition ?? ''))) return null;
	if (!isGoodsFulfillment(String(record.fulfillment ?? ''))) return null;
	const title = text(record.title, 120);
	const description = text(record.description, 4000);
	const location = text(record.location, 200);
	if (!title || !description || !location) return null;
	const status = LISTING_STATUS.has(String(record.status))
		? (record.status as ListingStatus)
		: 'active';
	const photos = Array.isArray(record.photos) ? cleanPhotos(record.photos.map(String)) : [];
	return {
		id,
		sellerPubkey: seller,
		title,
		description,
		category: record.category,
		condition: record.condition,
		priceUsd: Math.round(numberOr(record.priceUsd, 0) * 100) / 100,
		location,
		latitude: point(record.latitude, -90, 90),
		longitude: point(record.longitude, -180, 180),
		fulfillment: record.fulfillment,
		photos,
		status,
		createdAt: numberOr(record.createdAt, event.created_at ?? 0),
		...listingReserve(record)
	};
}

function listingReserve(
	record: Partial<GoodsListing>
): Pick<GoodsListing, 'reserve' | 'depositUsd' | 'collectBy' | 'noShowPercent'> {
	const reserve: ReserveMode = record.reserve === 'collect' ? 'collect' : 'pay';
	if (reserve !== 'collect')
		return { reserve: 'pay', depositUsd: 0, collectBy: 0, noShowPercent: 0 };
	return {
		reserve,
		depositUsd: Math.max(0, Math.round(numberOr(record.depositUsd, 0) * 100) / 100),
		collectBy: Math.max(0, Math.floor(numberOr(record.collectBy, 0))),
		noShowPercent: Math.min(100, Math.max(0, Math.floor(numberOr(record.noShowPercent, 0))))
	};
}

export function parseOrderEvent(event: Event): GoodsOrder | null {
	const id = dTag(event);
	const author = pubkeyHex(event.pubkey);
	if (!id || !author) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || !('order' in parsed)) return null;
	const order = (parsed as { order?: unknown }).order;
	if (!order || typeof order !== 'object') return null;
	const record = order as Partial<GoodsOrder>;
	const buyer = pubkeyHex(String(record.buyerPubkey ?? ''));
	const seller = pubkeyHex(String(record.sellerPubkey ?? ''));
	if (!buyer || !seller) return null;
	if (author !== buyer && author !== seller) return null;
	if (!ORDER_STATUS.has(String(record.status ?? ''))) return null;
	if (record.asset !== 'usdt' && record.asset !== 'btc') return null;
	const listingId = text(record.listingId, 80);
	if (!listingId) return null;
	return {
		id,
		listingId,
		buyerPubkey: buyer,
		sellerPubkey: seller,
		asset: record.asset as PayAsset,
		priceUsd: Math.max(0, numberOr(record.priceUsd, 0)),
		amountSats: Math.max(0, Math.floor(numberOr(record.amountSats, 0))),
		status: record.status as OrderStatus,
		fundedAt: Math.max(0, Math.floor(numberOr(record.fundedAt, 0))),
		handedAt: Math.max(0, Math.floor(numberOr(record.handedAt, 0))),
		payoutInvoice: text(record.payoutInvoice, 2000),
		disputeNote: text(record.disputeNote, 500),
		sellerRating: Math.min(5, Math.max(0, Math.floor(numberOr(record.sellerRating, 0)))),
		buyerRating: Math.min(5, Math.max(0, Math.floor(numberOr(record.buyerRating, 0)))),
		sellerNote: text(record.sellerNote, 300),
		buyerNote: text(record.buyerNote, 300),
		contractId: text(record.contractId, 80),
		contractStatus: text(record.contractStatus, 40),
		createdAt: event.created_at ?? 0,
		reserve: record.reserve === 'collect' ? 'collect' : 'pay',
		holdUsd: Math.max(0, numberOr(record.holdUsd, numberOr(record.priceUsd, 0))),
		collectBy: Math.max(0, Math.floor(numberOr(record.collectBy, 0))),
		noShowPercent: Math.min(100, Math.max(0, Math.floor(numberOr(record.noShowPercent, 0)))),
		codeHash: text(record.codeHash, 64).toLowerCase(),
		collectedAt: Math.max(0, Math.floor(numberOr(record.collectedAt, 0))),
		sellerPaid: record.sellerPaid === true,
		buyerPaid: record.buyerPaid === true
	};
}

export function newerMarketEvent(events: readonly Event[]): Event[] {
	const byId = new Map<string, Event>();
	for (const event of events) {
		const id = dTag(event);
		if (!id) continue;
		const previous = byId.get(id);
		if (!previous || (event.created_at ?? 0) >= (previous.created_at ?? 0)) byId.set(id, event);
	}
	return [...byId.values()];
}
