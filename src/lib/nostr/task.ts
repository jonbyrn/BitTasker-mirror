import type { Task, TaskBody, TaskTranslations } from '$lib/types/task.d';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { nip19 } from 'nostr-tools';
import { calculatePOW } from '$lib/nostr';
import { getSignedEvent } from '$lib/utils/nostr';
import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
import { getBudgetBucket } from '$lib/utils/helpers/budgetTier';
import { translationService } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES } from '$lib/i18n/i18n';
import { appStore } from '$lib/stores/app.store';
import { tasksStore, myTasksStore } from '$lib/stores/task.store';
import { cleanup as cleanupTasksCache } from '$lib/nostr/findTasks';
import { cleanupMyTasks } from '$lib/nostr/findMyTasks';
import { createDebug } from '$lib/utils/debug';
import { getExactTaskLocations, publishExactTaskLocations } from '$lib/nostr/exact-location';
import { queueSearchDelete, queueSearchUpsert, taskToSearchDocument } from '$lib/search/catalog';
import { sanitizeTaskForPublicPublish } from '$lib/utils/location/public-location';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

const d = createDebug('task');

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

/**
 * Generate a readable d-tag for Nostr Addressable Events (kind:pubkey:d-tag).
 * Readable format (title + timestamp) for SEO and stable identification.
 * Suffix: 6 chars from npub (task creator or user) when provided; otherwise random.
 */
function getReadableDTag(title: string, createdAt: number, npub?: string): string {
	const slug =
		title
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.slice(0, 50) || 'task';
	const fromNpub = npub ? npub.replace(/[^a-z0-9]/gi, '').slice(0, 6) : '';
	const suffix =
		fromNpub.length >= 6
			? fromNpub
			: Array.from(crypto.getRandomValues(new Uint8Array(3)))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
	return `${slug}-${createdAt}-${suffix}`;
}

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

type TaskWithIds = Task & { uniqueId?: string; eventId?: string };

/**
 * Generate translations for a task
 * Translates title and description to all supported languages
 */
async function generateTaskTranslations(taskData: TaskBody): Promise<TaskTranslations | undefined> {
	try {
		// Detect source language from the combined text (title + description)
		const combinedText = `${taskData.title} ${taskData.description}`.trim();

		if (!combinedText) {
			return undefined;
		}

		const detectedLanguage = await translationService.detectLanguage(combinedText);

		// Determine source language - if detection fails, default to 'en'
		// but we'll still translate to ensure both languages are available
		const sourceLanguage =
			detectedLanguage &&
			SUPPORTED_LANGUAGES.includes(detectedLanguage as (typeof SUPPORTED_LANGUAGES)[number])
				? detectedLanguage
				: 'en';

		// Always translate to the other language to ensure we have translations in both
		const targetLanguages = SUPPORTED_LANGUAGES.filter((lang) => lang !== sourceLanguage);

		// Translate title and description to all target languages in parallel
		const translationPromises = targetLanguages.map(async (targetLang) => {
			const [titleResult, descResult] = await Promise.all([
				translationService.translate(taskData.title, targetLang, sourceLanguage),
				translationService.translate(taskData.description, targetLang, sourceLanguage)
			]);

			// Check if translation failed
			if ('code' in titleResult || 'code' in descResult) {
				const message =
					'code' in titleResult
						? titleResult.message
						: 'code' in descResult
							? descResult.message
							: 'Unknown translation error';
				console.warn(`Translation failed for ${targetLang}:`, message);
				return null;
			}

			return {
				language: targetLang,
				title: titleResult.translatedText,
				description: descResult.translatedText
			};
		});

		const results = await Promise.all(translationPromises);

		// Build translations object, filtering out failed translations
		const translations: TaskTranslations['translations'] = {};
		results.forEach((result) => {
			if (result) {
				translations[result.language] = {
					title: result.title,
					description: result.description
				};
			}
		});

		// If we couldn't detect the language or translation failed, try the reverse
		// This ensures we always have translations available in both languages
		if (
			(!detectedLanguage ||
				!SUPPORTED_LANGUAGES.includes(detectedLanguage as (typeof SUPPORTED_LANGUAGES)[number])) &&
			Object.keys(translations).length === 0
		) {
			// Try translating assuming the text is in Spanish
			const reverseSource = sourceLanguage === 'en' ? 'es' : 'en';
			const reverseTarget = reverseSource === 'en' ? 'es' : 'en';

			const [reverseTitleResult, reverseDescResult] = await Promise.all([
				translationService.translate(taskData.title, reverseTarget, reverseSource),
				translationService.translate(taskData.description, reverseTarget, reverseSource)
			]);

			if (!('code' in reverseTitleResult) && !('code' in reverseDescResult)) {
				translations[reverseTarget] = {
					title: reverseTitleResult.translatedText,
					description: reverseDescResult.translatedText
				};
				// Update source language to match the successful translation
				return {
					sourceLanguage: reverseSource,
					translations
				};
			}
		}

		return {
			sourceLanguage,
			translations
		};
	} catch (error) {
		console.error('Error generating task translations:', error);
		return undefined;
	}
}

