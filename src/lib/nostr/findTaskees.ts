/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Event, Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';

// Types
export interface TaskeeProfile {
	npub: string;
	name?: string;
	about?: string;
	picture?: string;
	professionalTitle?: string;
	skills?: string[];
	createdAt?: string;
}

export interface SearchTaskeesParams {
	page?: number;
	limit?: number;
	search?: string;
	skills?: string[];
	professionalTitle?: string;
	location?: string;
	radius?: number; // Search radius in km
	minRating?: number;
	createdAfter?: string; // ISO date string
}

interface TaskeeStoreState {
	items: TaskeeProfile[];
	loading: boolean;
	error: string | null;
	currentPage: number;
	hasMore: boolean;
}

// Constants
const BATCH_SIZE = 20; // Default taskees limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache
const cache = new Map<string, { data: TaskeeProfile[]; timestamp: number }>();

// Create the store
const initialState: TaskeeStoreState = {
	items: [],
	loading: false,
	error: null,
	currentPage: 1,
	hasMore: true
};

export const taskeeStore = writable<TaskeeStoreState>(initialState);

/**
 * Convert search params to Nostr filter
 */
function createTaskeeFilter(params: SearchTaskeesParams): Filter {
	const filter: Filter & { [key: string]: any } = {
		kinds: [KINDS.PROFILE_METADATA], // Kind 0 for profile metadata
		limit: params.limit || BATCH_SIZE
	};

	// Add NIP-50 search support
	if (params.search) {
		filter.search = params.search.trim();
	}

	return filter;
}

/**
 * Convert a Nostr event to a TaskeeProfile
 */
async function convertEventToTaskee(event: Event): Promise<TaskeeProfile | null> {
	try {
		// Parse profile metadata
		const content = JSON.parse(event.content);
		
		// Get comprehensive profile data
		const comprehensiveProfile = await fetchComprehensiveProfile(event.pubkey).catch(() => null);
		
		// Extract skills
		const skills: string[] = [];
		if (comprehensiveProfile?.skills) {
			comprehensiveProfile.skills.forEach((skill: any) => {
				if (typeof skill === 'string') {
					skills.push(skill);
				} else if (skill?.name) {
					skills.push(skill.name);
				}
			});
		}

		// Encode pubkey to npub
		const npub = nip19.npubEncode(event.pubkey);

		return {
			npub,
			name: content.name || content.display_name || content.displayName || undefined,
			about: content.about || comprehensiveProfile?.about || undefined,
			picture: content.picture || comprehensiveProfile?.picture || undefined,
			professionalTitle: content.professionalTitle || comprehensiveProfile?.professionalTitle || undefined,
			skills: skills.length > 0 ? skills : undefined,
			createdAt: comprehensiveProfile?.createdAt || new Date(event.created_at * 1000).toISOString()
		};
	} catch (error) {
		console.error('Error converting event to taskee:', error);
		return null;
	}
}

/**
 * Filter taskees based on search parameters
 */
function filterTaskees(taskees: TaskeeProfile[], params: SearchTaskeesParams): TaskeeProfile[] {
	let filtered = taskees;

	// Filter by search query
	if (params.search) {
		const searchLower = params.search.toLowerCase();
		filtered = filtered.filter((taskee) => {
			const nameMatch = taskee.name?.toLowerCase().includes(searchLower);
			const aboutMatch = taskee.about?.toLowerCase().includes(searchLower);
			const titleMatch = taskee.professionalTitle?.toLowerCase().includes(searchLower);
			const skillsMatch = taskee.skills?.some((skill) => skill.toLowerCase().includes(searchLower));
			return nameMatch || aboutMatch || titleMatch || skillsMatch;
		});
	}

	// Filter by skills
	if (params.skills && params.skills.length > 0) {
		filtered = filtered.filter((taskee) => {
			if (!taskee.skills || taskee.skills.length === 0) return false;
			return params.skills!.some((searchSkill) =>
				taskee.skills!.some((taskeeSkill) =>
					taskeeSkill.toLowerCase().includes(searchSkill.toLowerCase())
				)
			);
		});
	}

	// Filter by professional title
	if (params.professionalTitle) {
		const titleLower = params.professionalTitle.toLowerCase();
		filtered = filtered.filter((taskee) => {
			return taskee.professionalTitle?.toLowerCase().includes(titleLower);
		});
	}

	// Filter by created date (join date)
	if (params.createdAfter) {
		const createdAfterDate = new Date(params.createdAfter);
		filtered = filtered.filter((taskee) => {
			if (!taskee.createdAt) return false;
			return new Date(taskee.createdAt) >= createdAfterDate;
		});
	}

	return filtered;
}

