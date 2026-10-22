import type { Task, TaskRecommendation, RecommendationParams } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { getSignedEvent } from '$lib/utils/nostr';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getNpub } from '$lib/utils/nostrKeys';
import { getBudgetBucket } from '$lib/utils/helpers/budgetTier';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import type { Skill } from '$lib/types/profile';
import { TASKS_PER_PAGE } from '$lib/stores/task.store';
import { parseTaskEvent } from '$lib/nostr/parseTaskEvent';
import { taskBudgetAmount } from '$lib/utils/helpers/taskBudget';

/**
 * Ensures a relay URL is valid:
 * 1. Trims whitespace
 * 2. Ensures it starts with ws:// or wss://
 * 3. Handles potentially multiple URLs (comma separated)
 */
function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => url.trim())
		.filter((url) => {
			return (
				Boolean(url) &&
				url.length > 0 &&
				url !== 'undefined' &&
				url !== 'null' &&
				url !== '[object Object]'
			);
		})
		.map((url) => {
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				return `wss://${url}`;
			}
			return url;
		});
}

// Define relay URLs with fallbacks
const RELAYS = sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache
const cache = new Map<string, { data: Task[]; timestamp: number }>();

/**
 * Get the centralized pool instance from appStore
 */
function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}
	return pool;
}

/**
 * Convert a Nostr event to a Task
 */
function convertEventToTask(event: Event): Task | null {
	return parseTaskEvent(event);
}

/**
 * Create recommendation filter based on user preferences - follows same pattern as createTaskFilter
 */
function createRecommendationFilter(params: RecommendationParams): Filter {
	const filter: Filter & { [key: string]: string[] | number[] | string | number | undefined } = {
		kinds: [KINDS.TASK_CREATION],
		limit: params.limit || 10
	};

	// Skills filter - use same tag structure as main search
	if (params.skills && params.skills.length > 0) {
		filter['s'] = params.skills;
	}

	// Categories filter - use same tag structure as main search
	if (params.categories && params.categories.length > 0) {
		filter['c'] = params.categories;
	}

	// Budget filters - same structure as findTasks
	if (params.preferredBudget?.tier) {
		filter['b'] = [params.preferredBudget.tier];
	}
	if (params.preferredBudget?.currency) {
		filter['P'] = [params.preferredBudget.currency]; // P for price
	}
	if (params.preferredBudget?.type) {
		filter['t'] = [params.preferredBudget.type];
	}

	// Location filter with enhanced structure - same as task search
	if (params.preferredLocations && params.preferredLocations.length > 0) {
		filter['T'] = ['onsite'];
		filter['L'] = params.preferredLocations;
	}

	// Status filter - only get open tasks for recommendations
	filter['S'] = [TaskStatusEnum.OPEN];

	return filter;
}

/**
 * Calculate recommendation score based on matches - improved with null safety
 */
function calculateRecommendationScore(
	task: Task,
	matches: {
		matchedSkills: string[];
		matchedCategories: string[];
		budgetTier?: string;
		budgetCurrency?: string;
		budgetType?: string;
		locations?: string[];
	}
): number {
	let score = 0;

	// Skills match (40% weight) - with null safety
	const taskSkills = task.skills || [];
	if (taskSkills.length > 0 && matches.matchedSkills.length > 0) {
		const skillsScore = (matches.matchedSkills.length / taskSkills.length) * 40;
		score += skillsScore;
	}

	// Categories match (30% weight) - with null safety
	const taskCategories = task.categories || [];
	if (taskCategories.length > 0 && matches.matchedCategories.length > 0) {
		const categoriesScore = (matches.matchedCategories.length / taskCategories.length) * 30;
		score += categoriesScore;
	}

	// Budget tier match (10% weight) - with null safety
	if (matches.budgetTier && task.budget) {
		const amount = taskBudgetAmount(task);
		if (amount != null) {
			const taskTier = getBudgetBucket(amount, task.budget.currency || 'USD');
			if (taskTier === matches.budgetTier) {
				score += TASKS_PER_PAGE;
			}
		}
	}

	// Budget currency match (3% weight)
	if (matches.budgetCurrency && task.budget?.currency === matches.budgetCurrency) {
		score += 3;
	}

	// Budget type match (2% weight)
	if (matches.budgetType && task.budget?.type === matches.budgetType) {
		score += 2;
	}

	// Location match (10% weight) - with null safety
	if (matches.locations?.length && task.pickupLocation?.displayName) {
		if (matches.locations.includes(task.pickupLocation.displayName)) {
			score += 10;
		}
	}

	// Boost score for tasks with recent activity (recency bonus)
	const taskAge = Date.now() / 1000 - (task.createdAt || 0);
	const daysOld = taskAge / (24 * 60 * 60);
	if (daysOld < 1) {
		score += 5; // 5 point bonus for tasks less than 1 day old
	} else if (daysOld < 7) {
		score += 2; // 2 point bonus for tasks less than 1 week old
	}

	return Math.min(score, 100); // Cap at 100
}

