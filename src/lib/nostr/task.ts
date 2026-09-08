import type { Event as NostrEvent } from 'nostr-tools';
import type { TaskBody } from '$lib/types/task';
import { getSignedEvent } from '$lib/utils/nostr';
import { publishToMultipleRelays } from '$lib/utils/nostr';
import { getNpub } from '$lib/utils/nostrKeys';
import nostrEventsService from '$lib/api/services/nostr/events';
import { getExactTaskLocations, publishExactTaskLocations } from '$lib/nostr/exact-location';
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

function exposeLastPublishedTask(event: NostrEvent): void {
	if (!import.meta.env.DEV && import.meta.env.VITE_E2E_TURNSTILE_BYPASS !== 'true') return;
	if (typeof window === 'undefined') return;

	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	if (!dTag) return;

	(window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask = {
		dTag,
		clientHex: event.pubkey,
		event: { id: event.id, kind: event.kind, pubkey: event.pubkey }
	};
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
		longitude: typeof location.longitude === 'number' ? Number(location.longitude.toFixed(2)) : null,
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

async function findTaskEvent(taskId: string): Promise<NostrEvent> {
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
	const results = await publishToMultipleRelays(event, RELAYS);
	if (!results.some((result) => result.success)) {
		throw new Error('Failed to publish task to any configured Nostr relay');
	}
	exposeLastPublishedTask(event);
	return event.id;
}

export async function createTask(taskData: TaskBody): Promise<string> {
	const dTag = taskDTag(taskData);
	await publishExactTaskLocations({
		entityId: dTag,
		pickupLocation: taskData.pickupLocation ?? null,
		dropOffLocation: taskData.dropOffLocation ?? null
	});
	return publishTaskEvent(JSON.stringify(approximateTask(taskData)), [
		['d', dTag],
		['S', taskData.status ?? 'open'],
		...(taskData.pickupLocation ? [['L', approximateLocation(taskData.pickupLocation)?.displayName ?? '']] : [])
	]);
}

export async function createRecurringTask(
	taskData: TaskBody,
	recurrence: unknown
): Promise<string> {
	const dTag = taskDTag(taskData);
	const content = JSON.stringify({ task: taskData, recurrence });
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

export async function updateTask(taskId: string, updates: Partial<TaskBody>): Promise<string> {
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
	const nextTask = { ...currentTask, ...updates };
	if (exactLocations) {
		await publishExactTaskLocations({
			entityId: taskId,
			pickupLocation: nextTask.pickupLocation ?? null,
			dropOffLocation: nextTask.dropOffLocation ?? null
		});
	}
	return publishTaskEvent(JSON.stringify(approximateTask(nextTask)), [
		['d', taskId],
		['S', nextTask.status ?? 'open'],
		...(nextTask.pickupLocation ? [['L', approximateLocation(nextTask.pickupLocation)?.displayName ?? '']] : [])
	]);
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
