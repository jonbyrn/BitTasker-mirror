/**
 * The browser reports a lost passkey prompt as NotAllowedError with
 * "The operation either timed out or was not allowed". The same prompt
 * usually succeeds on the next try, so that failure is safe to retry once.
 * An explicit cancel (AbortError) is not retried.
 */
export function isTransientPasskeyFailure(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
	const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
	if (name === 'AbortError') return false;
	if (name === 'NotAllowedError' || name === 'TimeoutError') return true;
	const normalized = message.toLowerCase();
	return (
		normalized.includes('timed out or was not allowed') ||
		normalized.includes('notallowederror') ||
		normalized.includes('no fue permitida') ||
		normalized.includes('operación expiró') ||
		normalized.includes('operacion expiro')
	);
}