/**
 * Generate recommendation reason based on matches - improved with better messaging
 */
function generateRecommendationReason(
	matchedSkills: string[],
	matchedCategories: string[],
	budgetTierMatch?: boolean
): string {
	const reasons: string[] = [];

	if (matchedSkills.length > 0) {
		const skillText = matchedSkills.length === 1 ? 'skill' : 'skills';
		const displaySkills = matchedSkills.slice(0, 3); // Show max 3 skills
		const skillsText = displaySkills.join(', ');
		const extraSkills = matchedSkills.length > 3 ? ` (+${matchedSkills.length - 3} more)` : '';
		reasons.push(`Matches your ${skillText}: ${skillsText}${extraSkills}`);
	}

	if (matchedCategories.length > 0) {
		const categoryText = matchedCategories.length === 1 ? 'category' : 'categories';
		const displayCategories = matchedCategories.slice(0, 2); // Show max 2 categories
		const categoriesText = displayCategories.join(', ');
		const extraCategories =
			matchedCategories.length > 2 ? ` (+${matchedCategories.length - 2} more)` : '';
		reasons.push(`In your preferred ${categoryText}: ${categoriesText}${extraCategories}`);
	}

	if (budgetTierMatch) {
		reasons.push('Matches your budget preference');
	}

	// Provide fallback messages for different scenarios
	if (reasons.length === 0) {
		return 'Trending in your area';
	}

	return reasons.join(' • ');
}

/**
 * Calculate task recommendation with score and matches
 */
function calculateTaskRecommendation(task: Task, params: RecommendationParams): TaskRecommendation {
	const matchedSkills = (task.skills || []).filter((skill) => params.skills?.includes(skill));
	const matchedCategories = (task.categories || []).filter((category) =>
		params.categories?.includes(category.name)
	);

	// Check if budget tier matches
	let budgetTierMatch = false;
	if (params.preferredBudget?.tier && task.budget) {
		const amount = taskBudgetAmount(task);
		if (amount != null) {
			const taskTier = getBudgetBucket(amount, task.budget.currency || 'USD');
			budgetTierMatch = taskTier === params.preferredBudget.tier;
		}
	}

	// Calculate score based on matches
	const score = calculateRecommendationScore(task, {
		matchedSkills,
		matchedCategories: matchedCategories.map((category) => category.name),
		budgetTier: params.preferredBudget?.tier,
		budgetCurrency: params.preferredBudget?.currency,
		budgetType: params.preferredBudget?.type,
		locations: params.preferredLocations
	});

	return {
		taskId: task.id,
		task,
		score,
		reason: generateRecommendationReason(
			matchedSkills,
			matchedCategories.map((category) => category.name),
			budgetTierMatch
		),
		matchedSkills,
		matchedCategories: matchedCategories.map((category) => category.name)
	};
}

/**
 * Get task recommendations based on user preferences - follows same pattern as findTasks
 */
