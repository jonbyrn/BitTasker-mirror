import type { Event } from 'nostr-tools';
import { isGoodsCategory, isGoodsCondition } from './categories';
import { pubkeyHex } from '$lib/staffing/ids';
import type {
	GoodsCategory,
	GoodsCondition,
	GoodsFulfillment,
	GoodsListing,
	GoodsVariant,
	SellerStall,
	ShippingExtra,
	ShippingService,
	ShippingZone
} from './types';
import { SHIPPING_SERVICES, STALL_ID } from './types';

const SERVICES = new Set<string>(SHIPPING_SERVICES);

export function defaultZones(fulfillment: string): ShippingZone[] {
	if (fulfillment === 'digital') {
		return [
			{ id: 'digital', name: 'Digital', costUsd: 0, regions: ['Online'], service: 'digital' }
		];
	}
	if (fulfillment === 'shipping') {
		return [
			{ id: 'ship', name: 'Shipping', costUsd: 0, regions: ['Shipping'], service: 'standard' }
		];
	}
	if (fulfillment === 'both') {
		return [
			{ id: 'pickup', name: 'Pickup', costUsd: 0, regions: ['Local pickup'], service: 'pickup' },
			{ id: 'ship', name: 'Shipping', costUsd: 0, regions: ['Shipping'], service: 'standard' }
		];
	}
	return [
		{ id: 'pickup', name: 'Pickup', costUsd: 0, regions: ['Local pickup'], service: 'pickup' }
	];
}

export function defaultStall(listing: GoodsListing): SellerStall {
	return {
		id: STALL_ID,
		sellerPubkey: listing.sellerPubkey,
		name: 'Shop',
		description: '',
		shipping: defaultZones(listing.fulfillment),
		createdAt: listing.createdAt
	};
}

export function zonesFor(listing: GoodsListing, stall: SellerStall | undefined): ShippingZone[] {
	if (stall && stall.shipping.length > 0) return stall.shipping;
	return defaultZones(listing.fulfillment);
}

export function stallContent(stall: SellerStall): string {
	return JSON.stringify({
		id: stall.id,
		name: stall.name,
		description: stall.description,
		currency: 'USD',
		shipping: stall.shipping.map((zone) => ({
			id: zone.id,
			name: zone.name,
			cost: zone.costUsd,
			regions: zone.regions
		}))
	});
}

export function productContent(
	listing: GoodsListing,
	product?: GoodsVariant,
	zones: ShippingZone[] = []
): string {
	const specs: [string, string][] = [
		['condition', listing.condition],
		['category', listing.category],
		...(product?.specs ?? [])
	];
	const shared = listing.shippingExtra.find((extra) => extra.id === '*');
	const extras = listing.shippingExtra.filter((extra) => extra.id !== '*');
	for (const zone of zones) {
		if (zone.service === 'pickup' || zone.service === 'digital' || !shared) continue;
		if (extras.some((extra) => extra.id === zone.id)) continue;
		extras.push({ id: zone.id, costUsd: shared.costUsd });
	}
	return JSON.stringify({
		id: product ? `${listing.id}--${product.id}` : listing.id,
		stall_id: listing.stallId || STALL_ID,
		name: product ? `${listing.title} — ${product.name}` : listing.title,
		description: listing.description,
		images: listing.photos,
		currency: listing.priceUsd > 0 ? 'USD' : 'SAT',
		price: product ? product.priceUsd : listing.priceUsd > 0 ? listing.priceUsd : listing.priceSats,
		quantity: listing.quantity,
		specs,
		shipping: extras.map((extra) => ({ id: extra.id, cost: extra.costUsd }))
	});
}

export function productTags(listing: GoodsListing, productId?: string): string[][] {
	const images = listing.photos.map((photo) => ['image', photo]);
	const price = productId
		? (listing.variants.find((variant) => variant.id === productId)?.priceUsd ?? listing.priceUsd)
		: listing.priceUsd;
	return [
		['title', listing.title],
		['summary', listing.description.slice(0, 280)],
		[
			'price',
			(price > 0 ? price : listing.priceSats).toFixed(price > 0 ? 2 : 0),
			price > 0 ? 'USD' : 'SAT'
		],
		['location', listing.location],
		['status', listing.status === 'deleted' ? 'sold' : listing.status],
		['t', listing.category],
		['t', 'bittasker-goods'],
		['client', 'bittasker'],
		['published_at', String(listing.createdAt)],
		...images
	];
}

