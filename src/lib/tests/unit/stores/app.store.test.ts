import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';

describe('appStore', () => {
	beforeEach(() => {
		// Reset user-specific state so tests don't depend on order
		appStore.resetUserState();
		// Clear toasts so toast tests don't see leftovers from other tests
		appStore.update((s) => ({ ...s, toasts: [] }));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('should have correct initial shape', () => {
			const state = get(appStore);
			expect(state.nostrKeys).toEqual({
				nsec: null,
				npub: null,
				mnemonic: null
			});
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.toasts).toEqual([]);
			expect(state.biometricData).toBe(null);
			expect(typeof state.network).toBe('string');
			expect(Array.isArray(state.relays)).toBe(true);
			expect(state.pool).toBeDefined();
		});
	});

	describe('resetUserState', () => {
		it('should clear nostrKeys, biometricData, and error', () => {
			appStore.update((s) => ({
				...s,
				nostrKeys: {
					nsec: new Uint8Array([1]),
					npub: 'npub123',
					mnemonic: 'abandon abandon'
				},

				error: 'Some error'
			}));

			appStore.resetUserState();

			const state = get(appStore);
			expect(state.nostrKeys).toEqual({
				nsec: null,
				npub: null,
				mnemonic: null
			});
			expect(state.biometricData).toBe(null);
			expect(state.error).toBe(null);
		});
	});

	describe('toasts', () => {
		it('should add success toast with type and message', () => {
			appStore.showSuccessToast('Saved!');
			const state = get(appStore);
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0].type).toBe('success');
			expect(state.toasts[0].message).toBe('Saved!');
			expect(typeof state.toasts[0].id).toBe('number');
		});

		it('should add error toast with type and message', () => {
			appStore.showErrorToast('Something failed');
			const state = get(appStore);
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0].type).toBe('error');
			expect(state.toasts[0].message).toBe('Something failed');
		});

		it('should add info toast with type and message', () => {
			appStore.showInfoToast('Tip: use dark mode');
			const state = get(appStore);
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0].type).toBe('info');
			expect(state.toasts[0].message).toBe('Tip: use dark mode');
		});

		it('should assign unique ids to multiple toasts', () => {
			appStore.showSuccessToast('One');
			appStore.showErrorToast('Two');
			const state = get(appStore);
			expect(state.toasts).toHaveLength(2);
			expect(state.toasts[0].id).not.toBe(state.toasts[1].id);
		});

		it('should remove toast after timeout', () => {
			vi.useFakeTimers();
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showSuccessToast('Gone soon', 3000);
			expect(get(appStore).toasts).toHaveLength(1);

			vi.advanceTimersByTime(3000);

			expect(get(appStore).toasts).toHaveLength(0);
		});
	});

	describe('toast deduplication', () => {
		it('should deduplicate toasts with the same dedupKey', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('Msg', 3000, { dedupKey: 'key-1' });
			appStore.showInfoToast('Msg', 3000, { dedupKey: 'key-1' });
			appStore.showInfoToast('Msg', 3000, { dedupKey: 'key-1' });

			expect(get(appStore).toasts).toHaveLength(1);
		});

		it('should allow toasts with different dedupKeys', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('A', 3000, { dedupKey: 'key-a' });
			appStore.showInfoToast('B', 3000, { dedupKey: 'key-b' });

			expect(get(appStore).toasts).toHaveLength(2);
		});

		it('should allow toasts without dedupKey to duplicate', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('Repeated');
			appStore.showInfoToast('Repeated');

			expect(get(appStore).toasts).toHaveLength(2);
		});

		it('should deduplicate showSuccessToast with dedupKey', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showSuccessToast('Done', 3000, { dedupKey: 'success-dedup' });
			appStore.showSuccessToast('Done', 3000, { dedupKey: 'success-dedup' });

			expect(get(appStore).toasts).toHaveLength(1);
		});

		it('should deduplicate showErrorToast with dedupKey', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			appStore.showErrorToast('Fail', 3000, { dedupKey: 'error-dedup' });
			appStore.showErrorToast('Fail', 3000, { dedupKey: 'error-dedup' });

			expect(get(appStore).toasts).toHaveLength(1);
		});

		it('should allow new toast with same dedupKey after expiry', () => {
			vi.useFakeTimers();
			appStore.update((s) => ({ ...s, toasts: [] }));

			appStore.showInfoToast('First', 500, { dedupKey: 'expire-test' });
			expect(get(appStore).toasts).toHaveLength(1);

			// Advance past toast auto-dismiss (500ms) + dedup min retention (3000ms)
			vi.advanceTimersByTime(4000);
			expect(get(appStore).toasts).toHaveLength(0);

			// Same dedupKey should now be allowed
			appStore.showInfoToast('Second', 3000, { dedupKey: 'expire-test' });
			expect(get(appStore).toasts).toHaveLength(1);
			expect(get(appStore).toasts[0].message).toBe('Second');
		});

		it('should simulate WebSocket + FCM duplicate (same dedupKey → one toast)', () => {
			appStore.update((s) => ({ ...s, toasts: [] }));
			const title = 'New bid received';
			const dedupKey = `toast-dedup:${title}`;

			// WebSocket fires first (notificationSocket.service.ts pattern)
			appStore.showInfoToast(title, 3000, { dedupKey });
			// FCM fires immediately after with the same key (push-notification.service.ts pattern)
			appStore.showInfoToast(title, 3000, { dedupKey });

			expect(get(appStore).toasts).toHaveLength(1);
		});
	});

	describe('initializePool', () => {
		it('should return existing pool when already set', () => {
			const poolBefore = get(appStore).pool;
			const returned = appStore.initializePool();
			expect(returned).toBe(poolBefore);
			expect(get(appStore).pool).toBe(poolBefore);
		});
	});
});