export async function getRecommendations(
	params: RecommendationParams
): Promise<TaskRecommendation[]> {
	try {
		const filter = createRecommendationFilter(params);

		// Use same cache key pattern as findTasks
		const cacheKey = `recommendations_${JSON.stringify(filter)}`;
		const cached = cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.data
				.map((task) => calculateTaskRecommendation(task, params))
				.sort((a, b) => b.score - a.score);
		}

		try {
			const response = await nostrEventsService.findEvents(filter);
			const events = response.data || [];

			const npub = await getNpub();

			// Convert events to tasks - same pattern as findTasks
			const tasks = events
				.filter((event: Event) => event.pubkey !== npub)
				.flatMap((event: Event) => {
					const task = convertEventToTask(event);
					return task ? [task] : [];
				});

			// Update cache with tasks
			cache.set(cacheKey, { data: tasks, timestamp: Date.now() });

			// Calculate recommendations with scores
			return tasks
				.map((task) => calculateTaskRecommendation(task, params))
				.sort((a, b) => b.score - a.score);
		} catch (apiError) {
			console.error('API request failed for recommendations:', apiError);
			return [];
		}
	} catch (error) {
		console.error('Error getting recommendations:', error);
		throw error;
	}
}

/**
 * Get profile data from various profile event kinds using general Nostr relays
 */
async function getProfileData(userNpub: string): Promise<{
	skills: string[];
	locations?: string[];
}> {
	const result = {
		skills: [] as string[],
		locations: [] as string[]
	};

	try {
		const eventFilter = {
			kinds: [KINDS.PROFILE_SKILLS, KINDS.PROFILE_LOCATION],
			authors: [userNpub]
			// TODO: Make a funtion to handle multiple tags identifiers for each kind
		};

		const pool = getPool();
		const events = await pool.querySync(RELAYS, eventFilter);

		if (events && events.length > 0) {
			await Promise.all(
				events.map(async (event) => {
					if (event.kind === KINDS.PROFILE_SKILLS) {
						const content = JSON.parse(event.content);
						result.skills = content?.map((skill: Skill) => skill.name);
					} else if (event.kind === KINDS.PROFILE_LOCATION) {
						// TODO: Disactivated until location radius filter is implemented
						/* // Get own public key
					const keyPair = await getNostrKeyPair();
					const nsec = bytesToHex(keyPair.nsec);
					const npub = keyPair.npub;
					const conversationKey = await nip44.getConversationKey(nsec, npub);
					const decryptedContent = await nip44.decrypt(event.content, conversationKey);
					const location = JSON.parse(decryptedContent);
					result.locations.push(location.displayName); */
					}
				})
			);
		}

		return result;
	} catch (error) {
		console.error('Error getting profile data:', error);
		return result;
	}
}

/**
 * Get user preferences from NIP-33 parameterized replaceable event or profile data
 */
async function getUserPreferences(): Promise<{
	skills: string[];
	categories: string[];
	budget?: {
		tier?: string;
		currency?: string;
		type?: string;
	};
	locations?: string[];
}> {
	if (!browser) {
		return { skills: [], categories: [] };
	}

	try {
		const userNpub = await getNpub();

		// First, try to get user preferences from kind 31003 (our custom preferences)
		const preferencesFilter: Filter = {
			kinds: [KINDS.USER_PREFERENCES],
			authors: [userNpub],
			'#d': ['user-preferences'],
			limit: 1
		};

		const pool = getPool();
		const preferences = await pool.querySync(RELAYS, preferencesFilter);
		if (preferences && preferences.length > 0 && preferences[0].content) {
			try {
				const prefs = JSON.parse(preferences[0].content);
				return {
					skills: Array.isArray(prefs.skills) ? prefs.skills : [],
					categories: Array.isArray(prefs.categories) ? prefs.categories : [],
					budget: prefs.budget && typeof prefs.budget === 'object' ? prefs.budget : undefined,
					locations: Array.isArray(prefs.locations) ? prefs.locations : undefined
				};
			} catch (e) {
				console.error('Error parsing user preferences:', e);
			}
		}

		// Fallback: Get data from profile structure (following profile.store.ts pattern)
		const profileData = await getProfileData(userNpub);

		// If we have profile data but no preferences, create initial preferences
		if (profileData.skills?.length > 0) {
			await saveUserPreferences({
				skills: profileData.skills,
				locations: profileData.locations,
				categories: [] // TODO: To be rechecked
			});
		}

		return {
			skills: profileData.skills,
			locations: profileData.locations,
			categories: [] // TODO: To be rechecked
		};
	} catch (error) {
		console.error('Error getting user preferences:', error);
		return { skills: [], categories: [] };
	}
}

