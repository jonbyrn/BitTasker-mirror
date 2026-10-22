import type { Event } from 'nostr-tools';
import type { Task } from '$lib/types/task';
import { endFromTags } from '$lib/utils/helpers/taskDeadline';
import { taskBudgetAmount } from '$lib/utils/helpers/taskBudget';

const loggedEventIds = new Set<string>();

/** Tests start from a clean "logged once" set. */
export function resetMalformedTaskLog(): void {
	loggedEventIds.clear();
}

function logMalformedTaskOnce(event: Event, error: unknown): void {
	const key = typeof event?.id === 'string' && event.id ? event.id : 'unknown';
	if (loggedEventIds.has(key)) return;
	loggedEventIds.add(key);
	console.warn('[tasks] Skipping malformed kind 31000 event', key, error);
}

function isTaskContent(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const task = value as { title?: unknown; status?: unknown };
	return (
		typeof task.title === 'string' &&
		task.title.trim().length > 0 &&
		typeof task.status === 'string'
	);
}

function normalizeContentBudget(content: Record<string, unknown>): Record<string, unknown> {
	const amount = taskBudgetAmount(content);
	const budget = content.budget;
	const budgetObject =
		budget && typeof budget === 'object' && !Array.isArray(budget)
			? { ...(budget as Record<string, unknown>) }
			: null;
	if (amount == null) {
		if (!budgetObject) return content;
		delete budgetObject.amount;
		return { ...content, budget: budgetObject };
	}
	return {
		...content,
		budget: {
			currency: 'USD',
			type: 'FIXED',
			...budgetObject,
			amount
		}
	};
}

/**
 * One kind 31000 event. A bad event is skipped and logged once.
 * It never throws, so the rest of the page can still subscribe.
 */
export function parseTaskEvent(event: Event): Task | null {
	try {
		let content: unknown;
		try {
			content = JSON.parse(event.content);
		} catch (error) {
			logMalformedTaskOnce(event, error);
			return null;
		}
		if (!isTaskContent(content)) return null;
		const normalized = normalizeContentBudget(content);
		const taggedEnd = endFromTags(event.tags);
		if (!normalized.deadline && taggedEnd) normalized.deadline = taggedEnd;
		const tags = Array.isArray(event.tags) ? event.tags : [];
		const dTag = tags.find((tag) => tag[0] === 'd')?.[1];
		return {
			...normalized,
			id: dTag ?? event.id,
			eventId: event.id,
			npub: event.pubkey,
			createdAt: event.created_at
		} as Task;
	} catch (error) {
		logMalformedTaskOnce(event, error);
		return null;
	}
}
