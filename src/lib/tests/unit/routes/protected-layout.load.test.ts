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

const mockAuthStateLogin = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/stores/auth.store', () => ({
	authState: {
		login: () => mockAuthStateLogin()
	}
}));

describe('(protected) layout load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPreferencesGet.mockResolvedValue({ value: null });
		mockSetAccessToken.mockResolvedValue(undefined);
		mockAuthStateLogin.mockResolvedValue(undefined);
	});

	it('when token exists: syncs token to plugin then calls authState.login()', async () => {
		const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
		mockPreferencesGet.mockResolvedValue({ value: token });

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await load({} as never);

		expect(mockSetAccessToken).toHaveBeenCalledTimes(1);
		expect(mockSetAccessToken).toHaveBeenCalledWith(token);
		expect(mockAuthStateLogin).toHaveBeenCalledTimes(1);
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it('when token is null: redirects to login and does not call setAccessToken or login', async () => {
		mockPreferencesGet.mockResolvedValue({ value: null });

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({} as never)).rejects.toThrow('REDIRECT');
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockSetAccessToken).not.toHaveBeenCalled();
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});

	it('when token is empty string: redirects to login and does not call setAccessToken or login', async () => {
		mockPreferencesGet.mockResolvedValue({ value: '' });

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({} as never)).rejects.toThrow('REDIRECT');
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockSetAccessToken).not.toHaveBeenCalled();
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});

	it('when setAccessToken throws: redirects to login', async () => {
		const token = 'valid-token';
		mockPreferencesGet.mockResolvedValue({ value: token });
		mockSetAccessToken.mockRejectedValueOnce(new Error('Preferences failed'));

		const { load } = await import('../../../../routes/(protected)/+layout.ts');

		await expect(load({} as never)).rejects.toThrow('REDIRECT');

		expect(mockSetAccessToken).toHaveBeenCalledWith(token);
		expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/login');
		expect(mockAuthStateLogin).not.toHaveBeenCalled();
	});
});