/**
 * Generate tags for a task event.
 * @param taskData - Task body
 * @param pow - Proof-of-work
 * @param dTagValue - d-tag value (unique identifier; readable format for SEO per Nostr Addressable Events)
 */
async function generateTaskTags(
	taskData: TaskBody,
	pow: [string, string],
	dTagValue: string
): Promise<string[][]> {
	// Normalize and validate skills
	const normalizedSkills = taskData.skills
		.map((skill) => skill.trim().toLowerCase())
		.filter((skill) => skill.length >= 2 && skill.length <= 30)
		.filter((skill) => /^[a-z0-9\s-]+$/.test(skill))
		.slice(0, 10); // Limit to 10 skills

	const tags: Array<[string, ...string[]]> = [
		['c', ...taskData.categories.map((cat) => cat.id)],
		['s', ...normalizedSkills],
		['p', await getNpub()],
		['pow', ...pow],
		['d', dTagValue], // d-tag: unique identifier (kind:pubkey:d-tag = Addressable Event); readable format for SEO
		['S', taskData.status ?? TaskStatusEnum.OPEN] // Default status - OPEN
	];

	if (taskData.deadline) {
		const dateRangeTags = getDateRangeTags(taskData.deadline);
		tags.push(['M', ...dateRangeTags.months]); // M for months
		tags.push(['D', ...dateRangeTags.days]); // D for days
	}

	if (taskData.dateRange) {
		const dateRangeTags = getDateRangeTags(taskData.dateRange.end, taskData.dateRange.start);
		tags.push(['M', ...dateRangeTags.months]); // M for months
		tags.push(['D', ...dateRangeTags.days]); // D for days
	}

	if (taskData.budget) {
		const budgetTier = getBudgetBucket(taskData.budget.amount, taskData.budget.currency);
		tags.push(['b', budgetTier]);
		tags.push(['P', taskData.budget.currency]);
		tags.push(['t', taskData.budget.type]);
	}

	if (taskData.pickupLocation?.locationLoaded) {
		tags.push(['T', 'onsite']); // T for task type
		tags.push(['L', taskData.pickupLocation.displayName || '']); // L for location
	} else {
		tags.push(['T', 'remote']); // T for task type
		tags.push(['L', '']); // Explicitly empty for remote
	}

	return tags;
}

/**
 * Create a new task
 */
