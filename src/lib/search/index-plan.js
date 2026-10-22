import { removalForAddress } from './documents.js';
import { actionsFromEvent } from './documents.js';
import { fold } from './taxonomy.js';

const LISTING_KINDS = new Set([31000, 30402, 30403, 31150, 31160]);

/**
 * Catalog kinds first. Kind 0 and 30000 are last, and the backfill requests
 * them only for pubkeys that authored a task or service.
 */
export const INDEXER_KINDS = [31000, 30402, 30403, 31150, 31160, 5, 0, 30000];

/** People kinds. Never a full-relay scan. */
export const PROFILE_INDEX_KINDS = [0, 30000];

/** @param {number} kind */
export function isProfileKind(kind) {
	return kind === 0 || kind === 30000;
}

/** Task and service events. Their pubkeys are the profile backfill. */
export function isAuthorKind(kind) {
	return kind === 31000 || kind === 30402 || kind === 30403;
}

/**
 * @param {any} event
 */
export function authorPubkey(event) {
	if (!isAuthorKind(event?.kind)) return '';
	const pubkey = String(event?.pubkey || '').toLowerCase();
	return /^[a-f0-9]{64}$/.test(pubkey) ? pubkey : '';
}

/**
 * NIP-01 `authors` filters stay small. One author can still have many kind 30000 d-tags.
 * @param {Iterable<string>} pubkeys
 * @param {number} [size]
 */
export function chunkAuthors(pubkeys, size = 50) {
	const list = [...pubkeys].filter(Boolean);
	/** @type {string[][]} */
	const chunks = [];
	for (let index = 0; index < list.length; index += size) {
		chunks.push(list.slice(index, index + size));
	}
	return chunks;
}

const SV_PLACES = [
	'el salvador',
	'san salvador',
	'santa tecla',
	'la libertad',
	'el zonte',
	'la costa',
	'santa ana',
	'sonsonate',
	'san miguel',
	'antiguo cuscatlan'
];

const FOREIGN_PLACES = [
	'united states',
	'united kingdom',
	'estados unidos',
	'texas',
	'austin',
	'spain',
	'espana',
	'mexico',
	'guatemala',
	'honduras',
	'nicaragua',
	'costa rica',
	'france',
	'francia',
	'canada',
	'australia',
	'portugal',
	'dubai',
	'germany',
	'alemania'
];

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function testPubkeysFromEnv(env = {}) {
	return new Set(
		String(env.BITTASKER_TEST_PUBKEYS || '')
			.split(',')
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean)
	);
}

/**
 * @param {any} event
 */
export function replaceableAddress(event) {
	if (!event || !LISTING_KINDS.has(event.kind) || typeof event.pubkey !== 'string') return '';
	const dTag = event.tags?.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return '';
	return `${event.kind}:${event.pubkey}:${dTag}`;
}

/**
 * Kind 0 is one profile per pubkey. Kind 30000 is that person's skill list.
 * @param {any} event
 */
export function profileAddress(event) {
	const pubkey = String(event?.pubkey || '');
	if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) return '';
	if (event.kind === 0) return `0:${pubkey.toLowerCase()}`;
	if (event.kind !== 30000) return '';
	const dTag = event.tags?.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return '';
	return `30000:${pubkey.toLowerCase()}:${dTag}`;
}

/**
 * @param {string} value
 */
function positiveNumber(value) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Every money field has to be a real number above zero. Strings and blanks stay out.
 * @param {number} kind
 * @param {Record<string, any> | null} content
 */
export function hasValidBudget(kind, content) {
	if (!content || typeof content !== 'object') return false;
	if (kind === 31000) {
		const budget = content.budget;
		if (!budget || typeof budget !== 'object' || Array.isArray(budget)) return false;
		return positiveNumber(budget.amount);
	}
	if (kind === 30402 || kind === 30403) {
		const pricing = content.pricing;
		if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return false;
		if (pricing.type === 'HOURLY') return positiveNumber(pricing.hourlyRate);
		if (pricing.type === 'TIERED') {
			if (!Array.isArray(pricing.tiers)) return false;
			return pricing.tiers.some(
				(tier) => tier && typeof tier === 'object' && positiveNumber(tier.price)
			);
		}
		if (pricing.type === 'INQUIRY_REQUIRED') return false;
		return positiveNumber(pricing.amount);
	}
	if (kind === 31150) {
		const job = content.job;
		if (!job || typeof job !== 'object') return false;
		return (
			positiveNumber(job.hourlyRateUsd) &&
			typeof job.title === 'string' &&
			job.title.trim().length > 0
		);
	}
	if (kind === 31160) {
		const listing = content.listing;
		if (!listing || typeof listing !== 'object') return false;
		if (listing.status && listing.status !== 'active') return false;
		return (
			positiveNumber(listing.priceUsd) &&
			typeof listing.title === 'string' &&
			listing.title.trim().length > 0
		);
	}
	return false;
}

/**
 * @param {number} kind
 * @param {Record<string, any>} content
 * @param {number} now
 */
