import { describe, expect, it } from 'vitest';
import { identityLabel, identityPicture, normalizeKind0Profile } from '$lib/nostr/profile/identity';

describe('kind-0 identity', () => {
	it('uses display_name before the account username', () => {
		expect(
			identityLabel({
				displayName: 'Bitwarden Tester',
				username: 'bitwarden_tester_tnkquabc'
			})
		).toBe('Bitwarden Tester');
	});

	it('falls back to username only when the display name is empty', () => {
		expect(identityLabel({ displayName: '   ', username: 'bitwarden_tester' })).toBe(
			'bitwarden_tester'
		);
		expect(identityLabel({ name: '', username: '' })).toBe('');
	});

	it('normalizes kind 0 so name and picture come from display_name and picture', () => {
		const profile = normalizeKind0Profile({
			display_name: 'NDK Test User',
			name: 'Ignored',
			picture: ' https://example.com/avatar.jpg '
		});
		expect(profile.display_name).toBe('NDK Test User');
		expect(profile.name).toBe('NDK Test User');
		expect(profile.picture).toBe('https://example.com/avatar.jpg');
		expect(identityPicture(profile)).toBe('https://example.com/avatar.jpg');
	});

	it('keeps a legacy name when display_name is missing', () => {
		const profile = normalizeKind0Profile({ name: 'Only Name Field' });
		expect(profile.name).toBe('Only Name Field');
		expect(identityPicture(profile)).toBe('');
	});
});
