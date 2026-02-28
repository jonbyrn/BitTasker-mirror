/**
 * Normalize a display name into a handle base suitable for NIP-05 / profile URLs.
 *
 * Keeps Unicode letters and numbers; allows only `._-` as separators.
 * Safe for human-readable handles; use fallback (e.g. tasker_ + npub suffix) when result is empty.
 *
 * Steps (human-readable):
 * 1. Trim whitespace
 * 2. Lowercase
 * 3. Replace whitespace runs with a single underscore
 * 4. Keep only Unicode letters (\p{L}), digits (\p{N}), and . _ -
 * 5. Collapse repeated _ . -
 * 6. Remove leading/trailing . and - (email-style)
 * 7. Optionally truncate to maxLength
 *
 * @param displayName - Raw display name from the user
 * @param maxLength - Optional max length for the base (e.g. 50); no truncation if omitted
 * @returns Normalized handle base, or empty string if nothing remains (caller should use fallback)
 */
export function normalizeDisplayNameToHandleBase(displayName: string, maxLength?: number): string {
	if (typeof displayName !== 'string') {
		return '';
	}

	// 1. Trim and lowercase
	let base = displayName.trim().toLowerCase();
	if (base.length === 0) return '';

	// 2. Replace any run of whitespace with a single underscore
	base = base.replace(/\s+/g, '_');

	// 3. Keep only Unicode letters, digits, and . _ -
	base = base.replace(/[^\p{L}\p{N}._-]/gu, '');

	// 4. Collapse repeated separators (each run becomes a single character)
	base = base.replace(/_+/g, '_').replace(/\.+/g, '.').replace(/-+/g, '-');

	// 5. Remove leading and trailing . and - (email local-part rules)
	base = base.replace(/^[.-]+|[.-]+$/g, '');

	// 6. Trim leading/trailing underscores so we don't end up with _jane_ or jane_
	base = base.replace(/^_+|_+$/g, '');

	if (base.length === 0) return '';

	// 7. Optional truncation
	if (typeof maxLength === 'number' && maxLength > 0 && base.length > maxLength) {
		base = base.slice(0, maxLength);
		// Avoid ending with . or - after truncation
		base = base.replace(/[.-]+$/, '');
	}

	return base;
}

/** Strip to NIP-05 set only: a-z 0-9 - _ . (no Unicode). */
const NIP05_STRIP = /[^a-z0-9._-]/g;

/**
 * Normalize a display name into a NIP-05– and email-compatible handle base (ASCII only).
 * Use for auto-generated handles; use fallback (e.g. tasker_ + npub suffix) when result is empty.
 *
 * Rules:
 * - Allowed characters: a-z 0-9 - _ . only.
 * - Lowercase; spaces → _; collapse repeated _ . -; no leading/trailing . - or _.
 * - No consecutive .. (collapse to single .).
 *
 * @param displayName - Raw display name from the user
 * @param maxLength - Optional max length for the base (e.g. 50); no truncation if omitted
 * @returns Normalized handle base, or empty string if nothing remains (caller should use fallback)
 */
export function normalizeDisplayNameToNip05HandleBase(
	displayName: string,
	maxLength?: number
): string {
	if (typeof displayName !== 'string') {
		return '';
	}

	let base = displayName.trim().toLowerCase();
	if (base.length === 0) return '';

	base = base.replace(/\s+/g, '_');
	base = base.replace(NIP05_STRIP, '');
	base = base.replace(/_+/g, '_').replace(/\.+/g, '.').replace(/-+/g, '-');
	base = base.replace(/^[.-]+|[.-]+$/g, '');
	base = base.replace(/^_+|_+$/g, '');

	if (base.length === 0) return '';

	if (typeof maxLength === 'number' && maxLength > 0 && base.length > maxLength) {
		base = base.slice(0, maxLength);
		base = base.replace(/[.-]+$/, '');
	}

	return base;
}
