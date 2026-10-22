export const GOODS_CATEGORIES = [
	'electronics',
	'phones',
	'furniture',
	'home',
	'clothing',
	'vehicles',
	'tools',
	'sports',
	'kids',
	'property',
	'digital',
	'other'
] as const;

export type GoodsCategory = (typeof GOODS_CATEGORIES)[number];

/** Local rental shelves. Separate from the sale categories so browse can filter them. */
export const RENTAL_CATEGORIES = [
	'rent-vehicles',
	'rent-tools',
	'rent-generators',
	'rent-sound',
	'rent-party',
	'rent-cameras',
	'rent-machinery',
	'rent-boats'
] as const;

export type RentalCategory = (typeof RENTAL_CATEGORIES)[number];

export type ListingCategory = GoodsCategory | RentalCategory;

export const LISTING_OFFERS = ['sell', 'rent'] as const;

export type ListingOffer = (typeof LISTING_OFFERS)[number];

export const RENT_PERIODS = ['hour', 'day', 'week'] as const;

export type RentPeriod = (typeof RENT_PERIODS)[number];

export const GOODS_CONDITIONS = ['new', 'like-new', 'good', 'fair', 'for-parts'] as const;

export type GoodsCondition = (typeof GOODS_CONDITIONS)[number];

export const GOODS_FULFILLMENTS = ['pickup', 'shipping', 'both', 'digital'] as const;

export type GoodsFulfillment = (typeof GOODS_FULFILLMENTS)[number];

export const LISTING_STATUSES = ['active', 'sold', 'deleted'] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const ORDER_STATUSES = [
	'funded',
	'handed_over',
	'released',
	'disputed',
	'refunded'
] as const;

export const RESERVE_MODES = ['pay', 'collect'] as const;

export type ReserveMode = (typeof RESERVE_MODES)[number];

export const SHIPPING_SERVICES = ['standard', 'express', 'overnight', 'pickup', 'digital'] as const;

export type ShippingService = (typeof SHIPPING_SERVICES)[number];

/** One stall per seller. The d tag matches this id. */
export const STALL_ID = 'stall';

export interface ShippingZone {
	id: string;
	name: string;
	costUsd: number;
	regions: string[];
	service: ShippingService;
}

export interface GoodsVariant {
	id: string;
	name: string;
	priceUsd: number;
	specs: [string, string][];
}

export interface ShippingExtra {
	id: string;
	costUsd: number;
}

export interface SellerStall {
	id: string;
	sellerPubkey: string;
	name: string;
	description: string;
	shipping: ShippingZone[];
	createdAt: number;
}

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PayAsset = 'usdt' | 'btc';

export interface GoodsListing {
	id: string;
	sellerPubkey: string;
	title: string;
	description: string;
	category: ListingCategory;
	/** sell: a purchase. rent: a local rental with a rate and an optional deposit. */
	offer: ListingOffer;
	/** Empty on a sale. hour, day, or week on a rental. */
	rentPeriod: RentPeriod | '';
	/** Empty when the event did not set a condition. */
	condition: GoodsCondition | '';
	priceUsd: number;
	location: string;
	latitude: number | null;
	longitude: number | null;
	fulfillment: GoodsFulfillment;
	photos: string[];
	status: ListingStatus;
	createdAt: number;
	/** pay: full price, then handover. collect: deposit held until the buyer collects. */
	reserve: ReserveMode;
	depositUsd: number;
	collectBy: number;
	/** Percent of the deposit the seller keeps when the buyer does not collect. */
	noShowPercent: number;
	stallId: string;
	/** null means unlimited, used for digital goods. */
	quantity: number | null;
	variants: GoodsVariant[];
	shippingExtra: ShippingExtra[];
	/** Set when a foreign listing is priced in sats and has no USD price. */
	priceSats: number;
	source: 'bittasker' | 'nip15' | 'nip99';
}

