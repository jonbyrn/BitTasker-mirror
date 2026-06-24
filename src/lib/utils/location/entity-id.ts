import type { Event as NostrEvent } from 'nostr-tools';

function getStringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLegacyTaskEntityId(value: string | null): string | null {
	if (!value) {
		return null;
	}

	return value.startsWith('task-') ? value : `task-${value}`;
}

export function resolveTaskLocationEntityId(
	taskEvent: Pick<NostrEvent, 'tags' | 'content'>
): string | null {
	const dTag = taskEvent.tags?.find((tag) => tag[0] === 'd')?.[1];
	if (dTag && getStringValue(dTag)) {
		return dTag.trim();
	}

	if (typeof taskEvent.content === 'string') {
		try {
			const parsed = JSON.parse(taskEvent.content) as { uniqueId?: unknown };
			return normalizeLegacyTaskEntityId(getStringValue(parsed.uniqueId));
		} catch {
			return null;
		}
	}

	if (taskEvent.content && typeof taskEvent.content === 'object') {
		return normalizeLegacyTaskEntityId(
			getStringValue((taskEvent.content as { uniqueId?: unknown }).uniqueId)
		);
	}

	return null;
}

export function resolveServiceLocationEntityId(
	serviceAddressOrUniqueId: string | null | undefined
): string | null {
	const value = getStringValue(serviceAddressOrUniqueId);
	if (!value) {
		return null;
	}

	const firstColon = value.indexOf(':');
	const secondColon = value.indexOf(':', firstColon + 1);
	if (firstColon > 0 && secondColon > firstColon) {
		return value.slice(secondColon + 1) || null;
	}

	return value;
}
