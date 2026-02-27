import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.fn(() => {
	const err = new Error('REDIRECT');
	(err as Error & { status: number; location: string }).status = 303;
	(err as Error & { status: number; location: string }).location = '/auth/login';
	throw err;
});
const mockIsRedirect = vi.fn((e: unknown) => (e as Error & { status?: number }).status === 303);

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: (...args: [number, string]) => mockRedirect(...args),
	isRedirect: (e: unknown) => mockIsRedirect(e)
}));

const mockPreferencesGet = vi.fn();
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: (args: unknown) => mockPreferencesGet(args),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

const mockSetAccessToken = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/utils/houdini/plugins/customAuthPlugin', () => ({
	setAccessToken: (token: string) => mockSetAccessToken(token)
}));

const mockCheckOnboardingStatus = vi.fn().mockResolvedValue({ isComplete: true, missingFields: [] });
vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		checkOnboardingStatus: () => mockCheckOnboardingStatus()
	}
}));

vi.mock('$lib/api/apiService', () => ({
	ApiError: class ApiError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.status = status;
		}
	}
}));

const mockAuthStateLogin = vi.fn().mockResolvedValue(undefined);
const mockAuthStateLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/stores/auth.store', () => ({
	authState: {
		login: () => mockAuthStateLogin(),
		logout: () => mockAuthStateLogout()
	}
}));

describe('(protected) layout load', () => {
	const url = { pathname: '/dashboard', searchParams: new URLSearchParams() };

	beforeEach(() => {
		vi.clearAllMocks();
		mockPreferencesGet.mockResolvedValue({ value: null });
		mockSetAccessToken.mockResolvedValue(undefined);
		mockAuthStateLogin.mockResolvedValue(undefined);
		mockCheckOnboardingStatus.mockResolvedValue({ isComplete: true, missingFields: [] });
	});

	it('when token exists: syncs token to plugin then calls authState.login()', async () => {
		const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
		mockPreferencesGet.mockImplementation((opts: { key: string }) => {
			if (opts.key === 'access_token') return Promise.resolve({ value: token });
			return Promise.resolve({ value: null });
		});

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		const result = await load({ url } as never);

		expect(mockSetAccessToken).toHaveBeenCalledTimes(1);
		expect(mockSetAccessToken).toHaveBeenCalledWith(token);
		expect(mockCheckOnboardingStatus).toHaveBeenCalledTimes(1);
		expect(mockAuthStateLogin).toHaveBeenCalledTimes(1);
		expect(mockRedirect).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	it('when token is null: redirects to login and does not call setAccessToken or login', async () => {
		mockPreferencesGet.mockResolvedValue({ value: null });

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({ url } as never)).rejects.toThrow('REDIRECT');
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockSetAccessToken).not.toHaveBeenCalled();
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});

	it('when token is empty string: redirects to login and does not call setAccessToken or login', async () => {
		mockPreferencesGet.mockResolvedValue({ value: '' });

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({ url } as never)).rejects.toThrow('REDIRECT');
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockSetAccessToken).not.toHaveBeenCalled();
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});

	it('when setAccessToken throws: redirects to login', async () => {
		const token = 'valid-token';
		mockPreferencesGet.mockImplementation((opts: { key: string }) =>
			opts.key === 'access_token' ? Promise.resolve({ value: token }) : Promise.resolve({ value: null })
		);
		mockSetAccessToken.mockRejectedValueOnce(new Error('Preferences failed'));

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({ url } as never)).rejects.toThrow('REDIRECT');

		expect(mockSetAccessToken).toHaveBeenCalledWith(token);
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});

	it('when 401 and passkey with stored credential ID: returns reauthRequired without redirect', async () => {
		const token = 'expired-token';
		const { ApiError } = await import('$lib/api/apiService');
		mockPreferencesGet.mockImplementation((opts: { key: string }) => {
			if (opts.key === 'access_token') return Promise.resolve({ value: token });
			if (opts.key === 'auth_method') return Promise.resolve({ value: 'passkey' });
			if (opts.key === 'webAuthnCredentialId') return Promise.resolve({ value: 'stored-cred-id' });
			return Promise.resolve({ value: null });
		});
		mockCheckOnboardingStatus.mockRejectedValueOnce(new ApiError('Unauthorized', 401));

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		const result = await load({ url: { pathname: '/dashboard/wallet', searchParams: new URLSearchParams() } } as never);

		expect(mockRedirect).not.toHaveBeenCalled();
		expect(mockAuthStateLogout).not.toHaveBeenCalled();
		expect(result).toEqual({
			reauthRequired: true,
			allowCredentialIds: ['stored-cred-id'],
			currentPath: '/dashboard/wallet'
		});
	});
});
