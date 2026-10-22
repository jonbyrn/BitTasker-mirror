/** A short public handle: 3–20 chars, starts with a letter, then letters, numbers, or underscores. */
const SIMPLE_USERNAME = /^[a-z][a-z0-9_]{2,19}$/;

export type SimpleUsernameIssue = 'required' | 'too_short' | 'too_long' | 'invalid_characters';

export function normalizeSimpleUsername(value: string): string {
	return value.trim().toLowerCase();
}

export function simpleUsernameIssue(value: string): SimpleUsernameIssue | null {
	const name = normalizeSimpleUsername(value);
	if (!name) return 'required';
	if (name.length < 3) return 'too_short';
	if (name.length > 20) return 'too_long';
	if (!SIMPLE_USERNAME.test(name)) return 'invalid_characters';
	return null;
}

/** A handle suggested from a display name. Empty when the name cannot make one. */
export function suggestUsername(displayName: string): string {
	const base = displayName
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 20)
		.replace(/_+$/g, '');
	if (simpleUsernameIssue(base)) return '';
	return base;
}