export async function createTask(taskData: TaskBody): Promise<string> {
	try {
		// Validar datos requeridos
		if (!taskData.title?.trim()) {
			throw new Error('Task title is required');
		}
		if (!taskData.description?.trim()) {
			throw new Error('Task description is required');
		}
		if (!taskData.budget?.amount || taskData.budget.amount <= 0) {
			throw new Error('Valid budget amount is required');
		}
		if (!taskData.categories?.length) {
			throw new Error('At least one category is required');
		}
		if (!taskData.skills?.length) {
			throw new Error('At least one skill is required');
		}

		// Verify user is authenticated (has npub)
		const userData = get(user);
		const npub = await getNpub();

		if (!npub) {
			throw new Error('User not authenticated');
		}

		const createdAt = Math.floor(Date.now() / 1000);
		// d-tag: readable format (title + timestamp) for SEO; kind:pubkey:d-tag = Addressable Event identifier; suffix from npub
		const dTagValue = getReadableDTag(taskData.title, createdAt, npub);

		// Use user name if available, otherwise use shortened npub as fallback
		const username =
			userData?.name || npub.substring(0, 8) + '...' + npub.substring(npub.length - 8);

		const creator = {
			username,
			avatar: userData?.picture || ''
		};

		// Generate translations for all supported languages
		const translations = await generateTaskTranslations(taskData);

		// Add creation timestamp and translations (no uniqueId in content; d-tag in tags is the identifier)
		const taskDataWithMeta = {
			...taskData,
			creator,
			createdAt,
			...(translations && { translations })
		};

		// Publish the exact companion first so we never expose only the obfuscated public location.
		await publishExactTaskLocations({
			entityId: dTagValue,
			pickupLocation: taskDataWithMeta.pickupLocation ?? null,
			dropOffLocation: taskDataWithMeta.dropOffLocation ?? null
		});

		const publicTaskData = sanitizeTaskForPublicPublish(taskDataWithMeta, dTagValue);

		// Calculate POW based on task value and d-tag (stable identifier)
		const pow = await calculatePOW(taskData.budget.amount, dTagValue);

		// Create event (Addressable Event: same kind, pubkey, d-tag = replaceable)
		const event = {
			kind: KINDS.TASK_CREATION,
			created_at: createdAt,
			content: JSON.stringify(publicTaskData),
			tags: await generateTaskTags(publicTaskData, pow, dTagValue)
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);

		queueSearchUpsert(
			'tasks',
			[taskToSearchDocument({ ...publicTaskData, id: dTagValue, npub })],
			signedEvent,
			true
		);

		// Return d-tag (stable, readable identifier) for URLs and Addressable Event coordinate
		return dTagValue;
	} catch (error) {
		console.error('❌ Failed to create task:', error);
		throw error;
	}
}

/**
 * Create a recurring task
 */
export async function createRecurringTask(
	taskData: TaskBody,
	schedule: {
		isRecurring: boolean;
		name: string;
		description: string;
		recurrencePattern: RecurrencePattern;
	}
): Promise<string> {
	try {
		const npub = await getNpub();
		if (!npub) {
			throw new Error('User not authenticated');
		}
		const createdAt = Math.floor(Date.now() / 1000);
		// Recurring tasks use same dTagValue format as regular tasks (readable, kind:pubkey:d-tag)
		const dTagValue = getReadableDTag(taskData.title ?? schedule.name, createdAt, npub);
		const pow = await calculatePOW(taskData.budget.amount, dTagValue);

		// Generate translations for the recurring task template (same as regular tasks)
		const translations = await generateTaskTranslations(taskData);

		// Include translations in the template
		const taskDataWithTranslations = {
			...taskData,
			...(translations && { translations })
		};

		const event = {
			kind: KINDS.RECURRING_TASK,
			created_at: createdAt,
			content: JSON.stringify({
				template: taskDataWithTranslations,
				schedule,
				dTagValue
			}),
			tags: [
				...(await generateTaskTags(taskData, pow, dTagValue)),
				['t', 'recurring'],
				['f', schedule.recurrencePattern.frequency],
				['i', schedule.recurrencePattern.interval.toString()]
			]
		};

		const signedEvent = await getSignedEvent(event);

		// Usar el mismo servicio que createTask para consistencia
		await nostrEventsService.publishEvent(signedEvent);

		return signedEvent.id;
	} catch (error) {
		console.error('Failed to create recurring task:', error);
		throw error;
	}
}

/**
 * Get the stable identifier for a task Nostr event (Addressable Event).
 * Use this when calling updateTask so repeated updates work: after the first update
 * the event id changes (new event published with same d-tag), and the backend/relay
 * typically only serves the latest event by d-tag, so old event ids return 404.
 *
 * @param event - Nostr task event (kind TASK_CREATION)
 * @returns d-tag from tags if present (stable across updates), else event.id (64 hex)
 */
