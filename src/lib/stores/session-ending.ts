/**
 * True while logout is tearing down the account session.
 * Stays set until the next login so a late 401 refresh cannot write a new token.
 * A full reload constructs a fresh module, so the flag does not survive a refresh.
 */
let sessionEnding = false;

export function beginSessionEnd(): void {
	sessionEnding = true;
}

export function endSessionEnd(): void {
	sessionEnding = false;
}

export function isSessionEnding(): boolean {
	return sessionEnding;
}
