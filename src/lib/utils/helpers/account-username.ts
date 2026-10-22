const CHOSEN_USERNAME_KEY = 'bittasker.chosen_username';

/** Backend accounts with no chosen name look like user_e1a27f184e3f. */
export function isGeneratedAccountName(username: string | null | undefined): boolean {
	return /^user_[0-9a-f]{6,}$/i.test(username?.trim() ?? '');
}

/** A generated account or the word "User" is not a person's name. The avatar must not show U. */
export function isPlaceholderName(name: string | null | undefined): boolean {
	const value = name?.trim() ?? '';
	if (!value) return true;
	if (/^user$/i.test(value)) return true;
	return isGeneratedAccountName(value);
}

export function rememberChosenUsername(username: string): void {
	if (typeof localStorage === 'undefined') return;
	const name = username.trim().toLowerCase();
	if (!name) return;
	localStorage.setItem(CHOSEN_USERNAME_KEY, name);
}

export function readChosenUsername(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(CHOSEN_USERNAME_KEY)?.trim().toLowerCase() ?? '';
}

/** Username saved with the cached profile, when the live store has not caught up. */
export function cachedProfileUsername(): string {
	if (typeof localStorage === 'undefined') return '';
	try {
		const raw = localStorage.getItem('user_profile');
		if (!raw) return '';
		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object' || !('username' in parsed)) return '';
		const username = (parsed as { username?: unknown }).username;
		return typeof username === 'string' ? username.trim() : '';
	} catch {
		return '';
	}
}

/**
 * Value for the settings username field.
 * A generated user_ name still counts. A display name with a space does not.
 */
export function usernameInputValue(sources: {
	store?: string | null;
	cached?: string | null;
	chosen?: string | null;
}): string {
	for (const value of [sources.store, sources.cached, sources.chosen]) {
		const name = value?.trim() ?? '';
		if (!name || /\s/.test(name)) continue;
		return name;
	}
	return '';
}

/**
 * Keep a name the person chose when the server still has an automatic user_ name.
 * A real server username wins over the local choice.
 */
export function accountNameFromServer(username: string | null | undefined): string | undefined {
	const server = username?.trim() ?? '';
	const chosen = readChosenUsername();
	if (chosen && (!server || isGeneratedAccountName(server))) return chosen;
	if (!server) return undefined;
	return server;
}
