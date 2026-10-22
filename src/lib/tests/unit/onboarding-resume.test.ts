import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { isCaptchaVerified } from '$lib/stores/auth-captcha';
import {
	ONBOARDING_DRAFT_STORAGE_KEY,
	SIGNUP_CAPTCHA_STORAGE_KEY,
	clearOnboardingDraft,
	hydrateSignupCaptcha,
	initialOnboardingState,
	readOnboardingDraft,
	setSignupCaptchaVerified,
	shouldRedirectOnboardingToSignup,
	writeOnboardingDraft
} from '$lib/stores/onboarding-draft';

const DRAFT = {
	step: 1,
	displayName: 'Ada',
	username: 'ada',
	nsec: 'ab'.repeat(32),
	npub: 'cd'.repeat(32)
};

describe('onboarding resume', () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
		isCaptchaVerified.set(false);
	});

	it('keeps a visitor with no captcha and no draft on onboarding', () => {
		expect(
			shouldRedirectOnboardingToSignup({
				hasToken: false,
				verified: false,
				skipped: false,
				hasDraft: false
			})
		).toBe(false);
	});

	it('keeps onboarding when the captcha flag, a draft, a skip, or a token exists', () => {
		expect(
			shouldRedirectOnboardingToSignup({
				hasToken: false,
				verified: true,
				skipped: false,
				hasDraft: false
			})
		).toBe(false);
		expect(
			shouldRedirectOnboardingToSignup({
				hasToken: false,
				verified: false,
				skipped: true,
				hasDraft: false
			})
		).toBe(false);
		expect(
			shouldRedirectOnboardingToSignup({
				hasToken: false,
				verified: false,
				skipped: false,
				hasDraft: true
			})
		).toBe(false);
		expect(
			shouldRedirectOnboardingToSignup({
				hasToken: true,
				verified: false,
				skipped: false,
				hasDraft: false
			})
		).toBe(false);
	});

	it('round-trips the in-progress account in sessionStorage and not localStorage', () => {
		writeOnboardingDraft(DRAFT);

		expect(readOnboardingDraft()).toEqual(DRAFT);
		expect(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)).toBeNull();
		expect(sessionStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)).toContain(DRAFT.nsec);

		clearOnboardingDraft();
		expect(readOnboardingDraft()).toBeNull();
	});

	it('ignores a corrupt draft and a draft whose key is not 64 hex chars', () => {
		sessionStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, '{');
		expect(readOnboardingDraft()).toBeNull();

		sessionStorage.setItem(
			ONBOARDING_DRAFT_STORAGE_KEY,
			JSON.stringify({ ...DRAFT, nsec: 'not-a-key' })
		);
		expect(readOnboardingDraft()).toBeNull();

		sessionStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify({ ...DRAFT, step: 9 }));
		expect(readOnboardingDraft()).toBeNull();
	});

	it('prefers the saved step over the layout step', () => {
		expect(initialOnboardingState(2, DRAFT)).toEqual(DRAFT);
		expect(initialOnboardingState(undefined, null)).toEqual({
			step: 0,
			displayName: '',
			username: '',
			nsec: '',
			npub: ''
		});
	});

	it('restores the signup captcha flag after a reload', () => {
		setSignupCaptchaVerified(true);
		expect(sessionStorage.getItem(SIGNUP_CAPTCHA_STORAGE_KEY)).toBe('1');

		isCaptchaVerified.set(false);
		hydrateSignupCaptcha();
		expect(get(isCaptchaVerified)).toBe(true);

		setSignupCaptchaVerified(false);
		expect(sessionStorage.getItem(SIGNUP_CAPTCHA_STORAGE_KEY)).toBeNull();
		expect(get(isCaptchaVerified)).toBe(false);
	});

	it('renders onboarding in the browser so a reload can read the draft', () => {
		const source = readFileSync('src/routes/(app)/auth/onboarding/+page.ts', 'utf8');
		expect(source).toContain('ssr = false');
	});
});
