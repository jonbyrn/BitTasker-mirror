import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectSpy = vi.hoisted(() => vi.fn());

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return {
		...actual,
		redirect: (status: number, location: string) => {
			redirectSpy(status, location);
			throw new Error('REDIRECT');
		}
	};
});

import { Preferences } from '@capacitor/preferences';
import { load } from '../../../../routes/(app)/auth/+layout';
import {
	clearOnboardingCaptcha,
	clearOnboardingDraft,
	markOnboardingCaptcha,
	saveOnboardingDraft
} from '$lib/utils/helpers/onboarding-draft';

function preferences(token: string | null) {
	vi.mocked(Preferences.get).mockImplementation(async ({ key }: { key: string }) => {
		if (key === 'access_token') return { value: token };
		return { value: null };
	});
}

describe('onboarding refresh', () => {
	beforeEach(() => {
		redirectSpy.mockClear();
		sessionStorage.clear();
		clearOnboardingCaptcha();
		clearOnboardingDraft();
		preferences(null);
	});

	it('stays on onboarding when the account token exists and captcha memory was cleared', async () => {
		preferences('access-token');

		const result = await load({
			url: new URL('https://rgb.bittasker.com/auth/onboarding')
		} as Parameters<typeof load>[0]);

		expect(result).toEqual({ currentStep: 2 });
		expect(redirectSpy).not.toHaveBeenCalled();
		expect(Preferences.remove).not.toHaveBeenCalled();
	});

	it('stays on onboarding after F5 when captcha already passed in this tab', async () => {
		markOnboardingCaptcha();

		const result = await load({
			url: new URL('https://rgb.bittasker.com/auth/onboarding')
		} as Parameters<typeof load>[0]);

		expect(result).toBeUndefined();
		expect(redirectSpy).not.toHaveBeenCalled();
	});

	it('stays on onboarding after F5 when a draft was saved', async () => {
		saveOnboardingDraft({
			step: 1,
			displayName: 'Ada',
			username: 'ada',
			nsec: 'aa',
			npub: 'bb'
		});

		await load({
			url: new URL('https://rgb.bittasker.com/auth/onboarding')
		} as Parameters<typeof load>[0]);

		expect(redirectSpy).not.toHaveBeenCalled();
	});

	it('sends a cold visit with no session back to signup', async () => {
		await expect(
			load({
				url: new URL('https://rgb.bittasker.com/auth/onboarding')
			} as Parameters<typeof load>[0])
		).rejects.toThrow('REDIRECT');

		expect(redirectSpy).toHaveBeenCalledWith(303, '/auth/signup');
	});
});