export function shippingTags(zone: ShippingZone): string[][] {
	const codes = zone.regions
		.filter((region) => /^[A-Za-z]{2}$/.test(region))
		.map((region) => region.toUpperCase());
	return [
		['title', zone.name],
		['price', zone.costUsd.toFixed(2), 'USD'],
		['country', ...(codes.length > 0 ? codes : ['ZZ'])],
		['service', zone.service],
		['location', zone.regions.join(', ')]
	];
}

function tagValue(event: Event, name: string): string {
	return event.tags.find((tag) => tag[0] === name)?.[1]?.trim() ?? '';
}

function tagValues(event: Event, name: string): string[] {
	return event.tags
		.filter((tag) => tag[0] === name)
		.map((tag) => tag[1]?.trim() ?? '')
		.filter(Boolean);
}

function money(value: unknown): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.round(parsed * 100) / 100;
}

function whole(value: unknown): number | null {
	if (value == null || value === '') return null;
	const parsed = Math.floor(Number(value));
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed;
}

function serviceOf(value: string): ShippingService {
	return SERVICES.has(value) ? (value as ShippingService) : 'standard';
}

/** BitTasker services already use kind 30402. Those events are not goods. */
export function isBitTaskerServiceEvent(event: Event): boolean {
	if (event.tags.some((tag) => tag[0] === 'Y' || tag[0] === 'skills' || tag[0] === 'categories')) {
		return true;
	}
	try {
		const parsed = JSON.parse(event.content) as Record<string, unknown>;
		if (parsed && typeof parsed === 'object' && ('pricing' in parsed || 'uniqueId' in parsed)) {
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

function categoryFrom(values: string[]): GoodsCategory {
	for (const value of values) {
		const folded = value.trim().toLowerCase();
		if (isGoodsCategory(folded)) return folded;
	}
	return 'other';
}

/** Placeholder used when a product has no location tag. Translated at display. */
export const SHOP_PLACE = 'See shop';

/** BitTasker goods carry our client tag or the bittasker-goods topic. Other apps do not. */
export function isBitTaskerMarketEvent(event: Event): boolean {
	if (tagValue(event, 'client').toLowerCase() === 'bittasker') return true;
	return tagValues(event, 't').some((value) => value.toLowerCase() === 'bittasker-goods');
}

function conditionFrom(specs: [string, string][]): GoodsCondition | '' {
	const found =
		specs
			.find((spec) => spec[0].toLowerCase() === 'condition')?.[1]
			?.trim()
			.toLowerCase() ?? '';
	return isGoodsCondition(found) ? found : '';
}

function priceFrom(amount: number, currency: string): { priceUsd: number; priceSats: number } {
	const code = currency.trim().toUpperCase();
	if (code === 'SAT' || code === 'SATS') return { priceUsd: 0, priceSats: Math.round(amount) };
	if (code === 'BTC') return { priceUsd: 0, priceSats: Math.round(amount * 100_000_000) };
	return { priceUsd: money(amount), priceSats: 0 };
}

function fulfillmentFrom(input: {
	digital: boolean;
	zones: number;
	location: string;
}): GoodsFulfillment {
	if (input.digital) return 'digital';
	if (input.zones > 0 && input.location) return 'both';
	if (input.zones > 0) return 'shipping';
	return 'pickup';
}

export function parseStallEvent(event: Event): SellerStall | null {
	const seller = pubkeyHex(event.pubkey);
	if (!seller) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object') return null;
	const record = parsed as {
		id?: unknown;
		name?: unknown;
		description?: unknown;
		shipping?: unknown;
	};
	const id = String(record.id ?? tagValue(event, 'd'))
		.trim()
		.slice(0, 80);
	const name = String(record.name ?? '')
		.trim()
		.slice(0, 80);
	if (!id || !name) return null;
	const shipping = Array.isArray(record.shipping) ? cleanIncomingZones(record.shipping) : [];
	return {
		id,
		sellerPubkey: seller,
		name,
		description: String(record.description ?? '')
			.trim()
			.slice(0, 500),
		shipping,
		createdAt: event.created_at ?? 0
	};
}

function cleanIncomingZones(values: unknown[]): ShippingZone[] {
	const zones: ShippingZone[] = [];
	for (const value of values) {
		if (!value || typeof value !== 'object') continue;
		const zone = value as { id?: unknown; name?: unknown; cost?: unknown; regions?: unknown };
		const id = String(zone.id ?? '')
			.trim()
			.slice(0, 40);
		const name = String(zone.name ?? id)
			.trim()
			.slice(0, 60);
		if (!id || !name) continue;
		const regions = Array.isArray(zone.regions)
			? zone.regions
					.map((region) => String(region).trim())
					.filter(Boolean)
					.slice(0, 12)
			: [];
		zones.push({
			id,
			name,
			costUsd: money(zone.cost),
			regions: regions.length > 0 ? regions : ['Shipping'],
			service: id === 'pickup' ? 'pickup' : id === 'digital' ? 'digital' : 'standard'
		});
		if (zones.length === 8) break;
	}
	return zones;
}

export function parseProductEvent(event: Event): GoodsListing | null {
	if (!isBitTaskerMarketEvent(event)) return null;
	const seller = pubkeyHex(event.pubkey);
	const id = tagValue(event, 'd') || '';
	if (!seller || !id) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object') return null;
	const record = parsed as {
		name?: unknown;
		description?: unknown;
		images?: unknown;
		currency?: unknown;
		price?: unknown;
		quantity?: unknown;
		specs?: unknown;
		shipping?: unknown;
		stall_id?: unknown;
	};
	const title = String(record.name ?? tagValue(event, 'title'))
		.trim()
		.slice(0, 120);
	const description = String(record.description ?? tagValue(event, 'summary'))
		.trim()
		.slice(0, 4000);
	if (!title || !description) return null;
	const specs = cleanSpecs(record.specs);
	const priced = priceFrom(Number(record.price), String(record.currency ?? 'USD'));
	if (!(priced.priceUsd > 0) && !(priced.priceSats > 0)) return null;
	const images = Array.isArray(record.images)
		? cleanIncomingPhotos(record.images.map(String))
		: photosFrom(event);
	const categories = [
		...tagValues(event, 't'),
		...specs.filter((spec) => spec[0] === 'category').map((spec) => spec[1])
	];
	const digital = record.quantity == null && images.length === 0;
	const extras = cleanExtras(record.shipping);
	const location = tagValue(event, 'location') || (digital ? 'Online' : SHOP_PLACE);
	return {
		id,
		sellerPubkey: seller,
		title,
		description,
		category: categoryFrom(categories),
		condition: conditionFrom(specs),
		priceUsd: priced.priceUsd,
		location,
		latitude: null,
		longitude: null,
		fulfillment: fulfillmentFrom({
			digital,
			zones: extras.length,
			location: tagValue(event, 'location')
		}),
		photos: images,
		status: tagValue(event, 'status') === 'sold' ? 'sold' : 'active',
		createdAt: event.created_at ?? 0,
		reserve: 'pay',
		depositUsd: 0,
		collectBy: 0,
		noShowPercent: 0,
		stallId:
			String(record.stall_id ?? STALL_ID)
				.trim()
				.slice(0, 80) || STALL_ID,
		quantity: whole(record.quantity),
		variants: [],
		shippingExtra: extras,
		priceSats: priced.priceSats,
		source: 'nip15'
	};
}

function cleanSpecs(value: unknown): [string, string][] {
	if (!Array.isArray(value)) return [];
	const specs: [string, string][] = [];
	for (const pair of value) {
		if (!Array.isArray(pair) || pair.length < 2) continue;
		const key = String(pair[0] ?? '')
			.trim()
			.slice(0, 40);
		const spec = String(pair[1] ?? '')
			.trim()
			.slice(0, 80);
		if (!key || !spec) continue;
		specs.push([key, spec]);
	}
	return specs.slice(0, 20);
}

function cleanExtras(value: unknown): ShippingExtra[] {
	if (!Array.isArray(value)) return [];
	const extras: ShippingExtra[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const extra = item as { id?: unknown; cost?: unknown };
		const id = String(extra.id ?? '')
			.trim()
			.slice(0, 40);
		if (!id) continue;
		extras.push({ id, costUsd: money(extra.cost) });
	}
	return extras.slice(0, 8);
}

function cleanIncomingPhotos(values: string[]): string[] {
	const photos: string[] = [];
	for (const value of values) {
		const photo = value.trim();
		if (!/^https:\/\/\S+$/i.test(photo) || photos.includes(photo)) continue;
		photos.push(photo);
		if (photos.length === 4) break;
	}
	return photos;
}

function photosFrom(event: Event): string[] {
	return cleanIncomingPhotos(tagValues(event, 'image'));
}

export function parseClassifiedEvent(event: Event): GoodsListing | null {
	if (event.kind !== 30402 || isBitTaskerServiceEvent(event) || !isBitTaskerMarketEvent(event))
		return null;
	const type = event.tags.find((tag) => tag[0] === 'type')?.[1];
	if (type === 'variation') return null;
	const seller = pubkeyHex(event.pubkey);
	const id = tagValue(event, 'd');
	const title = tagValue(event, 'title').slice(0, 120);
	const priceTag = event.tags.find((tag) => tag[0] === 'price');
	if (!seller || !id || !title || !priceTag?.[1]) return null;
	const visibility = tagValue(event, 'visibility');
	if (visibility === 'hidden') return null;
	const priced = priceFrom(Number(priceTag[1]), priceTag[2] ?? 'USD');
	if (!(priced.priceUsd > 0) && !(priced.priceSats > 0)) return null;
	const format = event.tags.find((tag) => tag[0] === 'type')?.[2] ?? '';
	const digital = format === 'digital';
	const stock = tagValue(event, 'stock');
	const summary = tagValue(event, 'summary');
	const description = (event.content || summary || title).trim().slice(0, 4000);
	const location = tagValue(event, 'location') || (digital ? 'Online' : SHOP_PLACE);
	const specs = event.tags
		.filter((tag) => tag[0] === 'spec' && tag[1] && tag[2])
		.map((tag) => [tag[1], tag[2]] as [string, string]);
	const status = tagValue(event, 'status');
	return {
		id,
		sellerPubkey: seller,
		title,
		description,
		category: categoryFrom(tagValues(event, 't')),
		condition: conditionFrom(specs),
		priceUsd: priced.priceUsd,
		location,
		latitude: null,
		longitude: null,
		fulfillment: digital
			? 'digital'
			: location && tagValues(event, 'shipping_option').length > 0
				? 'both'
				: location
					? 'pickup'
					: 'shipping',
		photos: photosFrom(event),
		status: status === 'sold' ? 'sold' : 'active',
		createdAt: Number(tagValue(event, 'published_at')) || event.created_at || 0,
		reserve: 'pay',
		depositUsd: 0,
		collectBy: 0,
		noShowPercent: 0,
		stallId: STALL_ID,
		quantity: stock ? whole(stock) : digital ? null : 1,
		variants: [],
		shippingExtra: [],
		priceSats: priced.priceSats,
		source: 'nip99'
	};
}

export function parseShippingEvent(
	event: Event
): { sellerPubkey: string; zone: ShippingZone; createdAt: number } | null {
	const seller = pubkeyHex(event.pubkey);
	const id = tagValue(event, 'd');
	const name = tagValue(event, 'title');
	const priceTag = event.tags.find((tag) => tag[0] === 'price');
	if (!seller || !id || !name || !priceTag) return null;
	const countries =
		event.tags
			.find((tag) => tag[0] === 'country')
			?.slice(1)
			.filter(Boolean) ?? [];
	const location = tagValue(event, 'location');
	const regions = location
		? location
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
		: countries;
	return {
		sellerPubkey: seller,
		createdAt: event.created_at ?? 0,
		zone: {
			id,
			name: name.slice(0, 60),
			costUsd: money(priceTag[1]),
			regions: regions.length > 0 ? regions.slice(0, 12) : ['Shipping'],
			service: serviceOf(tagValue(event, 'service'))
		}
	};
}

export function mergeMarketCatalog(input: {
	listings: GoodsListing[];
	products: GoodsListing[];
	classifieds: GoodsListing[];
	stalls: SellerStall[];
	shipping: { sellerPubkey: string; zone: ShippingZone; createdAt: number }[];
}): { listings: GoodsListing[]; stalls: SellerStall[] } {
	const listings = [...input.listings];
	const known = new Set(listings.map((listing) => listing.id));
	const add = (listing: GoodsListing) => {
		if (known.has(listing.id)) return;
		const parent = listing.id.split('--')[0];
		if (parent !== listing.id && known.has(parent)) {
			const host = listings.find((item) => item.id === parent);
			const variantId = listing.id.slice(parent.length + 2);
			if (host && variantId && !host.variants.some((variant) => variant.id === variantId)) {
				host.variants = [
					...host.variants,
					{
						id: variantId,
						name: listing.title,
						priceUsd: listing.priceUsd,
						specs: [['option', listing.title]]
					}
				];
			}
			return;
		}
		known.add(listing.id);
		listings.push(listing);
	};
	for (const product of input.products) add(product);
	for (const classified of input.classifieds) add(classified);

	const stalls = [...input.stalls];
	for (const option of input.shipping) {
		let stall = stalls.find(
			(item) => item.sellerPubkey === option.sellerPubkey && item.id === STALL_ID
		);
		if (!stall) {
			stall = {
				id: STALL_ID,
				sellerPubkey: option.sellerPubkey,
				name: 'Shop',
				description: '',
				shipping: [],
				createdAt: option.createdAt
			};
			stalls.push(stall);
		}
		if (!stall.shipping.some((zone) => zone.id === option.zone.id)) {
			stall.shipping = [...stall.shipping, option.zone];
		}
	}
	return { listings, stalls };
}

export interface CheckoutChoice {
	productId: string;
	quantity: number;
	shippingId: string;
	address: string;
	message: string;
}

/** NIP-15 customer order. Kind 4 content. No phone or email keys, so the chat filter can send it. */
export function customerOrderMessage(
	choice: CheckoutChoice,
	orderId: string,
	buyerPubkey: string
): string {
	const body: Record<string, unknown> = {
		id: orderId,
		type: 0,
		message: choice.message,
		contact: { nostr: buyerPubkey },
		items: [{ product_id: choice.productId, quantity: choice.quantity }],
		shipping_id: choice.shippingId
	};
	const address = choice.address.trim().slice(0, 300);
	if (address) body.address = address;
	return JSON.stringify(body);
}

/** NIP-15 merchant status. Kind 4 content. */
export function merchantStatusMessage(orderId: string, message: string, shipped: boolean): string {
	return JSON.stringify({
		id: orderId,
		type: 2,
		message,
		paid: true,
		shipped
	});
}

export function checkoutPlainText(plaintext: string): string | null {
	if (!plaintext.startsWith('{')) return null;
	try {
		const parsed = JSON.parse(plaintext) as {
			type?: unknown;
			message?: unknown;
			items?: unknown;
			paid?: unknown;
		};
		if (!parsed || typeof parsed !== 'object') return null;
		if (parsed.type !== 0 && parsed.type !== 1 && parsed.type !== 2) return null;
		if (
			!('items' in parsed) &&
			!('paid' in parsed) &&
			!('shipping_id' in parsed) &&
			!('payment_options' in parsed)
		) {
			return null;
		}
		if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
		if (parsed.type === 0) return 'New order. Payment is in BitTasker escrow.';
		if (parsed.type === 2) return 'Order update. Payment is in BitTasker escrow.';
		return 'Payment is in BitTasker escrow.';
	} catch {
		return null;
	}
}