export interface GoodsOrder {
	id: string;
	listingId: string;
	buyerPubkey: string;
	sellerPubkey: string;
	asset: PayAsset;
	priceUsd: number;
	amountSats: number;
	status: OrderStatus;
	fundedAt: number;
	handedAt: number;
	payoutInvoice: string;
	disputeNote: string;
	sellerRating: number;
	buyerRating: number;
	sellerNote: string;
	buyerNote: string;
	contractId: string;
	contractStatus: string;
	createdAt: number;
	reserve: ReserveMode;
	holdUsd: number;
	collectBy: number;
	noShowPercent: number;
	codeHash: string;
	collectedAt: number;
	sellerPaid: boolean;
	buyerPaid: boolean;
	quantity: number;
	variantId: string;
	shippingId: string;
	shippingUsd: number;
	unitUsd: number;
}

export interface GoodsFormValue {
	title: string;
	description: string;
	category: string;
	condition: string;
	price: string;
	location: string;
	fulfillment: string;
	photos: string[];
	latitude: number | null;
	longitude: number | null;
	offer: string;
	rentPeriod: string;
	reserve: string;
	deposit: string;
	collectBy: string;
	noShow: string;
	holdFull: boolean;
	quantity: string;
	variants: { name: string; price: string }[];
	extraShipping: string;
}

export function blankGoodsForm(offer: ListingOffer = 'sell'): GoodsFormValue {
	const rent = offer === 'rent';
	return {
		title: '',
		description: '',
		category: rent ? 'rent-vehicles' : 'electronics',
		condition: 'good',
		price: '',
		location: '',
		fulfillment: 'pickup',
		photos: [],
		latitude: null,
		longitude: null,
		offer,
		rentPeriod: rent ? 'day' : '',
		reserve: 'pay',
		deposit: '',
		collectBy: '',
		noShow: '0',
		holdFull: false,
		quantity: '',
		variants: [],
		extraShipping: ''
	};
}

export function formFromListing(listing: GoodsListing): GoodsFormValue {
	return {
		title: listing.title,
		description: listing.description,
		category: listing.category,
		condition: listing.condition,
		price: String(listing.priceUsd),
		location: listing.location,
		fulfillment: listing.fulfillment,
		photos: [...listing.photos],
		latitude: listing.latitude,
		longitude: listing.longitude,
		offer: listing.offer,
		rentPeriod: listing.rentPeriod,
		reserve: listing.reserve,
		deposit: listing.depositUsd > 0 ? String(listing.depositUsd) : '',
		collectBy: dateInputFromStamp(listing.collectBy),
		noShow: String(listing.noShowPercent),
		holdFull: listing.reserve === 'collect' && listing.depositUsd === listing.priceUsd,
		quantity: listing.quantity == null ? '' : String(listing.quantity),
		variants: listing.variants.map((variant) => ({
			name: variant.name,
			price: String(variant.priceUsd)
		})),
		extraShipping: extraShippingValue(listing.shippingExtra)
	};
}

function extraShippingValue(extras: ShippingExtra[]): string {
	const shared = extras.find((extra) => extra.id === '*') ?? extras[0];
	return shared && shared.costUsd > 0 ? String(shared.costUsd) : '';
}

function dateInputFromStamp(stamp: number): string {
	if (!(stamp > 0)) return '';
	const date = new Date(stamp * 1000);
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${date.getUTCFullYear()}-${month}-${day}`;
}

export interface ListingDraft {
	title: string;
	description: string;
	category: string;
	condition: string;
	priceUsd: number;
	location: string;
	latitude: number | null;
	longitude: number | null;
	fulfillment: string;
	photos: string[];
	offer?: string;
	rentPeriod?: string;
	reserve?: string;
	depositUsd?: number;
	collectBy?: number;
	noShowPercent?: number;
	quantity?: number | null;
	variants?: { name: string; priceUsd: number }[];
	extraShippingUsd?: number;
	stallId?: string;
}

export interface GoodsFilters {
	query: string;
	category: string;
	/** '' any, sell, or rent. */
	offer: string;
	condition: string;
	fulfillment: string;
	maxPrice: number;
	location: string;
	near: { latitude: number; longitude: number } | null;
	maxKm: number;
}
