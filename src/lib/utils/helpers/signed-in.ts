/** A leftover access token without a public key is not a signed-in account. */
export function sessionLooksSignedIn(
	token: string | null | undefined,
	npub: string | null | undefined
): boolean {
	return Boolean(token && token.trim() && npub && npub.trim());
}
