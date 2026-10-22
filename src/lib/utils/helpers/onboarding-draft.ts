const DRAFT_KEY = 'bittasker.onboarding.draft';
const CAPTCHA_KEY = 'bittasker.onboarding.captcha';

export interface OnboardingDraft {
	step: number;
	displayName: string;
	username: string;
	nsec: string;
	npub: string;
}

function storage(): Storage | null {
	if (typeof sessionStorage === 'undefined') return null;
	return sessionStorage;
}

export function markOnboardingCaptcha(): void {
	storage()?.setItem(CAPTCHA_KEY, '1');
}

export function clearOnboardingCaptcha(): void {
	storage()?.removeItem(CAPTCHA_KEY);
}

export function onboardingCaptchaPassed(): boolean {
	return storage()?.getItem(CAPTCHA_KEY) === '1';
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
	storage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function readOnboardingDraft(): OnboardingDraft | null {
	const raw = storage()?.getItem(DRAFT_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
		const step = typeof parsed.step === 'number' ? parsed.step : 0;
		if (step < 0 || step > 4) return null;
		return {
			step,
			displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
			username: typeof parsed.username === 'string' ? parsed.username : '',
			nsec: typeof parsed.nsec === 'string' ? parsed.nsec : '',
			npub: typeof parsed.npub === 'string' ? parsed.npub : ''
		};
	} catch {
		return null;
	}
}

export function clearOnboardingDraft(): void {
	storage()?.removeItem(DRAFT_KEY);
}

/** A refresh may continue onboarding when captcha already passed or a draft exists. */
export function onboardingMayResume(): boolean {
	return onboardingCaptchaPassed() || readOnboardingDraft() !== null;
}
