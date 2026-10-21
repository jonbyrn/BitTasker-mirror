/** Stable message thrown when the account API returns a server failure. */
export const AUTH_SERVICE_UNAVAILABLE = 'AUTH_SERVICE_UNAVAILABLE';

function statusOf(error: unknown): number | null {
	if (!error || typeof error !== 'object') return null;
	const status = (error as { status?: unknown }).status;
	return typeof status === 'number' ? status : null;
}

function messageOf(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object' && 'message' in error) {
		const message = (error as { message?: unknown }).message;
		return typeof message === 'string' ? message : '';
	}
	return '';
}

/** A 5xx response, a database outage, or a username check that never answered. */
export function isAuthServiceUnavailable(error: unknown): boolean {
	const status = statusOf(error);
	if (status !== null && status >= 500 && status <= 504) return true;
	const message = messageOf(error);
	if (!message) return false;
	if (message === AUTH_SERVICE_UNAVAILABLE) return true;
	const lower = message.toLowerCase();
	return (
		lower.includes('internal server error') ||
		lower.includes('service unavailable') ||
		lower.includes('reach database') ||
		lower.includes('postgres.railway.internal') ||
		lower.includes('username check timed out')
	);
}
