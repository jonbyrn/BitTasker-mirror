import type { Task } from '$lib/types/task.d';
import { isSvPlace } from '$lib/browse/places.js';
import { isFeaturedTestTask } from '$lib/services/featuredTestListing';
import { suggestCategory } from '$lib/search/taxonomy.js';
import { displayTaskStatus } from '$lib/utils/helpers/taskDeadline';

/** Newest-first pages. Live tasks sit behind a run of expired probes. */
export const BROWSE_CATALOG_PAGE = 80;
export const BROWSE_CATALOG_PAGES = 6;

export type CatalogPage<T> = {
	items: T[];
	/** The relay returned a full event page, even when few of them are tasks. */
	filled?: boolean;
	oldestCreatedAt?: number | null;
};

/** El Salvador first, then the rest of Latin America. */
const LATAM: { code: string; rank: number; names: string[] }[] = [
	{ code: 'SV', rank: 0, names: ['el salvador', 'san salvador'] },
	{ code: 'GT', rank: 1, names: ['guatemala'] },
	{ code: 'HN', rank: 2, names: ['honduras'] },
	{ code: 'NI', rank: 3, names: ['nicaragua'] },
	{ code: 'CR', rank: 4, names: ['costa rica'] },
	{ code: 'PA', rank: 5, names: ['panama'] },
	{ code: 'MX', rank: 6, names: ['mexico', 'méxico'] },
	{ code: 'BZ', rank: 7, names: ['belize', 'belice'] },
	{ code: 'CO', rank: 8, names: ['colombia'] },
	{ code: 'VE', rank: 9, names: ['venezuela'] },
	{ code: 'EC', rank: 10, names: ['ecuador'] },
	{ code: 'PE', rank: 11, names: ['peru', 'perú'] },
	{ code: 'BO', rank: 12, names: ['bolivia'] },
	{ code: 'PY', rank: 13, names: ['paraguay'] },
	{ code: 'CL', rank: 14, names: ['chile'] },
	{ code: 'AR', rank: 15, names: ['argentina'] },
	{ code: 'UY', rank: 16, names: ['uruguay'] },
	{ code: 'BR', rank: 17, names: ['brazil', 'brasil'] },
	{
		code: 'DO',
		rank: 18,
		names: ['dominican republic', 'republica dominicana', 'república dominicana']
	}
];

const EXTRA_FOREIGN = [
	'austria',
	'portugal',
	'sweden',
	'suecia',
	'ireland',
	'irlanda',
	'italy',
	'italia',
	'dubai'
];

/** Towns and departments in El Salvador. Checked after a foreign country name. */
const SV_PLACES = [
	'el salvador',
	'san salvador',
	'santa tecla',
	'la libertad',
	'santa ana',
	'sonsonate',
	'usulutan',
	'san miguel',
	'ahuachapan',
	'chalatenango',
	'cuscatlan',
	'cabana',
	'morazan',
	'la paz',
	'la union',
	'san vicente',
	'antiguo cuscatlan',
	'nuevo cuscatlan',
	'el zonte',
	'el tunco',
	'san blas',
	'lourdes',
	'escalon',
	'conchalio',
	'chiltiupan',
	'ciudad arce',
	'la costa'
];

const ELSEWHERE = [
	'egypt',
	'egipto',
	'united states',
	'united kingdom',
	'estados unidos',
	'españa',
	'spain',
	'france',
	'francia',
	'germany',
	'alemania',
	'canada',
	'canadá',
	'australia',
	'india',
	'nigeria',
	'philippines',
	'filipinas',
	'china',
	'japan',
	'japon'
];

/** San Salvador. Distance sort uses this when the browser has no position. */
export const HOME_ORIGIN = { latitude: 13.6929, longitude: -89.2182 };

function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function placeText(task: Task): string {
	const places = [task.pickupLocation, task.dropOffLocation];
	return places
		.flatMap((place) => [
			place?.addressComponents?.country,
			place?.displayName,
			place?.formattedAddress
		])
		.filter((part): part is string => Boolean(part && part.trim()))
		.join(' ');
}

export function taskCountryCode(task: Task): string | null {
	const blob = fold(placeText(task));
	if (!blob) return null;
	for (const country of LATAM) {
		if (country.names.some((name) => blob.includes(fold(name)))) return country.code;
	}
	return null;
}

