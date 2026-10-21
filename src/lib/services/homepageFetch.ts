/**
 * SSR-safe homepage data fetcher.
 *
 * Uses nostr-tools SimplePool directly — no NDK, no stores, no auth.
 * Works in both Node.js (SSR/prerendering) and browser.
 */

import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { guardRelaySocket, resolveExplicitRelayUrls } from '$lib/utils/relayUrls';
import { SimplePool } from 'nostr-tools/pool';
import { verifyEvent } from 'nostr-tools/pure';
import type { Event, Filter } from 'nostr-tools';
import type { LiveTask } from '$lib/types/homepage';
import type { FeaturedService } from '$lib/services/featuredServices.service';
import { isJunkListing, isOutsideElSalvador } from '$lib/browse/task-board';

const catalogRelays = listingRelayUrls();
const RELAY_URLS =
	catalogRelays.length > 0
		? catalogRelays
		: resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

const TASK_KIND = 31000;
const SERVICE_KIND = 30402;
const FETCH_TIMEOUT_MS = 8000;

export interface HomepageData {
	tasks: LiveTask[];
	services: FeaturedService[];
}

function parseLiveTask(event: Event): LiveTask | null {
	try {
		const content = JSON.parse(event.content);
		return {
			id: event.id,
			title: content.title || 'Untitled Task',
			budget: parseBudget(content.budget),
			proposals: 0,
			timeLeft: calculateTimeLeft(content.deadline),
			image: extractFirstImage(content.attachments),
			description: content.description || '',
			location:
				content.pickupLocation?.displayName ||
				content.pickupLocation?.formattedAddress ||
				(content.taskType === 'remote' ? 'Remote' : '')
		};
	} catch {
		return null;
	}
}

function parseFeaturedService(event: Event): FeaturedService | null {
	try {
		const content = JSON.parse(event.content);
		const dTag = event.tags.find((t) => t[0] === 'd');
		const serviceId = dTag?.[1] || event.id;

		return {
			id: event.id,
			href: `/services/${encodeURIComponent(serviceId)}`,
			title: content.title || 'Untitled Service',
			description: content.description || 'No description available.',
			priceLabel: parsePriceLabel(content.pricing),
			location: parseServiceLocation(content),
			meta: content.deliveryTime ? [content.deliveryTime] : [],
			image: extractFirstImage(content.portfolio),
			imageAlt: content.title || 'Service image',
			ctaLabel: 'View Service'
		};
	} catch {
		return null;
	}
}

function parseBudget(budget: unknown): number {
	if (!budget || typeof budget !== 'object') return 0;
	const b = budget as { amount?: number; currency?: string };
	if (!b.amount) return 0;
	if (b.currency === 'SATS' || b.currency === 'sats')
		return Math.max(1, Math.round(b.amount / 100000));
	return Math.round(b.amount);
}

function calculateTimeLeft(deadline: string | null | undefined): string {
	if (!deadline) return 'No deadline';
	const diffMs = new Date(deadline).getTime() - Date.now();
	if (diffMs <= 0) return 'Expired';
	const hours = Math.floor(diffMs / 3600000);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
	if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
	const minutes = Math.floor(diffMs / 60000);
	return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function extractFirstImage(attachments: unknown): string {
	if (!Array.isArray(attachments)) return '';
	for (const att of attachments) {
		if (att && typeof att === 'object' && typeof att.url === 'string') {
			const url = att.url;
			if (/\.(jpg|jpeg|png|gif|webp|svg)/i.test(url)) return url;
		}
	}
	return '';
}

function parsePriceLabel(pricing: unknown): string {
	if (!pricing || typeof pricing !== 'object') return 'Request Quote';
	const p = pricing as {
		type?: string;
		amount?: number;
		hourlyRate?: number;
		tiers?: { price?: number }[];
	};
	switch (p.type) {
		case 'fixed':
			return p.amount ? `$${p.amount.toFixed(2)}` : 'Request Quote';
		case 'hourly':
			return p.hourlyRate ? `$${p.hourlyRate.toFixed(2)}/hr` : 'Request Quote';
		case 'tiered': {
			const prices = p.tiers
				?.map((t) => t.price)
				.filter((n): n is number => typeof n === 'number' && n > 0);
			return prices?.length ? `From $${Math.min(...prices).toFixed(2)}` : 'Request Quote';
		}
		default:
			return 'Request Quote';
	}
}

function parseServiceLocation(content: Record<string, unknown>): string {
	const types = content.serviceLocationTypes;
	if (!Array.isArray(types) || types.length === 0) return '';
	if (types.includes('remote')) return 'Remote';
	const loc = content.locationDetails as Record<string, unknown> | undefined;
	if (loc?.taskerLocation) {
		const tl = loc.taskerLocation as Record<string, unknown>;
		const sl = tl.serviceLocation as Record<string, unknown> | undefined;
		return (
			(sl?.displayName as string) || (sl?.formattedAddress as string) || 'At provider location'
		);
	}
	return '';
}

function fetchEventsWithTimeout(
	pool: SimplePool,
	relays: string[],
	filter: Filter,
	timeoutMs: number
): Promise<Event[]> {
	return new Promise((resolve) => {
		const events: Event[] = [];
		const timer = setTimeout(() => resolve(events), timeoutMs);

		pool.subscribe(
			relays,
			{ ...filter, limit: filter.limit || 20 },
			{
				onevent(event: Event) {
					if (verifyEvent(event)) events.push(event);
				},
				oneose() {
					clearTimeout(timer);
					resolve(events);
				}
			}
		);
	});
}

export async function fetchHomepageData(limit = 8): Promise<HomepageData> {
	if (RELAY_URLS.length === 0) {
		return { tasks: [], services: [] };
	}

	guardRelaySocket();
	const pool = new SimplePool();

	try {
		const [rawTasks, rawServices] = await Promise.all([
			fetchEventsWithTimeout(
				pool,
				RELAY_URLS,
				{ kinds: [TASK_KIND], limit: Math.max(limit * 6, 48) },
				FETCH_TIMEOUT_MS
			),
			fetchEventsWithTimeout(
				pool,
				RELAY_URLS,
				{ kinds: [SERVICE_KIND], limit: Math.max(limit * 3, 24) },
				FETCH_TIMEOUT_MS
			)
		]);

		const tasks = rawTasks
			.map(parseLiveTask)
			.filter(
				(task): task is LiveTask =>
					task !== null && !isJunkListing(task) && !isOutsideElSalvador(task)
			)
			.sort((a, b) => (b.budget || 0) - (a.budget || 0))
			.slice(0, limit);

		const services = rawServices
			.map(parseFeaturedService)
			.filter(
				(service): service is FeaturedService =>
					service !== null && !isJunkListing(service) && !isOutsideElSalvador(service)
			)
			.slice(0, limit);

		return { tasks, services };
	} catch (err) {
		console.error('[fetchHomepageData]', err);
		return { tasks: [], services: [] };
	} finally {
		pool.close(RELAY_URLS);
	}
}