export function getTaskStableId(event: NostrEvent): string {
	const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
	return dTag ?? event.id;
}

/**
 * Update an existing task. taskId = d-tag (preferred) or event id (64 hex).
 * Prefer d-tag so repeated updates work: with event id, after the first update
 * the backend may return 404 for the old id (see getTaskStableId).
 * Busca por backend; si falla por event id, intenta relay (pool).
 */
export async function updateTask(taskId: string, updates: Partial<TaskBody>): Promise<string> {
	try {
		const isEventId = /^[0-9a-fA-F]{64}$/.test(taskId);
		d.log('updateTask', {
			taskId: taskId.slice(0, 20) + '…',
			taskIdFormat: isEventId ? 'event-id' : 'd-tag',
			updates: Object.keys(updates)
		});

		let originalTask: NostrEvent | null = null;

		if (isEventId) {
			try {
				const result = await nostrEventsService.findEventById(taskId);
				originalTask = result.data as unknown as NostrEvent;
				d.log('updateTask: API findEventById success', { taskId: taskId.slice(0, 16) + '…' });
			} catch (apiErr) {
				d.log('updateTask: API findEventById failed, trying relay fallback', {
					taskId: taskId.slice(0, 16) + '…',
					apiError: apiErr
				});
				// Fallback: contrato viejo con event id; backend puede no tenerlo → buscar en relay
				const relays = get(appStore).relays?.length ? get(appStore).relays : RELAYS;
				originalTask = await getTaskById(taskId, undefined, relays);
				d.log('updateTask: relay fallback', {
					taskId: taskId.slice(0, 16) + '…',
					found: !!originalTask,
					relaysCount: relays.length
				});
			}
		} else {
			try {
				const response = await nostrEventsService.requestEvents({
					filters: [{ kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 1 }]
				});
				if (response.data?.length > 0) {
					originalTask = response.data[0] as unknown as NostrEvent;
				}
			} catch {
				// ignore
			}
		}

		if (!originalTask) {
			d.error('updateTask: Task not found', {
				taskId,
				taskIdFormat: isEventId ? 'event-id' : 'd-tag'
			});
			throw new Error('Task not found');
		}

		// Enforce: only the task author (same npub as current user) may update
		const npub = await getNpub();
		if (!npub) {
			throw new Error('User not authenticated');
		}
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
		if (originalTask.pubkey.toLowerCase() !== userPubkeyHex.toLowerCase()) {
			d.error('updateTask: Task author mismatch', {
				taskPubkey: originalTask.pubkey.slice(0, 16) + '…',
				userPubkey: userPubkeyHex.slice(0, 16) + '…'
			});
			throw new Error('Only the task author may update this task');
		}

		// Parse original task data
		const originalTaskData = JSON.parse(originalTask.content);

		// Get d-tag from event tags (Addressable Events: kind:pubkey:d-tag = unique identifier)
		// Support legacy: if no d tag, fall back to uniqueId in content (task-${uniqueId})
		const dTagFromTags = originalTask.tags?.find((t: string[]) => t[0] === 'd')?.[1];
		const dTagValue =
			dTagFromTags || (originalTaskData.uniqueId ? `task-${originalTaskData.uniqueId}` : null);
		if (!dTagValue) {
			throw new Error('Original task has no d-tag in tags and no uniqueId in content');
		}

		// Check if title or description changed - if so, regenerate translations
		const needsRetranslation =
			(updates.title && updates.title !== originalTaskData.title) ||
			(updates.description && updates.description !== originalTaskData.description);

		// Create updated task data for translation (if needed)
		// Companion read failures degrade safely to null so we do not overwrite private exact data
		// with the obfuscated public coordinates during a normal metadata-only update.
		const exactLocations = await getExactTaskLocations(dTagValue).catch(() => null);
		const hasPickupLocationUpdate = Object.prototype.hasOwnProperty.call(updates, 'pickupLocation');
		const hasDropOffLocationUpdate = Object.prototype.hasOwnProperty.call(
			updates,
			'dropOffLocation'
		);
		const baseTaskData: TaskBody = {
			...originalTaskData,
			pickupLocation: exactLocations?.pickupLocation ?? originalTaskData.pickupLocation,
			dropOffLocation: exactLocations?.dropOffLocation ?? originalTaskData.dropOffLocation
		};

		const taskDataForTranslation: TaskBody = {
			...baseTaskData,
			...updates
		};

		// Generate new translations if content changed
		let translations = originalTaskData.translations;
		if (needsRetranslation) {
			const newTranslations = await generateTaskTranslations(taskDataForTranslation);
			if (newTranslations) {
				translations = newTranslations;
			}
		}

		// Merge updates with original task data (preserve uniqueId in content if present for legacy)
		const updatedTaskData = {
			...baseTaskData,
			...updates,
			...(originalTaskData.uniqueId && { uniqueId: originalTaskData.uniqueId }),
			updatedAt: Math.floor(Date.now() / 1000),
			...(translations && { translations })
		};

		if (exactLocations || hasPickupLocationUpdate || hasDropOffLocationUpdate) {
			await publishExactTaskLocations({
				entityId: dTagValue,
				pickupLocation: hasPickupLocationUpdate
					? (updatedTaskData.pickupLocation ?? null)
					: (exactLocations?.pickupLocation ?? null),
				dropOffLocation: hasDropOffLocationUpdate
					? (updatedTaskData.dropOffLocation ?? null)
					: (exactLocations?.dropOffLocation ?? null)
			});
		}
		const publicUpdatedTaskData = sanitizeTaskForPublicPublish(updatedTaskData, dTagValue);

		// Calculate POW based on updated task value (use d-tag for stable identifier)
		const pow = await calculatePOW(publicUpdatedTaskData.budget?.amount || 0, dTagValue);
		// Create update event: same kind, pubkey, d-tag = replaceable Addressable Event (latest version)
		const event = {
			kind: KINDS.TASK_CREATION,
			content: JSON.stringify(publicUpdatedTaskData),
			tags: await generateTaskTags(publicUpdatedTaskData, pow, dTagValue)
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		await nostrEventsService.publishEvent(signedEvent);
		// await publishToRelays(signedEvent);

		queueSearchUpsert(
			'tasks',
			[
				taskToSearchDocument({
					...publicUpdatedTaskData,
					id: dTagValue,
					npub: signedEvent.pubkey
				})
			],
			signedEvent,
			true
		);

		const updatedTask: TaskWithIds = {
			...(updatedTaskData as Task),
			id: dTagValue,
			uniqueId: dTagValue,
			eventId: signedEvent.id,
			npub: signedEvent.pubkey,
			createdAt: updatedTaskData.createdAt ?? originalTask.created_at
		};

		// Clear caches so next fetch is fresh
		cleanupTasksCache();
		cleanupMyTasks();

		// Update in-memory stores to reflect status immediately (target single task, avoid full array iteration)
		const originalEventId = originalTask.id;
		const isMatchingTask = (t: TaskWithIds) =>
			t.uniqueId === dTagValue || t.id === dTagValue || t.eventId === originalEventId;

		tasksStore.update((state) => {
			const index = state.items.findIndex((task) => isMatchingTask(task as TaskWithIds));
			if (index === -1) return state;
			const taskWithIds = state.items[index] as TaskWithIds;
			const items = [
				...state.items.slice(0, index),
				{ ...taskWithIds, ...updatedTask },
				...state.items.slice(index + 1)
			];
			return { ...state, items };
		});

		myTasksStore.update((state) => {
			const index = state.items.findIndex((task) => isMatchingTask(task as TaskWithIds));
			if (index === -1) return state;
			const taskWithIds = state.items[index] as TaskWithIds;
			const items = [
				...state.items.slice(0, index),
				{ ...taskWithIds, ...updatedTask },
				...state.items.slice(index + 1)
			];
			return { ...state, items };
		});

		return signedEvent.id;
	} catch (error) {
		d.error('Failed to update task', { taskId, error });
		throw error;
	}
}

/**
 * Delete a task
 * @param taskId - The task ID (can be eventId or uniqueId)
 * @param eventId - Optional eventId to skip the fetch request. If provided, it will be used directly.
 */
export async function deleteTask(taskId: string, eventId?: string): Promise<string> {
	try {
		let finalEventId = eventId;

		// If eventId is provided, use it directly (avoids unnecessary request)
		if (finalEventId) {
			// Validate that it's a valid event ID format
			if (!/^[0-9a-fA-F]{64}$/.test(finalEventId)) {
				throw new Error('Invalid eventId format');
			}
		} else {
			// taskId must be a 64-char hex eventId when eventId is not provided (caller should pass eventId from the already-fetched task)
			const isEventId = /^[0-9a-fA-F]{64}$/.test(taskId);
			if (isEventId) {
				finalEventId = taskId;
			} else {
				throw new Error(
					"eventId is required when taskId is a UUID. Pass the task's eventId from the already-fetched task."
				);
			}
		}

		if (!finalEventId) {
			throw new Error('Could not determine eventId');
		}

		// Create deletion event (kind 5)
		const event = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			content: 'Task deleted',
			tags: [
				['e', finalEventId], // Reference to event being deleted
				['d', taskId] // Search document id, so the index write can be authorized
			]
		};

		// Sign and publish
		const signedEvent = await getSignedEvent(event);
		const response = await nostrEventsService.deleteEvent(signedEvent);
		if (response.deleteCount === 0) {
			throw new Error('Failed to delete task');
		}
		queueSearchDelete('tasks', [taskId], signedEvent);
		return response.message;
	} catch (error) {
		console.error('Failed to delete task:', error);
		throw error;
	}
}

