import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import { appStore } from '$lib/stores/app.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getCachedViewerNpub } from '$lib/nostr/findServices';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

describe('getCachedViewerNpub', () => {
	const mockPreferencesGet = vi.mocked(Preferences.get);

	beforeEach(() => {
		vi.clearAllMocks();
		appStore.update((state) => ({
			...state,
			nostrKeys: {
				...state.nostrKeys,
				npub: null
			}
		}));
		mockPreferencesGet.mockResolvedValue({ value: null });
	});

	describe('when Preferences has a valid npub', () => {
		it('should return the npub from Preferences when in-memory store is empty', async () => {
			const storedNpub = 'npub1test123456789abcdef';
			mockPreferencesGet.mockResolvedValue({ value: storedNpub });

			const result = await getCachedViewerNpub();

			expect(result).toBe(storedNpub);
			expect(mockPreferencesGet).toHaveBeenCalledWith({ key: StorageKeys.NPUB });
		});

		it('should return the npub from Preferences with whitespace trimmed', async () => {
			const storedNpub = 'npub1test123456789abcdef';
			mockPreferencesGet.mockResolvedValue({ value: `  ${storedNpub}  ` });

			const result = await getCachedViewerNpub();

			expect(result).toBe(`  ${storedNpub}  `);
		});
	});

	describe('when in-memory store has a cached npub', () => {
		it('should return the in-memory npub and not check Preferences', async () => {
			const inMemoryNpub = 'npub1memory123456789abcdef';
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: inMemoryNpub
				}
			}));

			const result = await getCachedViewerNpub();

			expect(result).toBe(inMemoryNpub);
			expect(mockPreferencesGet).not.toHaveBeenCalled();
		});

		it('should return the in-memory npub even if Preferences has a different value', async () => {
			const inMemoryNpub = 'npub1memory123456789abcdef';
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: inMemoryNpub
				}
			}));
			mockPreferencesGet.mockResolvedValue({ value: 'npub1preferences123456789' });

			const result = await getCachedViewerNpub();

			expect(result).toBe(inMemoryNpub);
		});
	});

	describe('when both are empty/undefined', () => {
		it('should return null when in-memory npub is null and Preferences returns null', async () => {
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: null
				}
			}));
			mockPreferencesGet.mockResolvedValue({ value: null });

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});

		it('should return null when in-memory npub is undefined and Preferences returns undefined', async () => {
			mockPreferencesGet.mockResolvedValue({ value: undefined as unknown as string | null });

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});

		it('should return null when Preferences returns empty string', async () => {
			mockPreferencesGet.mockResolvedValue({ value: '' });

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});

		it('should return null when Preferences returns only whitespace', async () => {
			mockPreferencesGet.mockResolvedValue({ value: '   ' });

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});
	});

	describe('when npub is invalid', () => {
		it('should return null when in-memory npub is an empty string', async () => {
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: ''
				}
			}));

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});

		it('should return null when in-memory npub is only whitespace', async () => {
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: '   '
				}
			}));

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
		});

		it('should fall back to Preferences when in-memory npub is whitespace-only', async () => {
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					npub: '   '
				}
			}));
			const validNpub = 'npub1valid123456789abcdef';
			mockPreferencesGet.mockResolvedValue({ value: validNpub });

			const result = await getCachedViewerNpub();

			expect(result).toBe(validNpub);
		});
	});

	describe('error handling', () => {
		it('should return null when Preferences.get throws an error', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			mockPreferencesGet.mockRejectedValue(new Error('Storage error'));

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
			vi.restoreAllMocks();
		});

		it('should return null when Preferences.get throws a non-Error object', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			mockPreferencesGet.mockRejectedValue('string error');

			const result = await getCachedViewerNpub();

			expect(result).toBeNull();
			vi.restoreAllMocks();
		});
	});
});
