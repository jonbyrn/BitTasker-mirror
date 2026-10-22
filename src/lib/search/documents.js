import { categoryById, classifyListing, fold } from './taxonomy.js';

const SATS_PER_BTC = 100_000_000;
const OPEN_TASK = 'OPEN';
const ACTIVE_SERVICE = 'active';

/**
 * @param {number} amount
 * @param {string | undefined} currency
 * @param {number} btcUsd
 */
export function toPrices(amount, currency, btcUsd = 0) {
	const value = Number(amount);
	if (!Number.isFinite(value) || value < 0) return { price_usd: 0, price_sats: 0 };
	const code = String(currency || '')
		.trim()
		.toLowerCase();
	const rate = Number(btcUsd) > 0 ? Number(btcUsd) : 0;
	if (
		code === 'usd' ||
		code.includes('usdt') ||
		code === 'dollar' ||
		code === 'dollars' ||
		code === ''
	) {
		return {
			price_usd: roundMoney(value),
			price_sats: rate > 0 ? Math.round((value / rate) * SATS_PER_BTC) : 0
		};
	}
	if (code === 'btc' || code === 'bitcoin' || code === 'xbt') {
		return {
			price_sats: Math.round(value * SATS_PER_BTC),
			price_usd: rate > 0 ? roundMoney(value * rate) : 0
		};
	}
	if (code === 'sat' || code === 'sats' || code === 'satoshi' || code === 'satoshis') {
		return {
			price_sats: Math.round(value),
			price_usd: rate > 0 ? roundMoney((value / SATS_PER_BTC) * rate) : 0
		};
	}
	return { price_usd: roundMoney(value), price_sats: 0 };
}

/** @param {number} value */
function roundMoney(value) {
	return Math.round(value * 100) / 100;
}

/** @param {string[]} parts */
export function documentId(parts) {
	return parts
		.map((part) => String(part || '').replace(/[^a-zA-Z0-9_-]/g, '_'))
		.join('_')
		.slice(0, 200);
}

/**
 * Keep the visible title in English and add the Spanish category names for search.
 * @param {string} title
 * @param {string} description
 * @param {{ category?: string, subcategory?: string }} classified
 */
export function spanishSearchText(title, description, classified) {
	const category = categoryById(classified?.category || '');
	/** @type {string[]} */
	const labels = [];
	if (category?.nameEs) labels.push(category.nameEs);
	const subcategory = category?.subcategories?.find((item) => item.id === classified?.subcategory);
	if (subcategory && subcategory.id !== 'other' && subcategory.nameEs)
		labels.push(subcategory.nameEs);
	return {
		title_es: [title, ...labels].filter(Boolean).join(' · '),
		description_es: [description, ...labels].filter(Boolean).join(' ')
	};
}

/** @param {string} location */
export function locationTokens(location) {
	const folded = fold(location);
	const tokens = folded.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
	return [...new Set(tokens)];
}

/**
 * @param {{ tags?: string[][] }} event
 * @param {string} name
 */
function tagValue(event, name) {
	return event.tags?.find((tag) => tag[0] === name)?.[1] || '';
}

/** @param {string} content */
function readJson(content) {
	try {
		const value = JSON.parse(content);
		return value && typeof value === 'object' ? value : null;
	} catch {
		return null;
	}
}

/**
 * @param {Record<string, unknown>} content
 * @param {number} now
 */
function isExpired(content, now) {
	const raw = content.deadline || content?.dateRange?.end;
	if (typeof raw !== 'string' || !raw) return false;
	const time = Date.parse(raw);
	return Number.isFinite(time) && time < now;
}

/**
 * @param {Record<string, unknown>} content
 * @param {number} btcUsd
 */
function servicePrice(content, btcUsd) {
	const pricing = content.pricing;
	if (!pricing || typeof pricing !== 'object') return toPrices(0, 'USD', btcUsd);
	const price = /** @type {Record<string, unknown>} */ (pricing);
	const currency = typeof price.currency === 'string' ? price.currency : 'USD';
	if (price.type === 'HOURLY') return toPrices(Number(price.hourlyRate) || 0, currency, btcUsd);
	if (price.type === 'TIERED' && Array.isArray(price.tiers)) {
		const amounts = price.tiers
			.map((tier) => Number(tier?.price))
			.filter((amount) => Number.isFinite(amount) && amount > 0);
		return toPrices(amounts.length ? Math.min(...amounts) : 0, currency, btcUsd);
	}
	return toPrices(Number(price.amount) || 0, currency, btcUsd);
}

/**
 * @param {Record<string, unknown>} content
 */
