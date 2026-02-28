import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPreferencesSet = vi.hoisted(() => vi.fn());
const mockMigrationFactory = vi.hoisted(() => vi.fn());
const mockResetMigration = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		set: (...args: unknown[]) => mockPreferencesSet(...args),
		get: vi.fn().mockResolvedValue({ value: null }),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/paths', () => ({
	resolve: vi.fn((path: string) => path)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		update: vi.fn()
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: {
		updateProfile: vi.fn(),
		reset: vi.fn()
	}
}));

vi.mock('$lib/utils/session', () => ({
	clearSession: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/houdini/plugins/customAuthPlugin', () => ({
	setAccessToken: vi.fn().mockResolvedValue(undefined),
	clearPluginTokenCache: vi.fn()
}));

vi.mock('$lib/utils/helpers/migratePasskey', async () => {
	mockMigrationFactory();
	return {
		resetMigration: (...args: unknown[]) => mockResetMigration(...args)
	};
});

describe('auth.store migration import behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPreferencesSet.mockResolvedValue(undefined);
	});

	it('does not load migratePasskey during auth.store module import', async () => {
		await import('$lib/stores/auth.store');
		expect(mockMigrationFactory).not.toHaveBeenCalled();
	});

	it('loads migratePasskey lazily when setupAuthData executes', async () => {
		const { authState } = await import('$lib/stores/auth.store');
		expect(mockMigrationFactory).not.toHaveBeenCalled();

		await authState.setupAuthData('token', 'passkey', 'npub1', {}, undefined, false);

		expect(mockMigrationFactory).toHaveBeenCalledTimes(1);
		expect(mockResetMigration).toHaveBeenCalledTimes(1);
	});
});
