/**
 * Normalize an unknown thrown value to an Error with a readable message.
 * Use in catch blocks before rethrowing so callers always receive an Error.
 *
 * @param error - The caught value (Error, API error object, string, etc.)
 * @param defaultMessage - Message to use when no readable message can be extracted
 * @returns An Error instance with a string message
 */
export function normalizeToError(error: unknown, defaultMessage: string): Error {
	if (error instanceof Error && error.message?.trim()) {
		return error;
	}
	const msg = extractMessage(error);
	return new Error(msg?.trim() ? msg : defaultMessage, { cause: error });
}

function extractMessage(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const o = error as Record<string, unknown>;
		if (typeof o.message === 'string') return o.message;
		if (
			o.data &&
			typeof o.data === 'object' &&
			typeof (o.data as Record<string, unknown>).message === 'string'
		) {
			return (o.data as Record<string, unknown>).message as string;
		}
	}
	return '';
}