/** Euros and named places outside Latin America stay off the El Salvador board. */
export function mentionsForeignListing(parts: Array<string | null | undefined>): boolean {
	const text = fold(parts.filter((part) => part && part.trim()).join(' '));
	if (!text) return false;
	if (/\beuros?\b/.test(text) || text.includes('€')) return true;
	return ELSEWHERE.some((name) => text.includes(fold(name)));
}

function namesNonSvCountry(text: string): boolean {
	const folded = fold(text);
	if (!folded) return false;
	for (const country of LATAM) {
		if (country.code === 'SV') continue;
		if (country.names.some((name) => folded.includes(fold(name)))) return true;
	}
	return [...ELSEWHERE, ...EXTRA_FOREIGN].some((name) => folded.includes(fold(name)));
}

export function taskBrowseLocation(task: Task): string {
	return placeText(task);
}

/** A named place outside El Salvador. A blank place stays, so remote work still shows. */
export function isOutsideElSalvador(input: {
	title?: string | null;
	description?: string | null;
	location?: string | null;
}): boolean {
	const blob = [input.title, input.description, input.location]
		.filter((part) => part && part.trim())
		.join(' ');
	if (mentionsForeignListing([blob]) || namesNonSvCountry(blob)) return true;
	const place = input.location || '';
	if (!fold(place)) return false;
	return !isSvPlace(place);
}

/**
 * Show expired is off until the visitor checks it.
 * Checked keeps expired rows. Unchecked hides them.
 */
export function passesShowExpired(showExpired: boolean, expired: boolean): boolean {
	return showExpired || !expired;
}

export function isOverseasTour(input: {
	title?: string | null;
	description?: string | null;
	location?: string | null;
}): boolean {
	const text = `${input.title ?? ''}\n${input.description ?? ''}`;
	if (!/\b(tours?|turismo|excursi[oó]n|overseas)\b/i.test(text)) return false;
	return isOutsideElSalvador(input);
}

const BROWSE_JUNK = [
	/help me destroy the ai overlords/i,
	/\b(dame|deme)\s+\d+\s+estrellas?\b/i,
	/\bprueba\s+darme\b/i,
	/\b(give me|gimme)\s+\d+\s+stars?\b/i,
	/\b(a\s+)?(new\s+)?test\s+tasks?\b/i,
	/\b(tiered|another|book[-\s]?now)\s+test\b/i,
	/\btest\s+services?\b/i,
	/\b(test|testing|teste)\s+(listing|task|service|post|item|shift|title)s?\b/i,
	/\b(listing|task|service|post|item|shift)\s+(test|testing|teste)s?\b/i,
	/\b(smoke|qa|e2e)\s*tests?\b/i,
	/\bprobe\s+(listing|task|service|post|item|shift|title)s?\b/i,
	/\b(test|testing)\s+probe\b/i,
	/\b(dummy|placeholder|lorem ipsum|asdf+|qwerty+|zxcv+)\b/i,
	/\bquote\s+services?\b/i,
	/\bp2p\s+electronic\s+cash\b/i,
	/peer-to-peer electronic cash/i
];

const KEYBOARD_ROWS = /^(?:qwertyuiop|asdfghjkl|zxcvbnm|qwerty|asdf|zxcv)+$/;

/** Titles that are keyboard mash, repeated characters, or almost no vowels. */
export function isGibberishTitle(title: string): boolean {
	if (isKeyboardMash(title)) return true;
	const letters = title
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z]/g, '');
	if (letters.length < 5) return false;
	if (/(.)\1{4,}/.test(letters)) return true;
	if (KEYBOARD_ROWS.test(letters)) return true;
	if (!/[aeiou]/.test(letters)) return true;
	const vowels = letters.match(/[aeiou]/g)?.length ?? 0;
	return letters.length >= 8 && vowels / letters.length < 0.15;
}

const GENERIC_TITLES = /^(quote service|service quote|untitled|sin titulo|n\/a|asdf|qwerty)$/i;

const MASH_PAIRS = ['hs', 'sh', 'as', 'df', 'qw', 'zx', 'jk', 'hj', 'kl', 'fg'];

/** Repeated key-pairs and two-key mash such as hshshsh. Real words stay. */
export function isKeyboardMash(title: string): boolean {
	const compact = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z]/g, '');
	if (compact.length < 5 || /\s/.test(title.trim())) return false;
	if (/^(.)\1+$/.test(compact)) return true;
	if (new RegExp(`^(?:${MASH_PAIRS.join('|')})+$`).test(compact)) return true;
	const letters = new Set(compact);
	if (letters.size !== 2) return false;
	const pair = [...letters].sort().join('');
	return MASH_PAIRS.some((item) => [...item].sort().join('') === pair);
}