function serviceRemote(content) {
	const types = Array.isArray(content.serviceLocationTypes) ? content.serviceLocationTypes : [];
	return types.map((type) => String(type).toLowerCase()).includes('remote');
}

/**
 * @param {Record<string, unknown>} content
 */
function serviceLocation(content) {
	const details = content.locationDetails;
	if (!details || typeof details !== 'object') return '';
	const record = /** @type {Record<string, any>} */ (details);
	return (
		record.taskeeLocation?.locationDisplayName ||
		record.taskeeLocation?.serviceLocation?.displayName ||
		record.taskerLocation?.serviceLocation?.displayName ||
		''
	);
}

/**
 * @param {Record<string, unknown>} content
 */
function taskLocation(content) {
	const pickup = content.pickupLocation;
	if (!pickup || typeof pickup !== 'object') return '';
	const place = /** @type {Record<string, unknown>} */ (pickup);
	if (typeof place.displayName === 'string' && place.displayName) return place.displayName;
	const components = place.addressComponents;
	if (components && typeof components === 'object') {
		const address = /** @type {Record<string, unknown>} */ (components);
		return [address.city, address.state, address.country].filter(Boolean).join(', ');
	}
	return '';
}

/**
 * @param {string} collection
 * @param {Record<string, unknown>} fields
 */
function upsert(collection, fields) {
	return { op: 'upsert', collection, document: fields };
}

/**
 * @param {string} collection
 * @param {string} id
 */
function remove(collection, id) {
	return { op: 'remove', collection, id };
}

/**
 * Turn one Nostr event into index writes.
 * Finished, expired, deleted, and draft records become removals.
 *
 * @param {any} event
 * @param {{ now?: number, btcUsd?: number }} [options]
 */
export function actionsFromEvent(event, options = {}) {
	const now = options.now ?? Date.now();
	const btcUsd = options.btcUsd ?? 0;
	if (!event || typeof event.kind !== 'number' || typeof event.pubkey !== 'string') {
		return [];
	}
	if (event.kind === 5) return deletionActions(event);
	if (event.kind === 31000) return taskActions(event, now, btcUsd);
	if (event.kind === 30402 || event.kind === 30403) return serviceActions(event, now, btcUsd);
	if (event.kind === 31150) return shiftActions(event, now);
	if (event.kind === 31160) return goodsActions(event, now);
	if (event.kind === 0) return profileActions(event);
	if (event.kind === 30000) return skillActions(event);
	return [];
}

/** @param {{ tags?: string[][] }} event */
function deletionActions(event) {
	/** @type {Array<Record<string, unknown>>} */
	const actions = [];
	for (const tag of event.tags || []) {
		if (tag[0] === 'e' && tag[1]) {
			for (const collection of ['tasks', 'services', 'profiles']) {
				actions.push({ op: 'remove-filter', collection, filter: `event_id:=${tag[1]}` });
			}
		}
		if (tag[0] === 'a' && tag[1]) {
			const [kind, pubkey, dTag] = String(tag[1]).split(':');
			if (kind === '31000' && pubkey && dTag) {
				actions.push(remove('tasks', documentId(['task', pubkey, dTag])));
			}
			if ((kind === '30402' || kind === '30403') && pubkey && dTag) {
				actions.push(remove('services', documentId(['service', pubkey, dTag])));
			}
			if (kind === '31150' && pubkey && dTag) {
				actions.push(remove('shifts', documentId(['shift', pubkey, dTag])));
			}
			if (kind === '31160' && pubkey && dTag) {
				actions.push(remove('listings', documentId(['listing', pubkey, dTag])));
			}
			if (kind === '0' && pubkey) actions.push(remove('profiles', documentId(['profile', pubkey])));
		}
	}
	return actions;
}

/**
 * @param {any} event
 * @param {number} now
 * @param {number} btcUsd
 */
function taskActions(event, now, btcUsd) {
	const content = readJson(event.content);
	const dTag = tagValue(event, 'd') || event.id;
	const id = documentId(['task', event.pubkey, dTag]);
	if (!content || typeof content.title !== 'string') return [remove('tasks', id)];
	const status = String(content.status || tagValue(event, 'S') || '');
	const open = status.toUpperCase() === OPEN_TASK && !content.isDeleted && !isExpired(content, now);
	if (!open) return [remove('tasks', id)];
	const classified = classifyListing(content);
	const budget = content.budget && typeof content.budget === 'object' ? content.budget : {};
	const prices = toPrices(budget.amount, budget.currency, btcUsd);
	const remote = String(content.taskType || '').toLowerCase() === 'remote';
	const location = remote ? '' : taskLocation(content);
	const skills = Array.isArray(content.skills) ? content.skills.map(String) : [];
	const text = String(content.title);
	const description = String(content.description || '');
	const spanish = spanishSearchText(text, description, classified);
	return [
		upsert('tasks', {
			id,
			public_id: dTag,
			address: `31000:${event.pubkey}:${dTag}`,
			event_id: event.id,
			title: text,
			title_es: spanish.title_es,
			description,
			description_es: spanish.description_es,
			category: classified.category,
			subcategory: classified.subcategory,
			skills,
			...prices,
			location,
			location_tokens: locationTokens(location),
			remote,
			rating: Number(content.creator?.rating) || 0,
			created_at: Number(event.created_at) || Math.floor(now / 1000),
			status: status.toUpperCase(),
			pubkey: event.pubkey,
			url: `/tasks/${encodeURIComponent(dTag)}`
		})
	];
}

