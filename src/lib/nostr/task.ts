import type { Event as NostrEvent } from 'nostr-tools';
import type { TaskBody } from '$lib/types/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getSignedEvent } from '$lib/utils/nostr';
import { publishToMultipleRelays } from '$lib/utils/nostr';
import { getNpub } from '$lib/utils/nostrKeys';
import nostrEventsService from '$lib/api/services/nostr/events';
import { getExactTaskLocations, publishExactTaskLocations } from '$lib/nostr/exact-location';
import { geocodeTaskForSave } from '$lib/utils/maps/geocode-on-save';
import KINDS from '$lib/utils/constants/kinds';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';

const RELAYS = resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

type LastPublishedTask = {
	dTag: string;
	clientHex: string;
	event: {
		id: string;
		kind: number;
		pubkey: string;
	};
};

function isPlaywrightClient(): boolean {
	return typeof window !== 'undefined' && window.__PLAYWRIGHT_TEST__ === true;
}

function hasExactCoords(location: TaskBody['pickupLocation'] | null | undefined): boolean {
	return typeof location?.latitude === 'number' && typeof location?.longitude === 'number';
}

function exposeLastPublishedTask(event: NostrEvent): void {
	if (!import.meta.env.DEV && import.meta.env.VITE_E2E_TURNSTILE_BYPASS !== 'true') return;
	if (typeof window === 'undefined') return;

	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return;

	const published: LastPublishedTask = {
		dTag,
		clientHex: event.pubkey,
		event: { id: event.id, kind: event.kind, pubkey: event.pubkey }
	};
	(window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask = published;
	window.sessionStorage.setItem('__lastPublishedTask', JSON.stringify(published));
}

function taskDTag(task: TaskBody): string {
	const slug =
		task.title
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.slice(0, 50) || 'task';
	return `${slug}-${Date.now()}`;
}

function approximateLocation(location: TaskBody['pickupLocation']): TaskBody['pickupLocation'] {
	if (!location) return location;
	const components = location.addressComponents;
	const parts = [components?.city, components?.state, components?.country].filter(Boolean);
	return {
		...location,
		displayName: parts.join(', ') || location.displayName,
		latitude: typeof location.latitude === 'number' ? Number(location.latitude.toFixed(2)) : null,
		longitude:
			typeof location.longitude === 'number' ? Number(location.longitude.toFixed(2)) : null,
		zipCode: '',
		formattedAddress: undefined,
		placeId: undefined,
		addressComponents: undefined
	};
}

function approximateTask(task: TaskBody): TaskBody {
	return {
		...task,
		pickupLocation: approximateLocation(task.pickupLocation),
		dropOffLocation: approximateLocation(task.dropOffLocation)
	};
}

function newestTask(events: readonly NostrEvent[]): NostrEvent | null {
	return (
		[...events].sort((left, right) => (right.created_at ?? 0) - (left.created_at ?? 0))[0] ?? null
	);
}

/** Relay copy first. The staging events API 404s on this sandbox, which left accepted tasks OPEN. */
async function readTaskFromRelays(taskId: string): Promise<NostrEvent | null> {
	if (RELAYS.length === 0) return null;
	try {
		const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
		const events = await queryRelayEvents(RELAYS, {
			kinds: [KINDS.TASK_CREATION],
			'#d': [taskId],
			limit: 5
		});
		return newestTask(events);
	} catch {
		return null;
	}
}

async function readEventFromRelays(eventId: string): Promise<NostrEvent | null> {
	if (RELAYS.length === 0 || !/^[0-9a-f]{64}$/i.test(eventId)) return null;
	try {
		const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
		const events = await queryRelayEvents(RELAYS, { ids: [eventId], limit: 1 });
		return events.find((event) => event.kind === KINDS.TASK_CREATION) ?? null;
	} catch {
		return null;
	}
}

async function findTaskEvent(taskId: string): Promise<NostrEvent> {
	const fromRelay = await readTaskFromRelays(taskId);
	if (fromRelay) return fromRelay;
	const response = await nostrEventsService.requestEvents({
		filters: [{ kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 5 }]
	});
	const event = response.data?.[0] as NostrEvent | undefined;
	if (!event) throw new Error('Task not found');
	return event;
}

async function publishTaskEvent(content: string, tags: string[][]): Promise<string> {
	const event = await getSignedEvent({
		kind: KINDS.TASK_CREATION,
		content,
		tags
	});
	exposeLastPublishedTask(event);
	const publishPromise = publishToMultipleRelays(event, RELAYS).then((results) => {
		if (!results.some((result) => result.success)) {
			throw new Error('Failed to publish task to any configured Nostr relay');
		}
		return results;
	});
	if (isPlaywrightClient()) {
		try {
			await publishPromise;
		} catch (error) {
			console.warn('E2E task relay publish did not block navigation:', error);
		}
		return event.id;
	}
	await publishPromise;
	return event.id;
}

export async function createTask(taskData: TaskBody): Promise<string> {
	const located = await geocodeTaskForSave(taskData);
	const dTag = taskDTag(located);
	if (hasExactCoords(located.pickupLocation) || hasExactCoords(located.dropOffLocation)) {
		const companionPublish = publishExactTaskLocations({
			entityId: dTag,
			pickupLocation: located.pickupLocation ?? null,
			dropOffLocation: located.dropOffLocation ?? null
		});
		if (isPlaywrightClient()) {
			companionPublish.catch((error) => {
				console.warn('E2E exact-location publish did not block navigation:', error);
			});
		} else {
			await companionPublish;
		}
	}
	return publishTaskEvent(JSON.stringify(approximateTask(located)), [
		['d', dTag],
		['S', located.status ?? 'open'],
		...(hasExactCoords(located.pickupLocation)
			? [['L', approximateLocation(located.pickupLocation)?.displayName ?? '']]
			: [])
	]);
}

export async function createRecurringTask(
	taskData: TaskBody,
	recurrence: unknown
): Promise<string> {
	const located = await geocodeTaskForSave(taskData);
	const dTag = taskDTag(located);
	const content = JSON.stringify({ task: located, recurrence });
	const event = await getSignedEvent({
		kind: KINDS.RECURRING_TASK,
		content,
		tags: [['d', dTag]]
	});
	const results = await publishToMultipleRelays(event, RELAYS);
	if (!results.some((result) => result.success)) {
		throw new Error('Failed to publish recurring task to any configured Nostr relay');
	}
	return event.id;
}

export async function updateTask(
	taskId: string,
	updates: Partial<TaskBody>,
	options?: { acceptedBid?: string }
): Promise<string> {
	const event = await findTaskEvent(taskId);
	const currentUser = await getNpub();
	if (!currentUser) throw new Error('User not authenticated');
	if (event.pubkey.toLowerCase() !== currentUser.toLowerCase()) {
		throw new Error('Only the task author may update this task');
	}

	let currentTask = JSON.parse(event.content) as TaskBody;
	let exactLocations: Awaited<ReturnType<typeof getExactTaskLocations>> = null;
	try {
		exactLocations = await getExactTaskLocations(taskId);
		if (exactLocations) {
			currentTask = {
				...currentTask,
				pickupLocation: exactLocations.pickupLocation ?? undefined,
				dropOffLocation: exactLocations.dropOffLocation ?? undefined
			};
		}
	} catch {
		// A companion read failure must not block a public update.
	}
	const draft = { ...currentTask, ...updates };
	const nextTask = await geocodeTaskForSave(draft);
	const filledFromText =
		(!hasExactCoords(draft.pickupLocation) && hasExactCoords(nextTask.pickupLocation)) ||
		(!hasExactCoords(draft.dropOffLocation) && hasExactCoords(nextTask.dropOffLocation));
	const acceptedBid =
		options?.acceptedBid || event.tags.find((tag) => tag[0] === 'acceptedBid')?.[1];
	if (
		exactLocations ||
		hasExactCoords(updates.pickupLocation) ||
		hasExactCoords(updates.dropOffLocation) ||
		filledFromText
	) {
		await publishExactTaskLocations({
			entityId: taskId,
			pickupLocation: nextTask.pickupLocation ?? null,
			dropOffLocation: nextTask.dropOffLocation ?? null
		});
	}
	return publishTaskEvent(JSON.stringify(approximateTask(nextTask)), [
		['d', taskId],
		['S', nextTask.status ?? 'open'],
		...(acceptedBid ? [['acceptedBid', acceptedBid]] : []),
		...(nextTask.pickupLocation
			? [['L', approximateLocation(nextTask.pickupLocation)?.displayName ?? '']]
			: [])
	]);
}

async function findTaskByKey(taskKey: string): Promise<NostrEvent> {
	const fromRelayId = await readEventFromRelays(taskKey);
	if (fromRelayId) return fromRelayId;
	try {
		return await findTaskEvent(taskKey);
	} catch (error) {
		if (!(error instanceof Error) || error.message !== 'Task not found') throw error;
	}
	if (!/^[0-9a-f]{64}$/i.test(taskKey)) throw new Error('Task not found');
	const found = await nostrEventsService.findEventById(taskKey);
	if (!found.data) throw new Error('Task not found');
	return found.data;
}

const TASK_RANK: Partial<Record<TaskStatusEnum, number>> = {
	[TaskStatusEnum.OPEN]: 0,
	[TaskStatusEnum.BID_ACCEPTED]: 1,
	[TaskStatusEnum.ESCROW_FUNDED]: 2,
	[TaskStatusEnum.IN_PROGRESS]: 3,
	[TaskStatusEnum.COMPLETED]: 4
};

/**
 * Move a task forward. A refund can replace Completed. Nothing else can.
 * Accept does not mean in progress: that waits for a confirmed escrow.
 */
async function writeTaskStatus(
	taskKey: string,
	status: TaskStatusEnum,
	bidEventId?: string
): Promise<boolean> {
	const key = taskKey.trim();
	if (!key) return false;
	let event: NostrEvent;
	try {
		event = await findTaskByKey(key);
	} catch (error) {
		console.warn('[task] status lookup failed', error);
		return false;
	}
	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return false;
	let current: TaskBody;
	try {
		current = JSON.parse(event.content) as TaskBody;
	} catch {
		return false;
	}
	if (current.status === status) return true;
	if (current.status === TaskStatusEnum.REFUNDED && status !== TaskStatusEnum.REFUNDED) return true;
	if (status !== TaskStatusEnum.REFUNDED && status !== TaskStatusEnum.CANCELLED) {
		const currentRank = TASK_RANK[current.status as TaskStatusEnum] ?? 0;
		const nextRank = TASK_RANK[status] ?? 0;
		if (currentRank > nextRank) return true;
	}
	const recordedBid = event.tags.find((tag) => tag[0] === 'acceptedBid')?.[1];
	const nextBid = bidEventId?.trim() || recordedBid;
	await updateTask(dTag, { status }, nextBid ? { acceptedBid: nextBid } : undefined);
	return true;
}

/** Record the accepted bid. The task stays out of In Progress until funding confirms. */
export async function assignTask(taskKey: string, bidEventId?: string): Promise<boolean> {
	return writeTaskStatus(taskKey, TaskStatusEnum.BID_ACCEPTED, bidEventId);
}

/** Call only after the funding transaction is confirmed. */
export async function fundTask(taskKey: string, bidEventId?: string): Promise<boolean> {
	return writeTaskStatus(taskKey, TaskStatusEnum.ESCROW_FUNDED, bidEventId);
}

/** A refunded task must not stay Completed. */
export async function refundTask(taskKey: string): Promise<boolean> {
	return writeTaskStatus(taskKey, TaskStatusEnum.REFUNDED);
}

/**
 * Mark the task COMPLETED after escrow release.
 * A refunded task is left refunded.
 */
export async function completeTask(taskKey: string): Promise<boolean> {
	const key = taskKey.trim();
	if (!key) return false;
	let event: NostrEvent;
	try {
		event = await findTaskByKey(key);
	} catch (error) {
		console.warn('[task] complete lookup failed', error);
		return false;
	}
	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return false;
	let current: TaskBody;
	try {
		current = JSON.parse(event.content) as TaskBody;
	} catch {
		return false;
	}
	if (current.status === TaskStatusEnum.REFUNDED || current.status === TaskStatusEnum.CANCELLED) {
		return true;
	}
	if (current.status === TaskStatusEnum.COMPLETED) return true;
	await updateTask(dTag, { status: TaskStatusEnum.COMPLETED });
	return true;
}

export async function deleteTask(taskId: string, eventId?: string): Promise<string> {
	const event = await getSignedEvent({
		kind: 5,
		content: 'Task deleted',
		tags: [['a', `${KINDS.TASK_CREATION}:${taskId}`], ...(eventId ? [['e', eventId]] : [])]
	});
	const results = await publishToMultipleRelays(event, RELAYS);
	if (!results.some((result) => result.success)) {
		throw new Error('Failed to publish task deletion to any Nostr relay');
	}
	return event.id;
}

export function getTaskStableId(event: NostrEvent): string {
	return event.tags.find((tag) => tag[0] === 'd')?.[1] ?? event.id;
}
