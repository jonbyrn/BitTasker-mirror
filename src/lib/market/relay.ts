import type { Event } from 'nostr-tools';
import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import KINDS from '$lib/utils/constants/kinds';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { sanitizeRelayUrls } from '$lib/utils/relayUrls';
import {
	listingBody,
	newerMarketEvent,
	orderBody,
	parseListingEvent,
	parseOrderEvent
} from './events';
import type { GoodsListing, GoodsOrder } from './types';

export function goodsRelayUrls(): string[] {
	const listing = listingRelayUrls();
	if (listing.length > 0) return listing;
	return sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

async function readKind(kind: number): Promise<Event[]> {
	const relays = goodsRelayUrls();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	try {
		return await queryRelayEvents(relays, { kinds: [kind], limit: 200 });
	} catch {
		return [];
	}
}

export async function loadGoodsBoard(): Promise<{
	listings: GoodsListing[];
	orders: GoodsOrder[];
}> {
	const [listingEvents, orderEvents] = await Promise.all([
		readKind(KINDS.GOODS_LISTING),
		readKind(KINDS.GOODS_ORDER)
	]);
	const listings = newerMarketEvent(listingEvents)
		.map(parseListingEvent)
		.filter((listing): listing is GoodsListing => listing !== null);
	const orders = newerMarketEvent(orderEvents)
		.map(parseOrderEvent)
		.filter((order): order is GoodsOrder => order !== null);
	return { listings, orders };
}

async function publishBody(
	kind: number,
	id: string,
	content: string,
	tags: string[][]
): Promise<void> {
	const relays = goodsRelayUrls();
	if (relays.length === 0) throw new Error('publish');
	const event = await getSignedEvent({
		kind,
		content,
		tags: [['d', id], ...tags]
	});
	const results = await publishToMultipleRelays(event, relays);
	if (!results.some((result) => result.success)) throw new Error('publish');
}

/** NIP-99 tag shape on a BitTasker kind. Kind 30402 stays reserved for services. */
export async function saveListing(listing: GoodsListing): Promise<void> {
	const images = listing.photos.map((photo) => ['image', photo]);
	await publishBody(KINDS.GOODS_LISTING, listing.id, listingBody(listing), [
		['title', listing.title],
		['summary', listing.description.slice(0, 280)],
		['price', listing.priceUsd.toFixed(2), 'USD'],
		['location', listing.location],
		['status', listing.status],
		['t', listing.category],
		['t', 'bittasker-goods'],
		['published_at', String(listing.createdAt)],
		...images
	]);
}

export async function saveOrder(order: GoodsOrder): Promise<void> {
	await publishBody(KINDS.GOODS_ORDER, order.id, orderBody(order), [
		['e', order.listingId],
		['p', order.buyerPubkey],
		['p', order.sellerPubkey],
		['status', order.status]
	]);
}