export function isDeadlinePassed(kind, content, now) {
	if (kind === 31000 || kind === 30402 || kind === 30403) {
		const raw = content.deadline || content?.dateRange?.end;
		if (typeof raw !== 'string' || !raw) return false;
		const time = Date.parse(raw);
		return Number.isFinite(time) && time < now;
	}
	if (kind === 31150) {
		const end = content.job?.endDate || content.job?.date;
		if (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
		return end < new Date(now).toISOString().slice(0, 10);
	}
	return false;
}

/**
 * @param {any} event
 * @param {Record<string, any>} content
 * @param {Set<string>} testPubkeys
 */
export function isProbeListing(event, content, testPubkeys) {
	const tags = Array.isArray(event?.tags) ? event.tags : [];
	if (
		tags.some((tag) => tag[0] === 't' && String(tag[1] || '').toLowerCase() === 'bittasker-probe')
	) {
		return true;
	}
	const title = String(content?.title || content?.job?.title || '');
	if (/\bprobes?\b/i.test(title)) return true;
	if (/\bTEST\b/.test(title) || /^test[\s:_-]/i.test(title)) return true;
	const pubkey = String(event?.pubkey || '').toLowerCase();
	return Boolean(pubkey) && testPubkeys.has(pubkey);
}

/**
 * @param {{ title?: string, description?: string, location?: string }} input
 */
export function isNonSvListing(input) {
	const blob = fold([input.title, input.description, input.location].filter(Boolean).join(' '));
	const mentionsSv = SV_PLACES.some((place) => blob.includes(fold(place)));
	const mentionsForeign = FOREIGN_PLACES.some((place) => blob.includes(fold(place)));
	if (mentionsForeign && !mentionsSv) return true;
	if (mentionsSv) return false;
	const place = fold(input.location || '');
	if (!place) return false;
	return !SV_PLACES.some((name) => place.includes(fold(name)));
}

/**
 * @param {number} kind
 * @param {Record<string, any>} content
 */
function placeOf(kind, content) {
	if (kind === 31000) {
		const remote = String(content.taskType || '').toLowerCase() === 'remote';
		const location =
			content.pickupLocation && typeof content.pickupLocation === 'object'
				? String(content.pickupLocation.displayName || '')
				: '';
		return {
			title: String(content.title || ''),
			description: String(content.description || ''),
			location: remote ? '' : location
		};
	}
	if (kind === 30402 || kind === 30403) {
		const types = Array.isArray(content.serviceLocationTypes) ? content.serviceLocationTypes : [];
		const remote =
			types.map((type) => String(type).toLowerCase()).includes('remote') && types.length === 1;
		const details = content.locationDetails;
		let location = '';
		if (details && typeof details === 'object') {
			location = String(
				details.taskeeLocation?.locationDisplayName ||
					details.taskeeLocation?.serviceLocation?.displayName ||
					details.taskerLocation?.serviceLocation?.displayName ||
					''
			);
		}
		return {
			title: String(content.title || ''),
			description: String(content.description || ''),
			location: remote ? '' : location
		};
	}
	if (kind === 31160) {
		const listing = content.listing && typeof content.listing === 'object' ? content.listing : {};
		return {
			title: String(listing.title || ''),
			description: String(listing.description || ''),
			location: String(listing.location || '')
		};
	}
	const job = content.job && typeof content.job === 'object' ? content.job : {};
	return {
		title: String(job.title || ''),
		description: String(job.requirements || ''),
		location: String(job.location || '')
	};
}

/**
 * @param {any} event
 * @param {number} now
 * @param {Set<string>} testPubkeys
 */
export function listingDecision(event, now, testPubkeys) {
	const address = replaceableAddress(event);
	if (!address) return { ok: false, reason: 'address', address: '' };
	let content = null;
	try {
		content = JSON.parse(event.content);
	} catch {
		content = null;
	}
	if (!content || typeof content !== 'object') return { ok: false, reason: 'content', address };
	if (isProbeListing(event, content, testPubkeys)) return { ok: false, reason: 'probe', address };
	if (isDeadlinePassed(event.kind, content, now)) return { ok: false, reason: 'expired', address };
	if (!hasValidBudget(event.kind, content)) return { ok: false, reason: 'budget', address };
	if (isNonSvListing(placeOf(event.kind, content)))
		return { ok: false, reason: 'location', address };
	return { ok: true, reason: 'ok', address };
}

/**
 * Keep the newest created_at per replaceable address, then drop listings the
 * sandbox index must not show. Kind 5 deletes always win.
 *
 * @param {any[]} events
 * @param {number} now
 * @param {Map<string, number>} [seen]
 * @param {{ testPubkeys?: Set<string> }} [options]
 */
export function planIndexBatch(events, now, seen = new Map(), options = {}) {
	const testPubkeys = options.testPubkeys || new Set();
	/** @type {any[]} */
	const deletions = [];
	for (const event of events) {
		if (!event || typeof event !== 'object') continue;
		if (event.kind === 5) {
			deletions.push(event);
			continue;
		}
		const profile = profileAddress(event);
		if (profile) {
			const created = Number(event.created_at) || 0;
			const previous = seen.get(profile);
			if (previous != null && created < previous) continue;
			seen.set(profile, created);
			deletions.push({ kind: 'keep', event });
			continue;
		}
		const address = replaceableAddress(event);
		if (!address) continue;
		const created = Number(event.created_at) || 0;
		const previous = seen.get(address);
		if (previous != null && created < previous) continue;
		const decision = listingDecision(event, now, testPubkeys);
		if (!decision.ok) {
			// A failed shift used to delete the Typesense document. Leave shifts in place.
			if (event.kind === 31150) continue;
			seen.set(address, created);
			deletions.push({ kind: 'drop', address });
			continue;
		}
		seen.set(address, created);
		deletions.push({ kind: 'keep', event });
	}
	/** @type {Array<Record<string, unknown>>} */
	const actions = [];
	for (const item of deletions) {
		if (item.kind === 'drop') actions.push(...removalForAddress(item.address));
		else if (item.kind === 'keep') actions.push(...actionsFromEvent(item.event, { now }));
		else actions.push(...actionsFromEvent(item, { now }));
	}
	return { actions, seen };
}
