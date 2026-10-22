import { describe, expect, it } from 'vitest';
import {
	profilePublishErrorKind,
	userFacingOnboardingError
} from '$lib/utils/helpers/onboarding-error';

describe('onboarding error copy', () => {
	it('maps known profile publish failures and hides raw errors', () => {
		expect(profilePublishErrorKind(new Error('PROFILE_METADATA_VERIFY_TIMEOUT'))).toBe(
			'verify_timeout'
		);
		expect(profilePublishErrorKind(new Error('PROFILE_METADATA_PUBLISH_REJECTED'))).toBe(
			'relay_rejected'
		);
		expect(profilePublishErrorKind(new Error('failed to publish kind 0 to wss://relay'))).toBe(
			'failed'
		);
		expect(profilePublishErrorKind('nope')).toBe('failed');
	});

	it('replaces protocol jargon with the plain fallback', () => {
		const fallback = 'We could not save your profile. Please try again.';
		expect(userFacingOnboardingError('Failed to get credential data', fallback)).toBe(fallback);
		expect(userFacingOnboardingError('Could not find an available handle', fallback)).toBe(
			fallback
		);
		expect(userFacingOnboardingError('Nostr relay rejected the event', fallback)).toBe(fallback);
		expect(
			userFacingOnboardingError('No se encontró un autenticador en este dispositivo', fallback)
		).toBe(fallback);
		expect(userFacingOnboardingError('Use 3 to 50 characters.', fallback)).toBe(
			'Use 3 to 50 characters.'
		);
	});
});
