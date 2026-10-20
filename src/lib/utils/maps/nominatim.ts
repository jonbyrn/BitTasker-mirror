/**
 * Nominatim search for listing pins that have place text but no usable coordinates.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * at most one request per second, a real application User-Agent, a Referer for
 * website use, and cached results including empty lookups.
 * Hits stay cached for 30 days. Misses stay cached for 1 day.
 * Browsers drop the User-Agent header; the Referer fetch option still identifies
 * the site. Non-browser callers send both.
 */

import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_USER_AGENT = 'BitTasker/1.0 (+https://bittasker.com; listing-map)';
export const NOMINATIM_REFERER = 'https://bittasker.com/';
export const NOMINATIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const NOMINATIM_NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOMINATIM_MIN_INTERVAL_MS = 1000;
const STORAGE_KEY = 'bittasker.map.nominatim.v1';

export interface NominatimHit {
	latitude: number;
	longitude: number;
}

interface CacheEntry {
	latitude: number | null;
	longitude: number | null;
	expiresAt: number;
}

interface NominatimDeps {
	fetch: typeof fetch;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
	ttlMs: number;
	negativeTtlMs: number;
	intervalMs: number;
	userAgent: string;
	referer: string;
}

/** Bumps when a lookup finishes so maps can read the cache again. */
export const geocodeEpoch = writable(0);

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<NominatimHit | null>>();
let storageLoaded = false;
let queue: Promise<void> = Promise.resolve();
let hasStarted = false;
let lastStartedAt = 0;

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
	if (!browser || typeof localStorage === 'undefined') return null;
	return localStorage;
}

let deps: NominatimDeps = {
	fetch: globalThis.fetch.bind(globalThis),
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	storage: null,
	ttlMs: NOMINATIM_TTL_MS,
	negativeTtlMs: NOMINATIM_NEGATIVE_TTL_MS,
	intervalMs: NOMINATIM_MIN_INTERVAL_MS,
	userAgent: NOMINATIM_USER_AGENT,
	referer: NOMINATIM_REFERER
};

function activeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
	return deps.storage ?? defaultStorage();
}

export function normalizeGeocodeQuery(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Longest distinct label, which usually includes the city and country. */
export function listingGeocodeQuery(labels: string[]): string | null {
	const unique: string[] = [];
	const seen = new Set<string>();
	for (const label of labels) {
		const trimmed = label?.trim();
		if (!trimmed) continue;
		const normalized = normalizeGeocodeQuery(trimmed);
		if (normalized.length < 3 || seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(trimmed.slice(0, 200));
	}
	if (unique.length === 0) return null;
	unique.sort((left, right) => right.length - left.length);
	return unique[0];
}

function loadStorage(): void {
	if (storageLoaded) return;
	storageLoaded = true;
	const storage = activeStorage();
	if (!storage) return;
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
		for (const [key, entry] of Object.entries(parsed)) {
			if (!entry || typeof entry.expiresAt !== 'number') continue;
			memory.set(key, entry);
		}
	} catch {
		// Corrupt cache stays empty. The next successful lookup rewrites it.
	}
}

function persistStorage(): void {
	const storage = activeStorage();
	if (!storage) return;
	const payload: Record<string, CacheEntry> = {};
	for (const [key, entry] of memory) payload[key] = entry;
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Memory cache still serves this session when storage is full or blocked.
	}
}

function readEntry(query: string): CacheEntry | null {
	loadStorage();
	const key = normalizeGeocodeQuery(query);
	const entry = memory.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= deps.now()) {
		memory.delete(key);
		persistStorage();
		return null;
	}
	return entry;
}

function writeEntry(query: string, hit: NominatimHit | null): void {
	loadStorage();
	memory.set(normalizeGeocodeQuery(query), {
		latitude: hit?.latitude ?? null,
		longitude: hit?.longitude ?? null,
		expiresAt: deps.now() + (hit ? deps.ttlMs : deps.negativeTtlMs)
	});
	persistStorage();
	geocodeEpoch.update((value) => value + 1);
}

function entryHit(entry: CacheEntry): NominatimHit | null {
	if (entry.latitude == null || entry.longitude == null) return null;
	return { latitude: entry.latitude, longitude: entry.longitude };
}

async function requestNominatim(query: string): Promise<NominatimHit | null> {
	const url = new URL(NOMINATIM_SEARCH_URL);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');
	url.searchParams.set('addressdetails', '0');
	url.searchParams.set('q', query);
	const response = await deps.fetch(url.toString(), {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'User-Agent': deps.userAgent,
			Referer: deps.referer
		},
		referrer: deps.referer
	});
	if (!response.ok) throw new Error(`Nominatim ${response.status}`);
	const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
	const first = body[0];
	const latitude = first ? Number(first.lat) : Number.NaN;
	const longitude = first ? Number(first.lon) : Number.NaN;
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
	return { latitude, longitude };
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(async () => {
		if (hasStarted) {
			const wait = Math.max(0, deps.intervalMs - (deps.now() - lastStartedAt));
			if (wait > 0) await deps.sleep(wait);
		}
		hasStarted = true;
		lastStartedAt = deps.now();
		return task();
	});
	queue = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

function schedule(query: string): Promise<NominatimHit | null> {
	const key = normalizeGeocodeQuery(query);
	const existing = inflight.get(key);
	if (existing) return existing;
	if (!browser) return Promise.resolve(null);
	const pending = enqueue(async () => {
		try {
			const hit = await requestNominatim(query);
			writeEntry(query, hit);
			return hit;
		} catch {
			return null;
		} finally {
			inflight.delete(key);
		}
	});
	inflight.set(key, pending);
	return pending;
}

/**
 * Cached hit, or null when the query is unknown, negative, or still in flight.
 * A miss schedules one shared Nominatim request.
 */
export function lookupNominatim(query: string): NominatimHit | null {
	const entry = readEntry(query);
	if (entry) return entryHit(entry);
	void schedule(query);
	return null;
}

/** Wait for the shared rate-limited lookup. Save uses this; map views stay synchronous. */
export async function geocodeWithNominatim(query: string): Promise<NominatimHit | null> {
	const entry = readEntry(query);
	if (entry) return entryHit(entry);
	return schedule(query);
}

export function whenNominatimSettled(): Promise<void> {
	return queue;
}

export function resetNominatimForTests(options?: Partial<NominatimDeps>): void {
	memory.clear();
	inflight.clear();
	storageLoaded = false;
	queue = Promise.resolve();
	hasStarted = false;
	lastStartedAt = 0;
	geocodeEpoch.set(0);
	deps = {
		fetch: globalThis.fetch.bind(globalThis),
		now: () => Date.now(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		storage: null,
		ttlMs: NOMINATIM_TTL_MS,
		negativeTtlMs: NOMINATIM_NEGATIVE_TTL_MS,
		intervalMs: NOMINATIM_MIN_INTERVAL_MS,
		userAgent: NOMINATIM_USER_AGENT,
		referer: NOMINATIM_REFERER,
		...options
	};
}

/** Drop the memory copy so the next lookup reloads localStorage. */
export function forgetNominatimMemory(): void {
	memory.clear();
	storageLoaded = false;
}
