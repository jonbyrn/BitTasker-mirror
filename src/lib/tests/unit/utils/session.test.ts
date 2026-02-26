import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/stores/app.store', () => ({
	appStore: { resetUserState: vi.fn() }
}));
vi.mock('$lib/stores/contract.store', () => ({ contractStore: { reset: vi.fn() } }));
vi.mock('$lib/stores/bid.store', () => ({ bidStore: { reset: vi.fn() } }));
vi.mock('$lib/stores/task.store', () => ({
	tasksStore: { reset: vi.fn() },
	myTasksStore: { reset: vi.fn() }
}));
vi.mock('$lib/stores/profile.store', () => ({ profileStore: { reset: vi.fn() } }));
vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {},
	walletManager: { cleanup: vi.fn() }
}));
vi.mock('$lib/stores/user.store', () => ({
	nostrEventCache: { clear: vi.fn() }
}));
vi.mock('$lib/utils/profile-cache', () => ({ profileCache: { clear: vi.fn() } }));
vi.mock('$lib/utils/cache/bid-cache', () => ({
	smartCache: { clearAll: vi.fn() },
	currencyCache: { clear: vi.fn() }
}));
vi.mock('$lib/nostr/findTasks', () => ({ cleanup: vi.fn() }));
vi.mock('$lib/nostr/findMyTasks', () => ({ cleanupMyTasks: vi.fn() }));
vi.mock('$lib/nostr/findTaskees', () => ({ cleanup: vi.fn() }));

describe('clearSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rethrows when store reset throws', async () => {
		const { clearSession } = await import('$lib/utils/session');
		const { appStore } = await import('$lib/stores/app.store');
		vi.mocked(appStore.resetUserState).mockImplementationOnce(() => {
			throw new Error('reset failed');
		});
		await expect(clearSession()).rejects.toThrow('reset failed');
	});

	it('resolves when cleanup runs without error', async () => {
		const { clearSession } = await import('$lib/utils/session');
		await expect(clearSession()).resolves.toBeUndefined();
	});
});
