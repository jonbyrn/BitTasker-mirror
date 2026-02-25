/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageKeys } from '$lib/utils/constants/storage';

// Confidence estimate for customAuthPlugin.ts after this suite:
// 0.88 (high confidence for request-path/auth-error behavior; medium for edge retries).

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const flushMicrotasks = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

type HarnessOptions = {
	browser: boolean;
	tokenValue?: string | null;
	tokenGetReject?: Error;
	/** When true, first Preferences.get returns a deferred promise; subsequent calls resolve with tokenValueForSync ?? tokenValue ?? null. */
	tokenGetDeferred?: boolean;
	/** Value for second and later get() when tokenGetDeferred is true (e.g. 'synced-token' for sync race test). */
	tokenValueForSync?: string | null;
	deviceMode?: 'resolved' | 'deferred' | 'rejected';
	deviceValue?: string;
	logoutRejectOnce?: boolean;
};

const loadHarness = async (options: HarnessOptions) => {
	vi.resetModules();

	const deviceDeferred = createDeferred<string>();
	const mockGoto = vi.fn();
	const mockLogout = vi.fn();
	const mockPreferences = {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	};
	const mockGetDeviceIdentifier = vi.fn();

	let tokenGetDeferred: Deferred<{ value: string | null }> | undefined;
	if (options.tokenGetReject) {
		mockPreferences.get.mockRejectedValue(options.tokenGetReject);
	} else if (options.tokenGetDeferred) {
		tokenGetDeferred = createDeferred<{ value: string | null }>();
		let getCallCount = 0;
		mockPreferences.get.mockImplementation(() => {
			getCallCount++;
			if (getCallCount === 1) return tokenGetDeferred!.promise;
			return Promise.resolve({
				value: options.tokenValueForSync ?? options.tokenValue ?? null
			});
		});
	} else {
		mockPreferences.get.mockResolvedValue({ value: options.tokenValue ?? null });
	}

	const deviceMode = options.deviceMode ?? 'resolved';
	if (deviceMode === 'deferred') {
		mockGetDeviceIdentifier.mockImplementation(() => deviceDeferred.promise);
	} else if (deviceMode === 'rejected') {
		mockGetDeviceIdentifier.mockRejectedValue(new Error('device init failed'));
	} else {
		mockGetDeviceIdentifier.mockResolvedValue(options.deviceValue ?? 'device-123');
	}

	vi.doMock('$app/environment', () => ({ browser: options.browser }));
	vi.doMock('$app/navigation', () => ({ goto: mockGoto }));
	vi.doMock('$app/paths', () => ({ resolve: (path: string) => path }));
	vi.doMock('@capacitor/preferences', () => ({ Preferences: mockPreferences }));
	vi.doMock('$lib/utils/helpers/deviceIdentity', () => ({
		getDeviceIdentifier: mockGetDeviceIdentifier
	}));
	vi.doMock('$lib/stores/auth.store', () => ({
		authState: {
			logout: mockLogout
		}
	}));

	if (options.logoutRejectOnce) {
		mockLogout.mockRejectedValueOnce(new Error('logout failed'));
	}

	const module = await import('$lib/utils/houdini/plugins/customAuthPlugin');

	return {
		authPlugin: module.default,
		TokenManager: module.TokenManager,
		syncTokenFromPreferences: module.syncTokenFromPreferences,
		setAccessToken: module.setAccessToken,
		clearPluginTokenCache: module.clearPluginTokenCache,
		mocks: {
			goto: mockGoto,
			logout: mockLogout,
			preferences: mockPreferences,
			getDeviceIdentifier: mockGetDeviceIdentifier
		},
		deviceDeferred,
		...(tokenGetDeferred && { tokenGetDeferred })
	};
};