/**
 * Publish an event to relays
 */
export async function publishToRelays(event: NostrEvent, relays = RELAYS): Promise<void> {
	try {
		const pool = getPool();
		const pub = pool.publish(relays, event); // Type cast to any to bypass type check
		await Promise.race([
			Promise.all(pub),
			new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
		]);
	} catch (error) {
		console.error('Failed to publish to relays:', error);
		throw error;
	}
}

/**
 * Subscribe to task events
 */
export function subscribeToTasks(
	callback: (event: NostrEvent) => void,
	filter: { kinds?: number[]; authors?: string[]; tags?: string[][] } = {},
	relays = RELAYS
): () => void {
	const pool = getPool();
	const sub = pool.subscribe(
		relays,
		{
			kinds: filter.kinds || [KINDS.TASK_CREATION, KINDS.RECURRING_TASK],
			authors: filter.authors,
			...filter
		},
		{
			onevent: callback
		}
	);

	return () => sub.close();
}

// TODO: This is not used anywhere, to be removed
/**
 * Query tasks
 */
export async function queryTasks(
	callback: (event: NostrEvent) => void,
	filter: { kinds?: number[]; authors?: string[]; tags?: string[][]; limit?: number } = {},
	relays = RELAYS
): Promise<NostrEvent[]> {
	const pool = getPool();
	const query = await pool.querySync(relays, {
		...filter,
		kinds: filter.kinds || [KINDS.TASK_CREATION], // Only look for creation events
		authors: filter.authors
	});

	// Sort events by creation time to ensure consistent ordering
	const sortedEvents = query.sort((a, b) => b.created_at - a.created_at);

	// Process events in chronological order for proper state reconstruction
	sortedEvents.forEach((event) => {
		callback(event);
	});

	return sortedEvents;
}

/**
 * Get a task by its ID
 */
export async function getTaskById(
	taskId: string,
	author?: string,
	relays = RELAYS
): Promise<NostrEvent | null> {
	try {
		const pool = getPool();
		const filter: Filter = {
			kinds: [KINDS.TASK_CREATION], // Only look for creation events
			ids: [taskId]
		};

		// If author is provided, add it to the filter
		if (author) {
			filter.authors = [author];
		}

		// Query events
		const events = await pool.querySync(relays, filter);

		if (!events || events.length === 0) {
			return null;
		}

		// Get the most recent version of the task
		return events.sort((a, b) => b.created_at - a.created_at)[0];
	} catch (error) {
		console.error('Failed to get task by ID:', error);
		throw error;
	}
}