/**
 * Get recommended tasks based on user preferences - streamlined approach following findTasks pattern
 */
export async function getRecommendedTasks(limit: number = 10): Promise<TaskRecommendation[]> {
	try {
		// Get user preferences first
		const userPrefs = await getUserPreferences();

		// If no preferences, return no recommendations
		if (
			!userPrefs.skills?.length &&
			!userPrefs.categories?.length &&
			!userPrefs.locations?.length
		) {
			return [];
		}

		// Get recommendations based on preferences using the improved system
		const recommendations = await getRecommendations({
			skills: userPrefs.skills,
			categories: userPrefs.categories,
			preferredBudget: userPrefs.budget,
			preferredLocations: userPrefs.locations,
			limit
		});

		return recommendations.slice(0, limit);
	} catch (error) {
		console.error('Error getting recommended tasks:', error);
		return [];
	}
}

/**
 * Save/update user preferences as NIP-33 parameterized replaceable event
 */
export async function saveUserPreferences(preferences: {
	skills: string[];
	categories: string[];
	budget?: {
		tier?: string;
		currency?: string;
		type?: string;
	};
	locations?: string[];
}): Promise<void> {
	try {
		const preferencesEvent = await getSignedEvent({
			kind: KINDS.USER_PREFERENCES,
			content: JSON.stringify({
				skills: preferences.skills || [],
				categories: preferences.categories || [],
				budget: preferences.budget,
				locations: preferences.locations || [],
				updatedAt: Date.now()
			}),
			tags: [
				['d', 'user-preferences'],
				['t', 'recommendation-preferences'],
				// Add tags for easier filtering
				['s', ...preferences.skills],
				['c', ...preferences.categories]
			]
		});

		const pool = getPool();
		pool.publish(RELAYS, preferencesEvent);

		// Clear cache to force refresh of recommendations
		const cacheKeys = Array.from(cache.keys()).filter((key) => key.startsWith('recommendations_'));
		cacheKeys.forEach((key) => cache.delete(key));
	} catch (error) {
		console.error('Error saving user preferences:', error);
		throw error;
	}
}

/**
 * Update user preferences by merging with existing preferences
 */
export async function updateUserPreferences(
	updates: Partial<{
		skills: string[];
		categories: string[];
		budget: {
			tier?: string;
			currency?: string;
			type?: string;
		};
		locations: string[];
	}>
): Promise<void> {
	try {
		const currentPrefs = await getUserPreferences();

		const updatedPrefs = {
			skills: updates.skills ?? currentPrefs.skills,
			categories: updates.categories ?? currentPrefs.categories,
			budget: updates.budget ?? currentPrefs.budget,
			locations: updates.locations ?? currentPrefs.locations
		};

		await saveUserPreferences(updatedPrefs);
	} catch (error) {
		console.error('Error updating user preferences:', error);
		throw error;
	}
}

/**
 * Update user preferences based on task feedback
 */
export async function updatePreferencesFromFeedback(
	isRelevant: boolean,
	matchedSkills: string[],
	matchedCategories: string[]
): Promise<void> {
	try {
		const currentPrefs = await getUserPreferences();

		if (isRelevant) {
			// Positive feedback: Add matched skills/categories to preferences if not already there
			const updatedSkills = [...new Set([...currentPrefs.skills, ...matchedSkills])];
			const updatedCategories = [...new Set([...currentPrefs.categories, ...matchedCategories])];

			await updateUserPreferences({
				skills: updatedSkills,
				categories: updatedCategories
			});

			console.log('Added to preferences:', {
				skills: matchedSkills,
				categories: matchedCategories
			});
		} else {
			// Negative feedback: Remove matched skills/categories from preferences
			const updatedSkills = currentPrefs.skills.filter((skill) => !matchedSkills.includes(skill));
			const updatedCategories = currentPrefs.categories.filter(
				(category) => !matchedCategories.includes(category)
			);

			await updateUserPreferences({
				skills: updatedSkills,
				categories: updatedCategories
			});

			console.log('Removed from preferences:', {
				skills: matchedSkills,
				categories: matchedCategories
			});
		}
	} catch (error) {
		console.error('Error updating preferences from feedback:', error);
		throw error;
	}
}
