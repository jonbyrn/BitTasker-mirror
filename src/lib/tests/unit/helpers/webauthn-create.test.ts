import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PASSKEY_CREATE_TIMEOUT_MS,
	cancelWebAuthnCreate,
	createWebAuthnCredential,
	passkeySetupFailure
} from '$lib/utils/helpers/webauthn-create';

const publicKey = {} as PublicKeyCredentialCreationOptions;

function namedError(name: string, message: string): Error {
	const error = new Error(message);
	error.name = name;
	return error;
}

describe('createWebAuthnCredential', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		cancelWebAuthnCreate();
	});

	afterEach(() => {
		cancelWebAuthnCreate();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('uses a 60 second timeout', () => {
		expect(PASSKEY_CREATE_TIMEOUT_MS).toBe(60_000);
	});

	it('rejects a create that never resolves, aborts it, and allows the next one', async () => {
		let signal: AbortSignal | undefined;
		const hanging = vi.fn((options: CredentialCreationOptions) => {
			signal = options.signal;
			return new Promise<Credential | null>(() => undefined);
		});
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { create: hanging }
		});

		const pending = createWebAuthnCredential(publicKey, 60_000);
		const timedOut = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
		await vi.advanceTimersByTimeAsync(60_000);
		await timedOut;
		expect(signal?.aborted).toBe(true);

		const next = vi.fn().mockResolvedValue({ id: 'cred' });
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { create: next }
		});
		await expect(createWebAuthnCredential(publicKey, 60_000)).resolves.toEqual({ id: 'cred' });
		expect(next).toHaveBeenCalledOnce();
	});

	it('does not wait out the timeout when create fails', async () => {
		const create = vi
			.fn()
			.mockRejectedValueOnce(namedError('NotAllowedError', 'The operation was not allowed.'))
			.mockResolvedValueOnce({ id: 'ok' });
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { create }
		});

		await expect(createWebAuthnCredential(publicKey, 60_000)).rejects.toMatchObject({
			name: 'NotAllowedError'
		});
		await expect(createWebAuthnCredential(publicKey, 60_000)).resolves.toEqual({ id: 'ok' });
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('rejects an already-pending create without stacking another hang', async () => {
		const create = vi
			.fn()
			.mockRejectedValue(namedError('InvalidStateError', 'A request is already pending.'));
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { create }
		});

		await expect(createWebAuthnCredential(publicKey, 60_000)).rejects.toMatchObject({
			name: 'InvalidStateError'
		});
		await expect(createWebAuthnCredential(publicKey, 60_000)).rejects.toMatchObject({
			name: 'InvalidStateError'
		});
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('aborts the in-flight create when another one starts', async () => {
		const signals: AbortSignal[] = [];
		const create = vi.fn((options: CredentialCreationOptions) => {
			const signal = options.signal;
			if (!signal) return Promise.reject(new Error('missing signal'));
			signals.push(signal);
			if (signals.length === 1) {
				return new Promise<Credential | null>((_resolve, reject) => {
					signal.addEventListener('abort', () => {
						reject(namedError('AbortError', 'aborted'));
					});
				});
			}
			return Promise.resolve({ id: 'next' } as Credential);
		});
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { create }
		});

		const first = createWebAuthnCredential(publicKey, 60_000);
		const second = createWebAuthnCredential(publicKey, 60_000);
		await expect(second).resolves.toMatchObject({ id: 'next' });
		await expect(first).rejects.toMatchObject({ name: 'AbortError' });
		expect(signals[0]?.aborted).toBe(true);
	});
});

describe('passkeySetupFailure', () => {
	it('maps a timeout, a pending create, and a missing authenticator to different copy', () => {
		expect(passkeySetupFailure(namedError('TimeoutError', 'Passkey setup timed out'))).toBe(
			'timed_out'
		);
		expect(
			passkeySetupFailure(namedError('InvalidStateError', 'A request is already pending.'))
		).toBe('pending');
		expect(passkeySetupFailure(namedError('Error', 'A request is already pending.'))).toBe(
			'pending'
		);
		expect(passkeySetupFailure(namedError('NotAllowedError', 'not allowed'))).toBe(
			'no_authenticator'
		);
		expect(passkeySetupFailure(namedError('Error', 'register failed'))).toBe('setup_failed');
	});
});