/**
 * @param {any} event
 * @param {number} now
 * @param {number} btcUsd
 */
function serviceActions(event, now, btcUsd) {
	const content = readJson(event.content);
	const dTag = tagValue(event, 'd') || content?.uniqueId || event.id;
	const id = documentId(['service', event.pubkey, dTag]);
	if (!content || typeof content.title !== 'string') return [remove('services', id)];
	const status = String(content.status || tagValue(event, 'S') || '');
	const active =
		event.kind === 30402 && status.toLowerCase() === ACTIVE_SERVICE && !content.isDeleted;
	if (!active) return [remove('services', id)];
	const classified = classifyListing(content);
	const prices = servicePrice(content, btcUsd);
	const remote = serviceRemote(content);
	const location = remote ? '' : String(serviceLocation(content) || '');
	const skills = Array.isArray(content.skills) ? content.skills.map(String) : [];
	const publicId = String(content.uniqueId || dTag);
	const title = String(content.title);
	const description = String(content.description || '');
	const spanish = spanishSearchText(title, description, classified);
	return [
		upsert('services', {
			id,
			public_id: publicId,
			address: `${event.kind}:${event.pubkey}:${dTag}`,
			event_id: event.id,
			title,
			title_es: spanish.title_es,
			description,
			description_es: spanish.description_es,
			category: classified.category,
			subcategory: classified.subcategory,
			skills,
			...prices,
			location,
			location_tokens: locationTokens(location),
			remote,
			rating: Number(content.creator?.rating) || 0,
			created_at: Number(event.created_at) || Number(content.createdAt) || Math.floor(now / 1000),
			status,
			pubkey: event.pubkey,
			url: `/services/${encodeURIComponent(publicId)}`
		})
	];
}

/**
 * Avatars are stored, not searched. Only an https URL is kept.
 * @param {unknown} value
 */
function profilePicture(value) {
	const picture = String(value || '').trim();
	if (!/^https:\/\//i.test(picture) || picture.length > 500) return '';
	return picture;
}

/** @param {any} event */
function profileActions(event) {
	const pubkey = String(event.pubkey || '');
	if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) return [];
	const content = readJson(event.content) || {};
	const labels = [content.display_name, content.name, content.displayName, content.username]
		.map((value) => String(value || '').trim())
		.filter(Boolean);
	const name = labels[0] || '';
	const id = documentId(['profile', pubkey]);
	if (!name) return [remove('profiles', id)];
	const nip05 = String(content.nip05 || '').trim();
	const about = [String(content.about || content.bio || '').trim(), ...labels.slice(1), nip05]
		.filter((part) => part && part !== name)
		.join('\n');
	const location = String(content.location || '').trim();
	const skills = Array.isArray(content.skills) ? content.skills.map(String) : [];
	const classified = classifyListing({ title: name, description: about, skills });
	const spanish = spanishSearchText(name, about, classified);
	return [
		{
			op: 'patch',
			collection: 'profiles',
			id,
			create: true,
			fields: {
				id,
				public_id: pubkey,
				event_id: event.id,
				title: name,
				title_es: spanish.title_es,
				description: about,
				description_es: spanish.description_es,
				picture: profilePicture(content.picture),
				category: classified.category,
				subcategory: classified.subcategory,
				skills,
				location,
				location_tokens: locationTokens(location),
				remote: false,
				rating: Number(content.rating) || 0,
				created_at: Number(event.created_at) || 0,
				status: 'active',
				pubkey,
				url: '',
				price_usd: 0,
				price_sats: 0
			}
		}
	];
}

