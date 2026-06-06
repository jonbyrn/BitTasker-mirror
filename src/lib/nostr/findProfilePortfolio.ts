import type { PortfolioItem, NostrProfileImage } from '$lib/types/profile.d';
import type { Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

const DELETION_CACHE_TTL = 5 * 60 * 1000;

const deletionCache = new Map<string, { deletedIds: Set<string>; timestamp: number }>();

function normalizeAuthorPubkey(authorPubkey: string): string {
	const trimmedValue = authorPubkey.trim();
	if (!trimmedValue) {
		throw new Error('Author pubkey is required.');
	}

	if (trimmedValue.startsWith('npub1')) {
		const decoded = nip19.decode(trimmedValue);
		if (decoded.type !== 'npub') {
			throw new Error('Invalid npub identifier.');
		}
		return decoded.data;
	}

	return trimmedValue;
}

function parsePortfolioEvent(event: {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	content: string;
	tags: string[][];
}): PortfolioItem | null {
	try {
		const contentData = JSON.parse(event.content);
		return {
			id: event.id,
			title: String(contentData.title ?? ''),
			description: String(contentData.description ?? ''),
			images: (contentData.images as NostrProfileImage[]) ?? [],
			completionDate: String(contentData.completionDate ?? ''),
			skills: (contentData.skills as string[]) ?? [],
			link: typeof contentData.link === 'string' ? contentData.link : '',
			category: typeof contentData.category === 'string' ? contentData.category : undefined
		};
	} catch (err) {
		console.warn('Failed to parse portfolio event:', err);
		return null;
	}
}

async function getDeletedPortfolioIds(): Promise<Set<string>> {
	const cacheKey = 'deleted_profile_portfolio';
	const cached = deletionCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < DELETION_CACHE_TTL) {
		return cached.deletedIds;
	}

	const filter: Filter = {
		kinds: [5],
		'#k': [KINDS.PROFILE_PORTFOLIO.toString()],
		limit: 1000
	};

	const response = await nostrEventsService.requestEvents({
		filters: [filter]
	});

	const deletedIds = new Set<string>();
	for (const event of response.data ?? []) {
		for (const tag of event.tags) {
			if (tag[0] === 'e' && tag[1]) {
				deletedIds.add(tag[1]);
			}
		}
	}

	deletionCache.set(cacheKey, {
		deletedIds,
		timestamp: Date.now()
	});

	return deletedIds;
}

function dedupePortfolioItems(items: PortfolioItem[]): PortfolioItem[] {
	const deduped = new Map<string, PortfolioItem>();

	for (const item of items) {
		const dedupeKey = item.id || item.title;
		const existing = deduped.get(dedupeKey);
		if (!existing) {
			deduped.set(dedupeKey, item);
		}
	}

	return Array.from(deduped.values());
}

export async function findProfilePortfolioByAuthor(
	authorPubkey: string,
	options: {
		limit?: number;
	} = {}
): Promise<PortfolioItem[]> {
	const normalizedPubkey = normalizeAuthorPubkey(authorPubkey);

	const response = await nostrEventsService.requestEvents({
		filters: [
			{
				kinds: [KINDS.PROFILE_PORTFOLIO],
				authors: [normalizedPubkey],
				limit: options.limit ?? 50
			}
		]
	});

	const deletedIds = await getDeletedPortfolioIds();

	const portfolioItems = dedupePortfolioItems(
		(response.data ?? [])
			.map((event) => parsePortfolioEvent(event))
			.filter((item): item is PortfolioItem => item !== null)
	).filter((item) => !deletedIds.has(item.id!));

	return portfolioItems;
}
