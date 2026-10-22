import { isQvacEnabled } from '$lib/services/feature-flags';

export interface AssistantContact {
	pubkey: string;
	name: string;
}

let cached: AssistantContact | null = null;

/** Public key only. The worker never returns the nsec. */
export async function assistantContact(): Promise<AssistantContact | null> {
	if (!isQvacEnabled()) return null;
	if (cached) return cached;
	try {
		const response = await fetch('/api/qvac/assistant');
		if (!response.ok) return null;
		const body = (await response.json()) as { pubkey?: string; name?: string };
		if (!body.pubkey) return null;
		cached = { pubkey: body.pubkey, name: body.name || 'BitTasker Assistant' };
		return cached;
	} catch {
		return null;
	}
}

export type AssistantReplyResult = 'ok' | 'unavailable' | 'skipped';

/**
 * Ask the worker to answer a direct message that was already published.
 * No-ops unless the recipient is the assistant. Does not send a key.
 */
export async function maybeReply(
	recipient: string,
	event: unknown,
	route: string,
	language: string
): Promise<AssistantReplyResult> {
	if (!isQvacEnabled()) return 'skipped';
	const contact = await assistantContact();
	if (!contact) return 'unavailable';
	if (recipient.toLowerCase() !== contact.pubkey.toLowerCase()) return 'skipped';
	const origin = typeof location === 'undefined' ? '' : location.origin;
	try {
		const response = await fetch('/api/qvac/assistant', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				event,
				route,
				language: language === 'es' ? 'es' : 'en',
				origin
			})
		});
		return response.ok ? 'ok' : 'unavailable';
	} catch {
		return 'unavailable';
	}
}