function isGenericBrowseTitle(title: string): boolean {
	const text = title.replace(/\s+/g, ' ').trim();
	if (!text) return false;
	if (GENERIC_TITLES.test(text)) return true;
	const letters = text.replace(/[^a-z]/gi, '');
	return letters.length > 0 && letters.length <= 2;
}

/** Probe posts, star-begging titles, and tours outside El Salvador. Client-side only. */
export function isJunkListing(input: {
	title?: string | null;
	description?: string | null;
	location?: string | null;
}): boolean {
	const text = `${input.title ?? ''}\n${input.description ?? ''}`;
	if (BROWSE_JUNK.some((pattern) => pattern.test(text))) return true;
	if (
		isKeyboardMash(input.title ?? '') ||
		isGibberishTitle(input.title ?? '') ||
		isGenericBrowseTitle(input.title ?? '')
	)
		return true;
	return isFeaturedTestTask(input) || isOverseasTour(input);
}

/**
 * Dollar amount for the browse floor.
 * USD and USDT are already dollars. Sats use the same 100,000-sat dollar as task prices.
 * Other units are not treated as dollars.
 */
export function listedUsdAmount(
	amount: number | null | undefined,
	currency?: string | null
): number | null {
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
	const code = String(currency || 'USD')
		.trim()
		.toUpperCase();
	if (code === 'USD' || code === 'USDT') return Math.round(amount * 100) / 100;
	if (code === 'SAT' || code === 'SATS') return Math.round((amount / 100_000) * 100) / 100;
	return null;
}

/** Browse default only. Under $5, a migration or AI automation under $15. Temp staff rates stay. */
export function isImplausibleBrowsePrice(input: {
	title?: string | null;
	description?: string | null;
	amount?: number | null;
	currency?: string | null;
	category?: string | null;
}): boolean {
	const amount = listedUsdAmount(input.amount, input.currency);
	if (amount == null) return false;
	const title = input.title ?? '';
	const category =
		input.category ||
		suggestCategory({ title, description: input.description ?? '' }).category;
	if (category === 'temp-staff') return false;
	if (amount < 5) return true;
	if (/\b(migrat\w*|migraci[oó]n|database|base de datos)\b/i.test(title) && amount < 15)
		return true;
	if (/\b(automatizaci[oó]n|ai agent|agent orchestration)\b/i.test(title) && amount < 15)
		return true;
	return false;
}

/**
 * Sandbox demo prices only. A real low quote, including a multi-thousand
 * peer-to-peer task, stays visible. Nothing is deleted from the relay.
 */
export function isUnrealisticDemoPrice(input: {
	title?: string | null;
	amount?: number | null;
}): boolean {
	const amount = input.amount;
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return false;
	const title = (input.title ?? '').replace(/\s+/g, ' ').trim();
	if (amount < 1) return true;
	if (amount >= 1_000_000) return true;
	const rounded = Math.round(amount);
	if (/^(\d)\1{5,}$/.test(String(rounded))) return true;
	if (rounded === 123456 || rounded === 123456789 || rounded === 999999 || rounded === 9999999)
		return true;
	if (amount <= 2 && /\b(sofa|couch|sill[oó]n)\b/i.test(title)) return true;
	if (/^empresarial$/i.test(title) && amount >= 2000) return true;
	return false;
}

export function isHomeRegionTask(task: Task): boolean {
	if (mentionsForeignListing([task.title, task.description])) return false;
	if (taskCountryCode(task)) return true;
	const blob = fold(placeText(task));
	if (!blob) return true;
	if (ELSEWHERE.some((name) => blob.includes(fold(name)))) return false;
	return false;
}

export function isZeroPricedTask(task: Task): boolean {
	const amount = task.budget?.amount;
	return typeof amount === 'number' && amount <= 0;
}

function sameText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Latest replaceable event for a d-tag. The same author keeps the newest
 * copy. A different pubkey only wins when it published first.
 */
export function dedupeReplaceableTasks<T extends { id: string; npub: string; createdAt?: number }>(
	tasks: readonly T[]
): T[] {
	const byId = new Map<string, T>();
	for (const task of tasks) {
		const existing = byId.get(task.id);
		if (!existing) {
			byId.set(task.id, task);
			continue;
		}
		const nextAt = task.createdAt ?? 0;
		const prevAt = existing.createdAt ?? 0;
		if (task.npub === existing.npub) {
			if (nextAt >= prevAt) byId.set(task.id, task);
		} else if (nextAt < prevAt) {
			byId.set(task.id, task);
		}
	}
	return [...byId.values()];
}

