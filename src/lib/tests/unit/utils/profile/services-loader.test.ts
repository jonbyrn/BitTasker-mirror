import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindProfileServicesByAuthor = vi.fn();
const mockGetNpub = vi.fn();

vi.mock('$lib/nostr/findProfileServices', () => ({
	findProfileServicesByAuthor: (...args: unknown[]) => mockFindProfileServicesByAuthor(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => mockGetNpub(...args)
}));

describe('loadCurrentProfileServices', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('returns empty services without error when no current pubkey is available', async () => {
		mockGetNpub.mockResolvedValue(null);
		const { loadCurrentProfileServices } = await import('$lib/utils/profile/services-loader');

		await expect(loadCurrentProfileServices()).resolves.toEqual({
			services: [],
			error: null
		});
		expect(mockFindProfileServicesByAuthor).not.toHaveBeenCalled();
	});

	it('returns active services for the current user', async () => {
		mockGetNpub.mockResolvedValue('npub1profiletest');
		mockFindProfileServicesByAuthor.mockResolvedValue([
			{ id: 'service-1', uniqueId: 'service-1', title: 'Logo Design' }
		]);
		const { loadCurrentProfileServices } = await import('$lib/utils/profile/services-loader');

		await expect(loadCurrentProfileServices()).resolves.toEqual({
			services: [{ id: 'service-1', uniqueId: 'service-1', title: 'Logo Design' }],
			error: null
		});
		expect(mockFindProfileServicesByAuthor).toHaveBeenCalledWith('npub1profiletest', { limit: 12 });
	});

	it('fails closed with a deterministic local error message when the query throws', async () => {
		mockGetNpub.mockResolvedValue('npub1profiletest');
		mockFindProfileServicesByAuthor.mockRejectedValue(new Error('relay timeout'));
		const { loadCurrentProfileServices } = await import('$lib/utils/profile/services-loader');

		await expect(loadCurrentProfileServices()).resolves.toEqual({
			services: [],
			error: 'Failed to load profile services'
		});
	});
});
