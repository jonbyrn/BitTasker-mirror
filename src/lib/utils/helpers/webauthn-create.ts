import { isUnavailablePasskeyError } from '$lib/utils/helpers/passkey-prompt';

/** Some password managers ignore the WebAuthn timeout and never settle. */
export const PASSKEY_CREATE_TIMEOUT_MS = 60_000;

type PendingCreate = { controller: AbortController };

let pendingCreate: PendingCreate | null = null;

export function cancelWebAuthnCreate(): void {
	pendingCreate?.controller.abort();
	pendingCreate = null;
}

function errorName(error: unknown): string {
	if (!error || typeof error !== 'object') return '';
	const name = (error as { name?: unknown }).name;
	return typeof name === 'string' ? name : '';
}

function errorMessage(error: unknown): string {
	if (!error || typeof error !== 'object') return '';
	const message = (error as { message?: unknown }).message;
	return typeof message === 'string' ? message.toLowerCase() : '';
}

export function isPendingPasskeyCreateError(error: unknown): boolean {
	return (
		errorName(error) === 'InvalidStateError' || errorMessage(error).includes('already pending')
	);
}

export function passkeyCreateErrorName(
	error: unknown
): 'TimeoutError' | 'InvalidStateError' | 'PasskeyUnavailableError' | null {
	if (errorName(error) === 'TimeoutError') return 'TimeoutError';
	if (isPendingPasskeyCreateError(error)) return 'InvalidStateError';
	if (isUnavailablePasskeyError(error)) return 'PasskeyUnavailableError';
	return null;
}

export function passkeySetupFailure(
	error: unknown
): 'timed_out' | 'pending' | 'no_authenticator' | 'setup_failed' {
	const kind = passkeyCreateErrorName(error);
	if (kind === 'TimeoutError') return 'timed_out';
	if (kind === 'InvalidStateError') return 'pending';
	if (kind === 'PasskeyUnavailableError') return 'no_authenticator';
	return 'setup_failed';
}

function timeoutError(): Error {
	const error = new Error('Passkey setup timed out');
	error.name = 'TimeoutError';
	return error;
}

function pendingError(error: unknown): Error {
	if (error instanceof Error && error.name === 'InvalidStateError') return error;
	const pending = new Error('A passkey request is already pending');
	pending.name = 'InvalidStateError';
	return pending;
}

/**
 * One WebAuthn create at a time. A hung provider is aborted so Retry can start
 * a new request, and the call rejects after `timeoutMs` even if create never settles.
 */
export async function createWebAuthnCredential(
	publicKey: PublicKeyCredentialCreationOptions,
	timeoutMs = PASSKEY_CREATE_TIMEOUT_MS
): Promise<Credential | null> {
	cancelWebAuthnCreate();
	const controller = new AbortController();
	pendingCreate = { controller };
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Call create immediately so an in-flight request can be aborted before the next one.
	const created = Promise.resolve(
		navigator.credentials.create({ publicKey, signal: controller.signal })
	)
		.then((credential) => (timedOut ? null : credential))
		.catch((error: unknown) => {
			if (timedOut) return null;
			if (isPendingPasskeyCreateError(error)) throw pendingError(error);
			throw error;
		});

	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			timedOut = true;
			reject(timeoutError());
			controller.abort();
		}, timeoutMs);
	});

	try {
		return await Promise.race([created, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
		if (pendingCreate?.controller === controller) pendingCreate = null;
		void created.catch(() => undefined);
	}
}
