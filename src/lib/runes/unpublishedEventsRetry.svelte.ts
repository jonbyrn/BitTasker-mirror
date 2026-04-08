import { browser } from '$app/environment';
import { NDKRelaySet, type NDKEvent, type NDKRelay } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('unpublished-events-retry');

/** How often to look for unpublished events stuck in Dexie (ms). */
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;

class UnpublishedEventsRetry {
	isFlushing = $state(false);

	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {}

	/**
	 * Idempotent. Call after NDK cache + signer are configured (e.g. after {@link setNDKSigner}).
	 */
	start(): void {
		if (!browser) {
			return;
		}
		if (this.intervalId !== null) {
			d.log('start: already running, skipping');
			return;
		}
		d.log('start: monitor enabled', { pollIntervalMs: this.pollIntervalMs });
		void this.poll();
		this.intervalId = setInterval(() => void this.poll(), this.pollIntervalMs);
	}

	/**
	 * Stop the polling loop (e.g. on logout before cache teardown).
	 */
	stop(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			d.log('stop: monitor disabled');
		}
	}

	async poll(): Promise<void> {
		if (!browser || this.isFlushing) {
			return;
		}

		const adapter = ndk.cacheAdapter;
		if (!adapter || typeof adapter.getUnpublishedEvents !== 'function') {
			d.log('poll: skip (no cache adapter or getUnpublishedEvents)');
			return;
		}

		d.log('poll: checking cache for unpublished events');

		this.isFlushing = true;
		try {
			const unpublished = await adapter.getUnpublishedEvents();
			const count = unpublished?.length ?? 0;

			if (count === 0) {
				d.log('poll: no unpublished events');
				return;
			}

			d.log('poll: found unpublished events', { count });

			for (const row of unpublished) {
				const { event, relays } = row;
				const usableRelays = sanitizeRelayUrls(relays);
				await this.retryOne(adapter, event, usableRelays, relays);
			}
		} catch (err) {
			d.error('poll: failed', err);
		} finally {
			this.isFlushing = false;
		}
	}

	private async retryOne(
		adapter: NonNullable<typeof ndk.cacheAdapter>,
		event: NDKEvent,
		usableRelays: WebSocket['url'][],
		rawRelays: WebSocket['url'][] | undefined
	): Promise<void> {
		event.ndk = ndk;
		event.on('relay:published', (relay) => {
			event.emit('published', relay);
		});

		const relaySet =
			usableRelays.length > 0 ? NDKRelaySet.fromRelayUrls(usableRelays, ndk) : undefined;

		try {
			if (rawRelays?.length && usableRelays.length < rawRelays.length) {
				d.log('retry: dropped invalid relay urls', {
					id: event.id,
					before: rawRelays.length,
					after: usableRelays.length
				});
			}
			d.log('retry: publishing', {
				id: event.id,
				relayCount: usableRelays.length > 0 ? usableRelays.length : 'ndk-default'
			});
			const published = await event.publish(relaySet);
			d.log('retry: publish finished', { id: event.id, acceptedRelays: published.size });

			if (!event.id) {
				d.warn('retry: skip discard (event has no id)');
				return;
			}

			if (!shouldClearUnpublished(published, usableRelays)) {
				d.log('retry: not all target relays accepted, keeping unpublished row', {
					id: event.id,
					targetCount: usableRelays.length,
					acceptedCount: published.size
				});
				return;
			}

			if (typeof adapter.discardUnpublishedEvent !== 'function') {
				d.warn('retry: cache has no discardUnpublishedEvent');
				return;
			}

			await Promise.resolve(adapter.discardUnpublishedEvent(event.id));
			d.log('retry: discarded unpublished entry', { id: event.id });
		} catch (err) {
			d.error('retry: publish failed', { id: event.id, err });
		}
	}
}

/**
 * Stale Dexie rows sometimes store garbage relay strings (`"undefined"`, `https://undefined/`, etc.).
 * Strip those before building a relay set or comparing publish results.
 */
function sanitizeRelayUrls(relays: WebSocket['url'][] | undefined): WebSocket['url'][] {
	if (!relays?.length) {
		return [];
	}
	const out: WebSocket['url'][] = [];
	for (const raw of relays) {
		if (typeof raw !== 'string') {
			continue;
		}
		const t = raw.trim();
		if (isUsableRelayUrl(t)) {
			out.push(t as WebSocket['url']);
		}
	}
	return out;
}

function isUsableRelayUrl(t: string): boolean {
	if (!t) {
		return false;
	}
	// Literal garbage from stringified missing env/config
	if (/^undefined$/i.test(t) || /^undfined$/i.test(t)) {
		return false;
	}
	let parsed: URL;
	try {
		parsed = new URL(t);
	} catch {
		return false;
	}
	const host = parsed.hostname.toLowerCase();
	if (!host || host === 'undefined') {
		return false;
	}
	return true;
}

/** Normalize relay URLs for comparison (Dexie map keys vs NDK relay.url). */
function normalizeRelayUrl(url: string): string {
	return url.trim().replace(/\/$/, '');
}

function publishedRelayUrls(published: Set<NDKRelay>): Set<string> {
	return new Set([...published].map((r) => normalizeRelayUrl(r.url)));
}

/**
 * Dexie's `addUnpublishedEvent` attaches `published` only to the original in-memory event.
 * Rehydrated events never get that listener, so we mirror the adapter's "all targets succeeded"
 * rule: clear the row when every stored target relay appears in the publish result.
 */
function shouldClearUnpublished(
	published: Set<NDKRelay>,
	targetRelayUrls: WebSocket['url'][] | undefined
): boolean {
	if (published.size === 0) {
		return false;
	}
	if (!targetRelayUrls || targetRelayUrls.length === 0) {
		// No explicit list on the row — NDK chose relays; any acceptance is enough to drop the retry row.
		return true;
	}
	const accepted = publishedRelayUrls(published);
	return targetRelayUrls.every((url) => accepted.has(normalizeRelayUrl(url)));
}

export const unpublishedEventsRetry = new UnpublishedEventsRetry();
