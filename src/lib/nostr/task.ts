import type { Event as NostrEvent } from 'nostr-tools';
import type { TaskBody } from '$lib/types/task';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

const RELAYS = (import.meta.env.VITE_NOSTR_RELAY_URL ?? '')
	.split(',')
	.map((relay: string) => relay.trim())
	.filter(Boolean)
	.map((relay: string) =>
		relay.startsWith('ws://') || relay.startsWith('wss://') ? relay : `wss://${relay}`
	);

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

async function publishTaskEvent(content: string, tags: string[][]): Promise<string> {
	const event = await getSignedEvent({
		kind: KINDS.TASK_CREATION,
		content,
		tags
	});
	const results = await publishToMultipleRelays(event, RELAYS);
	if (!results.some((result) => result.success)) {
		throw new Error('Failed to publish task to any Nostr relay');
	}
	return event.id;
}

export async function createTask(taskData: TaskBody): Promise<string> {
	const dTag = taskDTag(taskData);
	return publishTaskEvent(JSON.stringify(taskData), [
		['d', dTag],
		['S', taskData.status ?? 'open']
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
		throw new Error('Failed to publish recurring task to any Nostr relay');
	}
	return event.id;
}

export async function updateTask(taskId: string, updates: Partial<TaskBody>): Promise<string> {
	return publishTaskEvent(JSON.stringify(updates), [
		['d', taskId],
		['S', updates.status ?? 'open']
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
