import type { Event } from 'nostr-tools';
import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { LISTING_QUERY_MS, queryRelayEvents } from '$lib/nostr/relayQuery';
import KINDS from '$lib/utils/constants/kinds';
import { publishWithRelayAuth } from '$lib/nostr/relaySession';
import { getSignedEvent } from '$lib/utils/nostr';
import { sanitizeRelayUrls } from '$lib/utils/relayUrls';
import {
	listingBody,
	newerMarketEvent,
	orderBody,
	parseListingEvent,
	parseOrderEvent
} from './events';
import {
	mergeMarketCatalog,
	parseClassifiedEvent,
	parseProductEvent,
	parseShippingEvent,
	parseStallEvent,
	productContent,
	productTags,
	shippingTags,
	stallContent
} from './nip15';
import type { GoodsListing, GoodsOrder, SellerStall } from './types';

/** Public read relay used by Plebeian Market. Writes stay on BitTasker relays. */
const FOREIGN_MARKET_RELAYS = ['wss://relay.plebeian.market'];

export function goodsRelayUrls(): string[] {
	const listing = listingRelayUrls();
	if (listing.length > 0) return listing;
	return sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

function interopRelays(): string[] {
	return [
		...new Set([...goodsRelayUrls(), ...sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL)])
	];
}

async function readKind(kind: number, relays: string[]): Promise<Event[]> {
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	try {
		return await queryRelayEvents(
			relays,
			{ kinds: [kind], limit: 200 },
			{ timeoutMs: LISTING_QUERY_MS }
		);
	} catch {
		return [];
	}
}

function catalogFrom(events: {
	listingEvents: Event[];
	orderEvents: Event[];
	stallEvents: Event[];
	productEvents: Event[];
	classifiedEvents: Event[];
	shippingEvents: Event[];
}): { listings: GoodsListing[]; orders: GoodsOrder[]; stalls: SellerStall[] } {
	const listings = newerMarketEvent(events.listingEvents)
		.map(parseListingEvent)
		.filter((listing): listing is GoodsListing => listing !== null);
	const orders = newerMarketEvent(events.orderEvents)
		.map(parseOrderEvent)
		.filter((order): order is GoodsOrder => order !== null);
	const stalls = newerMarketEvent(events.stallEvents)
		.map(parseStallEvent)
		.filter((stall): stall is SellerStall => stall !== null);
	const products = newerMarketEvent(events.productEvents)
		.map(parseProductEvent)
		.filter((listing): listing is GoodsListing => listing !== null);
	const classifieds = newerMarketEvent(events.classifiedEvents)
		.map(parseClassifiedEvent)
		.filter((listing): listing is GoodsListing => listing !== null);
	const shipping = events.shippingEvents
		.map(parseShippingEvent)
		.filter((option): option is NonNullable<typeof option> => option !== null);
	const merged = mergeMarketCatalog({ listings, products, classifieds, stalls, shipping });
	return { listings: merged.listings, orders, stalls: merged.stalls };
}

export async function loadGoodsBoard(): Promise<{
	listings: GoodsListing[];
	orders: GoodsOrder[];
	stalls: SellerStall[];
}> {
	const relays = goodsRelayUrls();
	const [listingEvents, orderEvents, stallEvents, productEvents, classifiedEvents, shippingEvents] =
		await Promise.all([
			readKind(KINDS.GOODS_LISTING, relays),
			readKind(KINDS.GOODS_ORDER, relays),
			readKind(KINDS.MARKET_STALL, relays),
			readKind(KINDS.MARKET_PRODUCT, relays),
			readKind(KINDS.SERVICE_ACTIVE, relays),
			readKind(KINDS.MARKET_SHIPPING, relays)
		]);
	return catalogFrom({
		listingEvents,
		orderEvents,
		stallEvents,
		productEvents,
		classifiedEvents,
		shippingEvents
	});
}

/** Plebeian stalls, products, classifieds, and shipping. Does not read orders. */
export async function loadForeignMarket(): Promise<{
	listings: GoodsListing[];
	orders: GoodsOrder[];
	stalls: SellerStall[];
}> {
	const relays = FOREIGN_MARKET_RELAYS;
	const [stallEvents, productEvents, classifiedEvents, shippingEvents] = await Promise.all([
		readKind(KINDS.MARKET_STALL, relays),
		readKind(KINDS.MARKET_PRODUCT, relays),
		readKind(KINDS.SERVICE_ACTIVE, relays),
		readKind(KINDS.MARKET_SHIPPING, relays)
	]);
	return catalogFrom({
		listingEvents: [],
		orderEvents: [],
		stallEvents,
		productEvents,
		classifiedEvents,
		shippingEvents
	});
}

async function publishBody(
	kind: number,
	id: string,
	content: string,
	tags: string[][],
	relays: string[]
): Promise<void> {
	if (relays.length === 0) throw new Error('publish');
	const event = await getSignedEvent({
		kind,
		content,
		tags: [['d', id], ...tags]
	});
	const results = await publishWithRelayAuth(event, relays);
	if (!results.some((result) => result.success)) throw new Error('publish');
}

async function publishInterop(listing: GoodsListing, stall: SellerStall | null): Promise<void> {
	const relays = interopRelays();
	if (relays.length === 0) return;
	try {
		if (stall) {
			await publishBody(KINDS.MARKET_STALL, stall.id, stallContent(stall), [], relays);
			for (const zone of stall.shipping) {
				await publishBody(KINDS.MARKET_SHIPPING, zone.id, zone.name, shippingTags(zone), relays);
			}
		}
		const zones = stall?.shipping ?? [];
		await publishBody(
			KINDS.MARKET_PRODUCT,
			listing.id,
			productContent(listing, undefined, zones),
			productTags(listing),
			relays
		);
		for (const variant of listing.variants) {
			await publishBody(
				KINDS.MARKET_PRODUCT,
				`${listing.id}--${variant.id}`,
				productContent(listing, variant, zones),
				productTags(listing, variant.id),
				relays
			);
		}
	} catch {
		// The BitTasker listing is already saved. A relay may reject a market kind.
	}
}

/**
 * Saves the BitTasker goods event, then NIP-15 stall and product events.
 * Kind 30402 is not used. That kind is the service listing.
 */
export async function saveListing(
	listing: GoodsListing,
	stall: SellerStall | null = null
): Promise<void> {
	const images = listing.photos.map((photo) => ['image', photo]);
	await publishBody(
		KINDS.GOODS_LISTING,
		listing.id,
		listingBody(listing),
		[
			['title', listing.title],
			['summary', listing.description.slice(0, 280)],
			['price', listing.priceUsd.toFixed(2), 'USD'],
			['location', listing.location],
			['status', listing.status],
			['t', listing.category],
			['t', 'bittasker-goods'],
			['published_at', String(listing.createdAt)],
			...images
		],
		goodsRelayUrls()
	);
	await publishInterop(listing, stall);
}

export async function saveStall(stall: SellerStall): Promise<void> {
	const relays = interopRelays();
	await publishBody(KINDS.MARKET_STALL, stall.id, stallContent(stall), [], relays);
	for (const zone of stall.shipping) {
		await publishBody(KINDS.MARKET_SHIPPING, zone.id, zone.name, shippingTags(zone), relays);
	}
}

export async function saveOrder(order: GoodsOrder): Promise<void> {
	await publishBody(
		KINDS.GOODS_ORDER,
		order.id,
		orderBody(order),
		[
			['e', order.listingId],
			['p', order.buyerPubkey],
			['p', order.sellerPubkey],
			['status', order.status]
		],
		goodsRelayUrls()
	);
}
