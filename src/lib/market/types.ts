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

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PayAsset = 'usdt' | 'btc';

export interface GoodsListing {
	id: string;
	sellerPubkey: string;
	title: string;
	description: string;
	category: GoodsCategory;
	condition: GoodsCondition;
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
	reserve: string;
	deposit: string;
	collectBy: string;
	noShow: string;
	holdFull: boolean;
}

export function blankGoodsForm(): GoodsFormValue {
	return {
		title: '',
		description: '',
		category: 'electronics',
		condition: 'good',
		price: '',
		location: '',
		fulfillment: 'pickup',
		photos: [],
		latitude: null,
		longitude: null,
		reserve: 'pay',
		deposit: '',
		collectBy: '',
		noShow: '0',
		holdFull: false
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
		reserve: listing.reserve,
		deposit: listing.depositUsd > 0 ? String(listing.depositUsd) : '',
		collectBy: dateInputFromStamp(listing.collectBy),
		noShow: String(listing.noShowPercent),
		holdFull: listing.reserve === 'collect' && listing.depositUsd === listing.priceUsd
	};
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
	reserve?: string;
	depositUsd?: number;
	collectBy?: number;
	noShowPercent?: number;
}

export interface GoodsFilters {
	query: string;
	category: string;
	condition: string;
	fulfillment: string;
	maxPrice: number;
	location: string;
	near: { latitude: number; longitude: number } | null;
	maxKm: number;
}
