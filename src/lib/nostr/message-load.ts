/** Inbox load must leave the skeleton state even when a relay never answers. */
export const MESSAGES_LOAD_TIMEOUT_MS = 12_000;
export const MESSAGES_LOAD_TIMEOUT = 'MESSAGES_LOAD_TIMEOUT';

export function isMessagesLoadTimeout(error: unknown): boolean {
	return error instanceof Error && error.message === MESSAGES_LOAD_TIMEOUT;
}
