import { isCaptchaVerified } from '$lib/stores/auth-captcha';

/** Tab storage only. The raw key must not go into localStorage. */
export const ONBOARDING_DRAFT_STORAGE_KEY = 'bittasker.onboarding.draft';
export const SIGNUP_CAPTCHA_STORAGE_KEY = 'bittasker.signup.captcha';

export interface OnboardingDraft {
	step: number;
	displayName: string;
	username: string;
	nsec: string;
	npub: string;
}

export function shouldRedirectOnboardingToSignup(input: {
	hasToken: boolean;
	verified: boolean;
	skipped: boolean;
	hasDraft: boolean;
}): boolean {
	return !input.hasToken && !input.verified && !input.skipped && !input.hasDraft;
}

export function initialOnboardingState(
	dataStep: number | undefined,
	draft: OnboardingDraft | null
): OnboardingDraft {
	if (draft) {
		return {
			step: draft.step,
			displayName: draft.displayName,
			username: draft.username,
			nsec: draft.nsec,
			npub: draft.npub
		};
	}
	return {
		step: dataStep ?? 0,
		displayName: '',
		username: '',
		nsec: '',
		npub: ''
	};
}

function sessionStore(): Storage | null {
	if (typeof sessionStorage === 'undefined') return null;
	return sessionStorage;
}

function isOnboardingDraft(value: unknown): value is OnboardingDraft {
	if (!value || typeof value !== 'object') return false;
	const draft = value as Partial<OnboardingDraft>;
	const nsec = draft.nsec;
	return (
		typeof draft.step === 'number' &&
		Number.isInteger(draft.step) &&
		draft.step >= 0 &&
		draft.step <= 4 &&
		typeof draft.displayName === 'string' &&
		typeof draft.username === 'string' &&
		typeof nsec === 'string' &&
		(nsec === '' || /^[0-9a-fA-F]{64}$/.test(nsec)) &&
		typeof draft.npub === 'string'
	);
}

export function readOnboardingDraft(): OnboardingDraft | null {
	const storage = sessionStore();
	if (!storage) return null;
	const raw = storage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isOnboardingDraft(parsed)) return null;
		return {
			step: parsed.step,
			displayName: parsed.displayName,
			username: parsed.username,
			nsec: parsed.nsec,
			npub: parsed.npub
		};
	} catch {
		return null;
	}
}

export function writeOnboardingDraft(draft: OnboardingDraft): void {
	const storage = sessionStore();
	if (!storage || !isOnboardingDraft(draft)) return;
	storage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearOnboardingDraft(): void {
	sessionStore()?.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
}

export function setSignupCaptchaVerified(verified: boolean): void {
	isCaptchaVerified.set(verified);
	const storage = sessionStore();
	if (!storage) return;
	if (verified) storage.setItem(SIGNUP_CAPTCHA_STORAGE_KEY, '1');
	else storage.removeItem(SIGNUP_CAPTCHA_STORAGE_KEY);
}

export function hydrateSignupCaptcha(): void {
	const storage = sessionStore();
	if (storage?.getItem(SIGNUP_CAPTCHA_STORAGE_KEY) === '1') {
		isCaptchaVerified.set(true);
	}
}