/** One USD figure for browse rows, tiles, and category lists. */
export function taskPriceUsd(task: {
	budget?: { amount?: number; currency?: string } | null;
}): number {
	const amount = task.budget?.amount;
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
	const currency = String(task.budget?.currency || 'USD')
		.trim()
		.toUpperCase();
	const usd = currency === 'SATS' || currency === 'SAT' ? amount / 100_000 : amount;
	return Math.round(usd * 100) / 100;
}

/** $20 or $9.63. The same string on every surface. */
export function formatTaskPrice(amount: number): string {
	if (!(amount > 0) || !Number.isFinite(amount)) return '';
	const rounded = Math.round(amount * 100) / 100;
	const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
	return `$${text}`;
}

function withUsdPrice(task: Task): Task {
	const usd = taskPriceUsd(task);
	if (!task.budget) return task;
	return { ...task, budget: { ...task.budget, amount: usd, currency: 'USD' } };
}

/**
 * Worker board (/tasks). Hides junk, zero and demo prices, and expired open tasks.
 * A United States place stays unless the listing also matches the junk filter.
 * Real tasks are not geo-blocked, and nothing is deleted from the relay.
 */
export function isHiddenWorkerTask(task: Task, now: Date = new Date()): boolean {
	const location = taskBrowseLocation(task);
	if (isJunkListing({ title: task.title, description: task.description, location })) return true;
	if (isZeroPricedTask(task)) return true;
	if (isUnrealisticDemoPrice({ title: task.title, amount: taskPriceUsd(task) })) return true;
	// The worker board lists open tasks. Expired open tasks and other statuses stay off it.
	if (String(task.status || '').toUpperCase() !== 'OPEN') return true;
	if (displayTaskStatus(task, now) === 'EXPIRED') return true;
	return false;
}

export function visibleWorkerTasks<T extends Task>(
	tasks: readonly T[],
	now: Date = new Date()
): T[] {
	return tasks.filter((task) => !isHiddenWorkerTask(task, now));
}

/**
 * Open catalog rows. Browse, homepage tiles, and category lists all call this.
 * Same events, same replaceable-event dedupe, same expiry rule, same USD price.
 */
export function selectSharedTasks(
	tasks: readonly Task[],
	options: { allCountries?: boolean; includeExpired?: boolean; now?: Date } = {}
): Task[] {
	const now = options.now ?? new Date();
	const open = dedupeReplaceableTasks(tasks)
		.map(withUsdPrice)
		.filter((task) => String(task.status || '').toUpperCase() === 'OPEN');
	const prepared = prepareBrowseTasks(open, { allCountries: options.allCountries ?? false });
	if (options.includeExpired) return prepared;
	return prepared.filter((task) => displayTaskStatus(task, now) !== 'EXPIRED');
}

/** Keep the newest copy when one person posted the same title and description twice. */
export function dedupeIdenticalTasks(tasks: Task[]): Task[] {
	const kept = new Map<string, Task>();
	for (const task of tasks) {
		const key = `${task.npub}|${sameText(task.title)}|${sameText(task.description)}`;
		const existing = kept.get(key);
		if (!existing || (task.createdAt ?? 0) >= (existing.createdAt ?? 0)) kept.set(key, task);
	}
	return [...kept.values()];
}

function coordinates(task: Task): { latitude: number; longitude: number } | null {
	const place = task.pickupLocation ?? task.dropOffLocation;
	const latitude = place?.latitude;
	const longitude = place?.longitude;
	if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude === 0 && longitude === 0) return null;
	return { latitude, longitude };
}

