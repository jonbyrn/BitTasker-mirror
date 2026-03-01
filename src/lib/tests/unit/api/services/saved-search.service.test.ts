import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BaseApiService } from '$lib/api/apiService';
import { SavedSearchService, type TaskBodyDto } from '$lib/api/services/saved-search.service';

type BaseApiServiceMethods = {
	post: (...args: unknown[]) => unknown;
};

const sampleTaskBody: TaskBodyDto = {
	eventId: 'event-123',
	title: 'Fix sink',
	taskType: 'plumbing',
	description: 'Kitchen sink is leaking',
	budget: {
		currency: 'USD',
		type: 'fixed',
		tier: 'medium'
	},
	skills: ['plumbing'],
	categories: ['home-services']
};

describe('SavedSearchService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns response data when request succeeds', async () => {
		const postSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'post');
		postSpy.mockResolvedValueOnce({
			data: {
				success: true,
				matchCount: 3,
				message: 'Matched successfully'
			}
		});

		const service = new SavedSearchService();
		await expect(service.triggerSavedSearchCheck(sampleTaskBody)).resolves.toEqual({
			success: true,
			matchCount: 3,
			message: 'Matched successfully'
		});
	});

	it('preserves 401 errors as ApiError', async () => {
		const postSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'post');
		postSpy.mockRejectedValueOnce(new ApiError('Unauthorized', 401, { message: 'Token expired' }));

		const service = new SavedSearchService();
		try {
			await service.triggerSavedSearchCheck(sampleTaskBody);
			throw new Error('Expected triggerSavedSearchCheck to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toMatchObject({
				status: 401,
				message: 'Unauthorized'
			});
		}
	});

	it('preserves backend 500 message as ApiError', async () => {
		const postSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'post');
		postSpy.mockRejectedValueOnce(
			new ApiError('Internal server error. Please try again later.', 500, {
				message: 'Server overloaded'
			})
		);

		const service = new SavedSearchService();
		try {
			await service.triggerSavedSearchCheck(sampleTaskBody);
			throw new Error('Expected triggerSavedSearchCheck to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toMatchObject({
				status: 500
			});
		}
	});
});