describe('customAuthPlugin', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not block first request on slow device ID initialization', async () => {
		const { authPlugin, mocks, deviceDeferred } = await loadHarness({
			browser: true,
			tokenValue: 'token-abc',
			deviceMode: 'deferred'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx = {
			fetchParams: {
				headers: {
					'X-Existing': 'keep-me'
				}
			}
		} as any;

		const result = await Promise.race([
			plugin.beforeNetwork(ctx, { next } as any).then(() => 'done'),
			wait(100).then(() => 'timeout')
		]);
		expect(result).toBe('done');

		expect(next).toHaveBeenCalledOnce();
		expect(ctx.fetchParams.headers['X-Existing']).toBe('keep-me');
		expect(ctx.fetchParams.headers['Authorization']).toBe('Bearer token-abc');
		expect(ctx.fetchParams.headers['X-Device-ID']).toBeUndefined();

		deviceDeferred.resolve('device-late');
		await flushMicrotasks();
		// Let Node run the device promise continuation (initializeDeviceId) before second request
		await new Promise<void>((r) => setImmediate(r));

		const secondCtx = { fetchParams: { headers: {} } } as any;
		await plugin.beforeNetwork(secondCtx, { next: vi.fn() } as any);
		expect(secondCtx.fetchParams.headers['X-Device-ID']).toBe('device-late');
		expect(mocks.getDeviceIdentifier).toHaveBeenCalledOnce();
	});

	it('continues request flow when token initialization fails', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenGetReject: new Error('token read failed'),
			deviceMode: 'deferred'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx = { fetchParams: {} } as any;

		const result = await Promise.race([
			plugin.beforeNetwork(ctx, { next } as any).then(() => 'done'),
			wait(100).then(() => 'timeout')
		]);

		expect(result).toBe('done');
		expect(next).toHaveBeenCalledOnce();
		expect(ctx.fetchParams.headers?.Authorization).toBeUndefined();
	});

	it('passes through immediately when browser is false', async () => {
		const { authPlugin, mocks } = await loadHarness({
			browser: false
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx = { fetchParams: { headers: { foo: 'bar' } } } as any;

		const result = plugin.beforeNetwork(ctx, { next } as any);
		// When browser is false, beforeNetwork returns next(ctx) synchronously
		await result;

		expect(next).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.get).not.toHaveBeenCalled();
		expect(mocks.getDeviceIdentifier).not.toHaveBeenCalled();
		expect(ctx.fetchParams.headers.foo).toBe('bar');
	});

	it('handles UNAUTHENTICATED 401 by clearing token, logging out, and redirecting', async () => {
		const { authPlugin, mocks } = await loadHarness({
			browser: true
		});
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [
				{
					extensions: {
						code: 'UNAUTHENTICATED',
						originalError: { statusCode: 401 }
					}
				}
			]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).toHaveBeenCalledWith({ key: StorageKeys.ACCESS_TOKEN });
		expect(mocks.logout).toHaveBeenCalledOnce();
		expect(mocks.goto).toHaveBeenCalledWith('/auth/login');
	});

	it('does not redirect for non-auth GraphQL errors', async () => {
		const { authPlugin, mocks } = await loadHarness({
			browser: true
		});
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [
				{
					extensions: {
						code: 'FORBIDDEN',
						originalError: { statusCode: 403 }
					}
				}
			]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).not.toHaveBeenCalled();
		expect(mocks.logout).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('TokenManager set/clear use Preferences only in browser mode', async () => {
		const browserHarness = await loadHarness({
			browser: true
		});
		await browserHarness.TokenManager.setToken('new-token');
		await browserHarness.TokenManager.clearToken();

		expect(browserHarness.mocks.preferences.set).toHaveBeenCalledWith({
			key: StorageKeys.ACCESS_TOKEN,
			value: 'new-token'
		});
		expect(browserHarness.mocks.preferences.remove).toHaveBeenCalledWith({
			key: StorageKeys.ACCESS_TOKEN
		});

		const ssrHarness = await loadHarness({
			browser: false
		});
		await ssrHarness.TokenManager.setToken('ignored-token');
		await ssrHarness.TokenManager.clearToken();

		expect(ssrHarness.mocks.preferences.set).not.toHaveBeenCalled();
		expect(ssrHarness.mocks.preferences.remove).not.toHaveBeenCalled();
	});

	// --- Rec 1: End hook always resolve + guard double 401 ---
	it('calls resolve(ctx) even when Preferences.remove throws in end hook', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		mocks.preferences.remove.mockRejectedValueOnce(new Error('remove failed'));
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [{ extensions: { code: 'UNAUTHENTICATED', originalError: { statusCode: 401 } } }]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
	});

	it('calls resolve(ctx) even when authState.logout() throws in end hook', async () => {
		const { authPlugin, mocks } = await loadHarness({
			browser: true,
			logoutRejectOnce: true
		});
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [{ extensions: { code: 'UNAUTHENTICATED', originalError: { statusCode: 401 } } }]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.logout).toHaveBeenCalled();
	});

	it('calls logout and goto only once when two end() calls see 401 concurrently', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		const plugin = authPlugin();
		const resolve1 = vi.fn();
		const resolve2 = vi.fn();
		const ctx1 = {} as any;
		const ctx2 = {} as any;
		const value = {
			errors: [{ extensions: { code: 'UNAUTHENTICATED', originalError: { statusCode: 401 } } }]
		};

		await Promise.all([
			plugin.end(ctx1, { value, resolve: resolve1 } as any),
			plugin.end(ctx2, { value, resolve: resolve2 } as any)
		]);

		expect(resolve1).toHaveBeenCalledWith(ctx1);
		expect(resolve2).toHaveBeenCalledWith(ctx2);
		expect(mocks.logout).toHaveBeenCalledTimes(1);
		expect(mocks.goto).toHaveBeenCalledTimes(1);
	});

	// --- Rec 2: Headers merge when fetchParams.headers is Headers instance ---
	it('preserves existing headers when fetchParams.headers is a Headers instance', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenValue: 'token-xyz',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		// Headers-like object (has entries()) as Houdini may pass a Headers instance; tests merge behavior in all envs
		const headers = {
			entries: () =>
				[
					['X-Custom', 'custom-value'],
					['Accept', 'application/json']
				][Symbol.iterator]()
		};
		const ctx = {
			fetchParams: {
				headers
			}
		} as any;

		await plugin.beforeNetwork(ctx, { next } as any);

		expect(ctx.fetchParams.headers).toBeDefined();
		expect(ctx.fetchParams.headers['X-Custom']).toBe('custom-value');
		expect(ctx.fetchParams.headers['Accept']).toBe('application/json');
		expect(ctx.fetchParams.headers['Authorization']).toBe('Bearer token-xyz');
		expect(ctx.fetchParams.headers['X-Device-ID']).toBe('device-123');
	});

	// --- Rec 3: Broaden 401 auth detection ---
	it('treats any error with originalError.statusCode 401 as auth failure (not only UNAUTHENTICATED)', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [
				{
					message: 'Session expired',
					extensions: {
						code: 'SESSION_INVALID',
						originalError: { statusCode: 401 }
					}
				}
			]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).toHaveBeenCalledWith({ key: StorageKeys.ACCESS_TOKEN });
		expect(mocks.logout).toHaveBeenCalledOnce();
		expect(mocks.goto).toHaveBeenCalledWith('/auth/login');
	});

	// --- Rec 4: Clear plugin cache when token is cleared ---
	it('clears plugin token cache when TokenManager.clearToken() is called so next request has no Authorization', async () => {
		const { authPlugin, TokenManager } = await loadHarness({
			browser: true,
			tokenValue: 'token-to-clear'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBe('Bearer token-to-clear');

		await TokenManager.clearToken();

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBeUndefined();
	});

	// --- Stale token bug: prove plugin does not send token after setToken (server error cause) ---
	it('after TokenManager.setToken("new-token"), next beforeNetwork sends Authorization: Bearer new-token', async () => {
		const { authPlugin, TokenManager } = await loadHarness({
			browser: true,
			tokenValue: null
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBeUndefined();

		await TokenManager.setToken('new-token');

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBe('Bearer new-token');
	});

	// --- Stale token bug: prove plugin ignores token written to Preferences after init (login sim) ---
	it('after token is written to Preferences after plugin init (simulating login), next beforeNetwork does not send that token', async () => {
		const { authPlugin, mocks } = await loadHarness({
			browser: true,
			tokenValue: null
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBeUndefined();

		// Simulate login: write token to Preferences (plugin does not re-read, so cache stays stale)
		await mocks.preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: 'login-token' });

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next } as any);
		// Bug: plugin never synced, so it still sends no token (would cause server 401)
		expect(ctx2.fetchParams.headers['Authorization']).toBeUndefined();
	});

	// --- headersToObject: array and null/undefined ---
	it('merges headers when fetchParams.headers is an array of [key, value] tuples', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenValue: 'token-array',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx = {
			fetchParams: {
				headers: [
					['X-Custom', 'custom-value'],
					['Accept', 'application/json']
				] as [string, string][]
			}
		} as any;

		await plugin.beforeNetwork(ctx, { next } as any);

		expect(ctx.fetchParams.headers['X-Custom']).toBe('custom-value');
		expect(ctx.fetchParams.headers['Accept']).toBe('application/json');
		expect(ctx.fetchParams.headers['Authorization']).toBe('Bearer token-array');
		expect(ctx.fetchParams.headers['X-Device-ID']).toBe('device-123');
	});

	it('merges headers when fetchParams.headers is null or undefined (treats as empty)', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenValue: 'token-null',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctxNull = { fetchParams: { headers: null } } as any;
		await plugin.beforeNetwork(ctxNull, { next } as any);
		expect(ctxNull.fetchParams.headers['Authorization']).toBe('Bearer token-null');

		const ctxUndef = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctxUndef, { next: vi.fn() } as any);
		expect(ctxUndef.fetchParams.headers['Authorization']).toBe('Bearer token-null');
	});

	// --- isAuthFailure via end: value null, empty errors ---
	it('end hook resolves without logout when value is null', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;

		await plugin.end(ctx, { value: null, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).not.toHaveBeenCalled();
		expect(mocks.logout).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('end hook resolves without logout when value has empty errors array', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = { errors: [] };

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).not.toHaveBeenCalled();
		expect(mocks.logout).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('end hook resolves without logout when value has no errors property', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: true });
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).not.toHaveBeenCalled();
		expect(mocks.logout).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('end hook does not logout or redirect when browser is false (SSR) even on 401', async () => {
		const { authPlugin, mocks } = await loadHarness({ browser: false });
		const plugin = authPlugin();
		const resolve = vi.fn();
		const ctx = {} as any;
		const value = {
			errors: [{ extensions: { code: 'UNAUTHENTICATED', originalError: { statusCode: 401 } } }]
		};

		await plugin.end(ctx, { value, resolve } as any);

		expect(resolve).toHaveBeenCalledWith(ctx);
		expect(mocks.preferences.remove).not.toHaveBeenCalled();
		expect(mocks.logout).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	// --- syncTokenFromPreferences ---
	it('after syncTokenFromPreferences() re-reads token from Preferences, next beforeNetwork sends that token', async () => {
		const { authPlugin, mocks, syncTokenFromPreferences } = await loadHarness({
			browser: true,
			tokenValue: null
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBeUndefined();

		await mocks.preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: 'synced-token' });
		mocks.preferences.get.mockResolvedValue({ value: 'synced-token' });
		await syncTokenFromPreferences();

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next: vi.fn() } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBe('Bearer synced-token');
	});

	it('syncTokenFromPreferences does not throw when Preferences.get rejects; cache unchanged', async () => {
		const { authPlugin, mocks, syncTokenFromPreferences } = await loadHarness({
			browser: true,
			tokenValue: 'existing-token'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		await plugin.beforeNetwork({ fetchParams: {} } as any, { next } as any);
		expect(next).toHaveBeenCalled();

		mocks.preferences.get.mockRejectedValueOnce(new Error('get failed'));
		await expect(syncTokenFromPreferences()).resolves.toBeUndefined();

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next: vi.fn() } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBe('Bearer existing-token');
	});

	it('syncTokenFromPreferences does not call Preferences when browser is false', async () => {
		const { syncTokenFromPreferences, mocks } = await loadHarness({ browser: false });
		await syncTokenFromPreferences();
		expect(mocks.preferences.get).not.toHaveBeenCalled();
	});

	// --- setAccessToken non-browser ---
	it('setAccessToken does not call Preferences when browser is false', async () => {
		const { setAccessToken, mocks } = await loadHarness({ browser: false });
		await setAccessToken('no-op-token');
		expect(mocks.preferences.set).not.toHaveBeenCalled();
	});

	// --- clearPluginTokenCache when ref is null ---
	it('clearPluginTokenCache does not throw when plugin has not been created yet', () => {
		vi.resetModules();
		vi.doMock('$app/environment', () => ({ browser: true }));
		vi.doMock('$app/navigation', () => ({ goto: vi.fn() }));
		vi.doMock('@capacitor/preferences', () => ({
			Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
		}));
		vi.doMock('$lib/utils/helpers/deviceIdentity', () => ({
			getDeviceIdentifier: vi.fn().mockResolvedValue('device-id')
		}));
		vi.doMock('$lib/stores/auth.store', () => ({ authState: { logout: vi.fn() } }));
		return import('$lib/utils/houdini/plugins/customAuthPlugin').then((module) => {
			expect(() => module.clearPluginTokenCache()).not.toThrow();
		});
	});

	// --- Device ID initialization failure ---
	it('continues request without X-Device-ID when device ID initialization rejects', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenValue: 'token-ok',
			deviceMode: 'rejected'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		const ctx2 = { fetchParams: {} } as any;

		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBe('Bearer token-ok');
		expect(ctx1.fetchParams.headers['X-Device-ID']).toBeUndefined();

		await plugin.beforeNetwork(ctx2, { next: vi.fn() } as any);
		expect(ctx2.fetchParams.headers['X-Device-ID']).toBeUndefined();
	});

	// --- clearToken clears in-memory cache even when Preferences.remove throws ---
	it('TokenManager.clearToken clears plugin cache so next request has no Authorization even when Preferences.remove throws', async () => {
		const { authPlugin, TokenManager, mocks } = await loadHarness({
			browser: true,
			tokenValue: 'token-before-clear'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBe('Bearer token-before-clear');

		mocks.preferences.remove.mockRejectedValueOnce(new Error('remove failed'));
		await expect(TokenManager.clearToken()).rejects.toThrow('remove failed');

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next: vi.fn() } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBeUndefined();
	});

	// --- Empty string token: no Authorization header ---
	it('does not add Authorization header when token is empty string from init', async () => {
		const { authPlugin } = await loadHarness({
			browser: true,
			tokenValue: '',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx, { next } as any);
		expect(ctx.fetchParams.headers['Authorization']).toBeUndefined();
	});

	it('does not add Authorization header after TokenManager.setToken("")', async () => {
		const { authPlugin, TokenManager } = await loadHarness({
			browser: true,
			tokenValue: 'was-token'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		await TokenManager.setToken('');
		const ctx = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx, { next } as any);
		expect(ctx.fetchParams.headers['Authorization']).toBeUndefined();
	});

	// --- Race condition: syncTokenFromPreferences vs late initializeToken() ---
	it('synced token wins when syncTokenFromPreferences runs before init completes (late init does not overwrite)', async () => {
		const { authPlugin, syncTokenFromPreferences, tokenGetDeferred } = await loadHarness({
			browser: true,
			tokenGetDeferred: true,
			tokenValueForSync: 'synced-token',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		// Init started (first get is deferred); sync runs (second get resolves with synced-token)
		await syncTokenFromPreferences();
		tokenGetDeferred!.resolve({ value: 'old-token' });
		await flushMicrotasks();

		const ctx = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx, { next } as any);
		expect(ctx.fetchParams.headers['Authorization']).toBe('Bearer synced-token');
	});

	// --- Race condition: 401 logout vs late initializeToken() ---
	it('after 401 logout, late initializeToken() does not restore stale token', async () => {
		const { authPlugin, tokenGetDeferred } = await loadHarness({
			browser: true,
			tokenGetDeferred: true,
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const resolve = vi.fn();
		const value = {
			errors: [{ extensions: { code: 'UNAUTHENTICATED', originalError: { statusCode: 401 } } }]
		};
		await plugin.end({} as any, { value, resolve } as any);
		tokenGetDeferred!.resolve({ value: 'stale-token' });
		await flushMicrotasks();

		const ctx = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx, { next: vi.fn() } as any);
		expect(ctx.fetchParams.headers['Authorization']).toBeUndefined();
	});

	// --- Race condition: double factory call runs init only once ---
	it('calling authPlugin() twice before init completes starts token init only once', async () => {
		const { authPlugin, mocks, tokenGetDeferred } = await loadHarness({
			browser: true,
			tokenGetDeferred: true,
			tokenValueForSync: 'single-token',
			deviceMode: 'resolved'
		});
		const plugin1 = authPlugin();
		authPlugin(); // second factory call; should not start another init
		// First factory started init (one get); second factory did not start another init
		expect(mocks.preferences.get).toHaveBeenCalledTimes(1);

		tokenGetDeferred!.resolve({ value: 'single-token' });
		await flushMicrotasks();

		const ctx = { fetchParams: {} } as any;
		await plugin1.beforeNetwork(ctx, { next: vi.fn() } as any);
		expect(ctx.fetchParams.headers['Authorization']).toBe('Bearer single-token');
	});

	// --- Baseline: init completes before sync, sync overwrites ---
	it('when init completes before sync, syncTokenFromPreferences overwrites token for next request', async () => {
		const { authPlugin, mocks, syncTokenFromPreferences } = await loadHarness({
			browser: true,
			tokenValue: 'init-token',
			deviceMode: 'resolved'
		});
		const plugin = authPlugin();
		const next = vi.fn();
		const ctx1 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx1, { next } as any);
		expect(ctx1.fetchParams.headers['Authorization']).toBe('Bearer init-token');

		mocks.preferences.get.mockResolvedValue({ value: 'synced-token' });
		await syncTokenFromPreferences();

		const ctx2 = { fetchParams: {} } as any;
		await plugin.beforeNetwork(ctx2, { next: vi.fn() } as any);
		expect(ctx2.fetchParams.headers['Authorization']).toBe('Bearer synced-token');
	});
});