/**
 * Find taskees based on search parameters
 */
export async function findTaskees(
	params: SearchTaskeesParams = {}
): Promise<{ taskees: TaskeeProfile[]; total: number; hasMore: boolean }> {
	try {
		taskeeStore.update((state) => ({ ...state, loading: true, error: null }));

		const filter = createTaskeeFilter(params);

		const cacheKey = JSON.stringify(filter);
		const cached = cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			const filteredTaskees = filterTaskees(cached.data, params);
			const paginatedTaskees = filteredTaskees.slice(
				((params.page || 1) - 1) * (params.limit || BATCH_SIZE),
				(params.page || 1) * (params.limit || BATCH_SIZE)
			);

			taskeeStore.update((state) => ({
				...state,
				items: params.page === 1 ? paginatedTaskees : [...state.items, ...paginatedTaskees],
				loading: false,
				currentPage: params.page || 1,
				hasMore: paginatedTaskees.length >= (params.limit || BATCH_SIZE)
			}));

			console.debug(`[FindTaskees] Cache hit - returned ${paginatedTaskees.length} taskees`);

			return {
				taskees: paginatedTaskees,
				total: filteredTaskees.length,
				hasMore: paginatedTaskees.length >= (params.limit || BATCH_SIZE)
			};
		}

		try {
			const response = await nostrEventsService.findEvents(filter);

			const events = response.data || [];

			// Convert events to taskee profiles (in parallel for better performance)
			const taskeePromises = events.map((event: Event) => convertEventToTaskee(event));
			const taskees = (await Promise.all(taskeePromises)).filter(
				(taskee): taskee is TaskeeProfile => taskee !== null
			);

			// Filter taskees (including additional filters)
			const filteredTaskees = filterTaskees(taskees, params);

			// Update cache
			cache.set(cacheKey, { data: filteredTaskees, timestamp: Date.now() });

			// Paginate results
			const paginatedTaskees = filteredTaskees.slice(
				((params.page || 1) - 1) * (params.limit || BATCH_SIZE),
				(params.page || 1) * (params.limit || BATCH_SIZE)
			);

			// Update store
			taskeeStore.update((state) => ({
				...state,
				items: params.page === 1 ? paginatedTaskees : [...state.items, ...paginatedTaskees],
				loading: false,
				currentPage: params.page || 1,
				hasMore: paginatedTaskees.length >= (params.limit || BATCH_SIZE)
			}));

			console.debug(
				`[FindTaskees] Fresh data - processed ${events.length} → ${filteredTaskees.length} taskees`
			);

			return {
				taskees: paginatedTaskees,
				total: filteredTaskees.length,
				hasMore: paginatedTaskees.length >= (params.limit || BATCH_SIZE)
			};
		} catch (apiError) {
			console.error('API request failed - ', apiError);

			return {
				taskees: [],
				total: 0,
				hasMore: false
			};
		}
	} catch (error) {
		console.error('Error finding taskees:', error);
		taskeeStore.update((state) => ({
			...state,
			loading: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		}));
		throw error;
	}
}

/**
 * Cleanup function
 */
export function cleanup(): void {
	cache.clear();
}

// Cleanup cache when browser closes
if (browser) {
	window.addEventListener('beforeunload', () => {
		cache.clear();
	});
}