/** @param {any} event */
function skillActions(event) {
	const content = readJson(event.content);
	const list = Array.isArray(content) ? content : [];
	const skills = list
		.map((skill) => (typeof skill === 'string' ? skill : skill?.name))
		.filter((skill) => typeof skill === 'string' && skill.trim())
		.map(String);
	if (!skills.length) return [];
	const classified = classifyListing({ title: skills.join(' '), skills });
	const id = documentId(['profile', event.pubkey]);
	return [
		{
			op: 'patch',
			collection: 'profiles',
			id,
			create: false,
			fields: {
				skills,
				category: classified.category,
				subcategory: classified.subcategory,
				pubkey: event.pubkey
			}
		}
	];
}

/**
 * Drop a replaceable listing by kind:pubkey:d.
 * @param {string} address
 */
export function removalForAddress(address) {
	const [kind, pubkey, ...rest] = String(address || '').split(':');
	const dTag = rest.join(':');
	if (!kind || !pubkey || !dTag) return [];
	if (kind === '31000') return [remove('tasks', documentId(['task', pubkey, dTag]))];
	if (kind === '30402' || kind === '30403') {
		return [remove('services', documentId(['service', pubkey, dTag]))];
	}
	if (kind === '31150') return [remove('shifts', documentId(['shift', pubkey, dTag]))];
	if (kind === '31160') return [remove('listings', documentId(['listing', pubkey, dTag]))];
	return [];
}

/**
 * Buy, sell, and rent listings. Kind 31160. Only active rows stay searchable.
 * @param {any} event
 * @param {number} now
 */
function goodsActions(event, now) {
	const content = readJson(event.content);
	const listing = content?.listing && typeof content.listing === 'object' ? content.listing : null;
	const dTag = tagValue(event, 'd') || event.id;
	const id = documentId(['listing', event.pubkey, dTag]);
	if (!listing || typeof listing.title !== 'string') return [remove('listings', id)];
	const status = String(listing.status || 'active');
	if (status !== 'active') return [remove('listings', id)];
	const title = String(listing.title);
	const description = String(listing.description || '');
	const location = String(listing.location || '');
	const spanish = spanishSearchText(title, description, {
		category: '',
		subcategory: ''
	});
	return [
		upsert('listings', {
			id,
			public_id: String(dTag),
			address: `31160:${event.pubkey}:${dTag}`,
			event_id: event.id,
			title,
			title_es: spanish.title_es || title,
			description,
			description_es: spanish.description_es || description,
			category: String(listing.category || ''),
			subcategory: String(listing.offer || ''),
			skills: [],
			price_usd: Number(listing.priceUsd) || 0,
			price_sats: Number(listing.priceSats) || 0,
			location,
			location_tokens: locationTokens(location),
			remote: false,
			rating: 0,
			created_at: Number(event.created_at) || Math.floor(now / 1000),
			status,
			pubkey: event.pubkey,
			url: `/browse/goods/${encodeURIComponent(String(dTag))}`
		})
	];
}

/**
 * @param {any} event
 * @param {number} now
 */
function shiftActions(event, now) {
	const content = readJson(event.content);
	const job = content?.job && typeof content.job === 'object' ? content.job : null;
	const dTag = tagValue(event, 'd') || job?.id || event.id;
	const id = documentId(['shift', event.pubkey, dTag]);
	const status = String(job?.status || '').toLowerCase();
	const end = typeof job?.endDate === 'string' ? job.endDate : job?.date;
	const today = new Date(now).toISOString().slice(0, 10);
	const expired = typeof end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end) && end < today;
	if (!job || typeof job.title !== 'string' || status !== 'open' || expired) {
		return [remove('shifts', id)];
	}
	const title = String(job.title);
	const description = String(job.requirements || '');
	const location = String(job.location || '');
	const classified = classifyListing({
		title,
		description,
		searchCategory: 'temp-staff'
	});
	return [
		upsert('shifts', {
			id,
			public_id: String(dTag),
			address: `31150:${event.pubkey}:${dTag}`,
			event_id: event.id,
			title,
			title_es: title,
			description,
			description_es: description,
			category: String(job.role || 'other'),
			subcategory: classified.subcategory,
			skills: [],
			price_usd: Number(job.hourlyRateUsd) || 0,
			price_sats: 0,
			location,
			location_tokens: locationTokens(location),
			remote: false,
			rating: 0,
			created_at: Number(event.created_at) || Math.floor(now / 1000),
			status,
			pubkey: event.pubkey,
			url: `/shifts/${encodeURIComponent(String(dTag))}`
		})
	];
}

/** @param {Array<Array<Record<string, unknown>>>} batches */
export function mergeActions(batches) {
	/** @type {Map<string, Record<string, unknown>>} */
	const byKey = new Map();
	for (const batch of batches) {
		for (const action of batch) {
			const key = `${action.op}:${action.collection}:${action.id || action.filter || ''}`;
			byKey.set(key, action);
		}
	}
	return [...byKey.values()];
}
