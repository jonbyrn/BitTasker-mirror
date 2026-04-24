import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { appStore, sanitizeRelayUrls } from '$lib/stores/app.store';

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
				biometricData: { password: 'x', npub: 'y' },
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

	describe('initializePool', () => {
		it('should return existing pool when already set', () => {
			const poolBefore = get(appStore).pool;
			const returned = appStore.initializePool();
			expect(returned).toBe(poolBefore);
			expect(get(appStore).pool).toBe(poolBefore);
		});
	});

	describe('sanitizeRelayUrls', () => {
		it('should parse comma-separated relay URLs', () => {
			const result = sanitizeRelayUrls('wss://relay1.example.com,wss://relay2.example.com');
			expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
		});

		it('should handle single relay URL', () => {
			const result = sanitizeRelayUrls('wss://relay.example.com');
			expect(result).toEqual(['wss://relay.example.com']);
		});

		it('should handle array of relay URLs', () => {
			const result = sanitizeRelayUrls(['wss://relay1.com', 'wss://relay2.com']);
			expect(result).toEqual(['wss://relay1.com', 'wss://relay2.com']);
		});

		it('should filter out invalid URLs and keep valid ones', () => {
			const result = sanitizeRelayUrls('invalid-url,wss://valid.com');
			expect(result).toEqual(['wss://valid.com']);
		});

		it('should reject non-secure WebSocket URLs (http://)', () => {
			const result = sanitizeRelayUrls('http://insecure.com');
			expect(result).toEqual([]);
		});

		it('should return empty array for empty string', () => {
			const result = sanitizeRelayUrls('');
			expect(result).toEqual([]);
		});

		it('should return empty array for undefined', () => {
			const result = sanitizeRelayUrls(undefined);
			expect(result).toEqual([]);
		});
	});
});
