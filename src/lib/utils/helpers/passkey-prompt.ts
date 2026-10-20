import { writable } from 'svelte/store';

export const PASSKEY_APPROVE_MESSAGE = 'Approve with your passkey to continue';
export const PASSKEY_FAILED_MESSAGE =
	'Passkey approval timed out or was cancelled. Your entries are still here. Tap Retry.';

/** True while navigator.credentials.get is in flight, so the page can explain the password-manager popout. */
export const passkeyPrompt = writable({ active: false });

/** E2E and the dev skip flag must not open a real authenticator. */
export function passkeyPromptSuppressed(): boolean {
	if (import.meta.env.VITE_SKIP_PASSKEY === 'true') return true;
	if (import.meta.env.VITE_E2E_TEST === 'true') return true;
	if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') return true;
	if (typeof window === 'undefined') return false;
	return (window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true;
}

export function beginPasskeyPrompt(): void {
	passkeyPrompt.set({ active: true });
}

export function endPasskeyPrompt(): void {
	passkeyPrompt.set({ active: false });
}

export class SignerLockedError extends Error {
	constructor(message = PASSKEY_APPROVE_MESSAGE) {
		super(message);
		this.name = 'SignerLockedError';
	}
}

export function isPasskeyPromptError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const named = error as { name?: unknown; message?: unknown };
	const name = typeof named.name === 'string' ? named.name : '';
	if (
		name === 'NotAllowedError' ||
		name === 'AbortError' ||
		name === 'TimeoutError' ||
		name === 'SignerLockedError'
	) {
		return true;
	}
	const message = typeof named.message === 'string' ? named.message.toLowerCase() : '';
	return (
		message.includes('unlock cancelled') ||
		message.includes('timed out') ||
		message.includes('not allowed') ||
		message.includes('passkey') ||
		message.includes('webauthn')
	);
}

export function passkeyErrorText(error: unknown): string {
	if (isPasskeyPromptError(error)) return PASSKEY_FAILED_MESSAGE;
	if (error instanceof Error && error.message.trim()) return error.message;
	return PASSKEY_FAILED_MESSAGE;
}
