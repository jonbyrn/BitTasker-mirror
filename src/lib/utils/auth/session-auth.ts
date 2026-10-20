/**
 * A session is cleared only for a confirmed auth rejection.
 * Network failures and requests that opt out must leave the stored tokens alone.
 */
export function shouldClearSessionOnAuthFailure(
	status: number | undefined,
	skipAuthRedirect: boolean
): boolean {
	if (skipAuthRedirect) return false;
	if (status === undefined) return false;
	return status === 401 || status === 403;
}