function distanceKm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number }
): number {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const earth = 6371;
	const dLat = radians(to.latitude - from.latitude);
	const dLon = radians(to.longitude - from.longitude);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
	return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function countryRank(task: Task): number {
	const code = taskCountryCode(task);
	return LATAM.find((country) => country.code === code)?.rank ?? 100;
}

/**
 * Expired rows stay hidden until the visitor checks Show expired.
 * A catalog that is entirely expired does not turn that checkbox on.
 */
export function shouldOfferExpired(
	live: number,
	expired: number,
	showExpired: boolean,
	alreadyOffered: boolean
): boolean {
	void live;
	void expired;
	void showExpired;
	void alreadyOffered;
	return false;
}

export function prepareBrowseTasks(
	tasks: Task[],
	options: { allCountries: boolean; origin?: { latitude: number; longitude: number } }
): Task[] {
	const origin = options.origin ?? HOME_ORIGIN;
	const visible = dedupeIdenticalTasks(tasks.filter((task) => !isZeroPricedTask(task))).filter(
		(task) => {
			const listing = {
				title: task.title,
				description: task.description,
				location: taskBrowseLocation(task)
			};
			if (isJunkListing(listing)) return false;
			if (isUnrealisticDemoPrice({ title: task.title, amount: task.budget?.amount })) return false;
			if (
				isImplausibleBrowsePrice({
					title: task.title,
					amount: task.budget?.amount,
					currency: task.budget?.currency
				})
			)
				return false;
			return options.allCountries || !isOutsideElSalvador(listing);
		}
	);
	return visible.sort((left, right) => {
		const leftDistance = coordinates(left);
		const rightDistance = coordinates(right);
		if (leftDistance && rightDistance) {
			const gap = distanceKm(origin, leftDistance) - distanceKm(origin, rightDistance);
			if (gap !== 0) return gap;
		} else if (leftDistance) return -1;
		else if (rightDistance) return 1;
		const rank = countryRank(left) - countryRank(right);
		if (rank !== 0) return rank;
		return (right.createdAt ?? 0) - (left.createdAt ?? 0);
	});
}

/** How many prepared rows are still open. A missing deadline counts as live. */
export function browseLiveCount(
	tasks: Task[],
	allCountries: boolean
): { live: number; expired: number } {
	const prepared = prepareBrowseTasks(
		tasks.filter((task) => task.status === 'OPEN'),
		{ allCountries }
	);
	let live = 0;
	let expired = 0;
	for (const task of prepared) {
		if (displayTaskStatus(task) === 'EXPIRED') expired += 1;
		else live += 1;
	}
	return { live, expired };
}

/** Keep a streamed batch when a later timeout resolves to nothing. */
export function keepLoadedRows<T>(current: readonly T[], next: readonly T[]): T[] {
	if (next.length === 0 && current.length > 0) return [...current];
	return [...next];
}

/** The next `until` cursor, or null when this page is the end of the catalog. */
export function nextCatalogUntil(
	page: ReadonlyArray<{ createdAt?: number | null }>,
	pageSize: number
): number | null {
	if (page.length < pageSize) return null;
	let oldest: number | null = null;
	for (const item of page) {
		if (typeof item.createdAt !== 'number') continue;
		if (oldest === null || item.createdAt < oldest) oldest = item.createdAt;
	}
	if (oldest === null) return null;
	return oldest - 1;
}

/**
 * Page newest-first until a non-expired row appears.
 * The first page is often probes and past deadlines.
 */
function oldestCreatedAt<T extends { createdAt?: number | null }>(
	items: readonly T[]
): number | null {
	let oldest: number | null = null;
	for (const item of items) {
		if (typeof item.createdAt !== 'number') continue;
		if (oldest === null || item.createdAt < oldest) oldest = item.createdAt;
	}
	return oldest;
}

function catalogPage<T extends { createdAt?: number | null }>(
	batch: T[] | CatalogPage<T>,
	pageSize: number
): { items: T[]; filled: boolean; oldestCreatedAt: number | null } {
	if (Array.isArray(batch)) {
		return {
			items: batch,
			filled: batch.length >= pageSize,
			oldestCreatedAt: oldestCreatedAt(batch)
		};
	}
	return {
		items: batch.items,
		filled: batch.filled ?? batch.items.length >= pageSize,
		oldestCreatedAt: batch.oldestCreatedAt ?? oldestCreatedAt(batch.items)
	};
}

export async function scanCatalogUntilLive<
	T extends { id?: string; createdAt?: number | null }
>(options: {
	pageSize: number;
	maxPages: number;
	fetchPage: (until: number | undefined) => Promise<T[] | CatalogPage<T>>;
	hasLive: (collected: T[]) => boolean;
}): Promise<T[]> {
	const collected: T[] = [];
	const seen = new Set<string>();
	let until: number | undefined;
	for (let page = 0; page < options.maxPages; page += 1) {
		const batch = catalogPage(await options.fetchPage(until), options.pageSize);
		if (batch.items.length === 0 && !batch.filled) break;
		for (const item of batch.items) {
			const id = item.id ?? '';
			if (id && seen.has(id)) continue;
			if (id) seen.add(id);
			collected.push(item);
		}
		if (options.hasLive(collected)) break;
		if (!batch.filled || batch.oldestCreatedAt == null) break;
		until = batch.oldestCreatedAt - 1;
	}
	return collected;
}
