import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import type { TaskBodyDto } from '$lib/api/services/saved-search.service';

const mockPost = vi.fn();

vi.mock('$lib/api/axios', () => ({
	default: vi.fn().mockResolvedValue({
		post: mockPost
	})
}));

const { SavedSearchService } = await import('$lib/api/services/saved-search.service');

function createTaskBodyDto(overrides: Partial<TaskBodyDto> = {}): TaskBodyDto {
	return {
		eventId: 'event-123',
		title: 'Build a website',
		description: 'Need a full-stack developer to build a modern website',
		taskType: 'REMOTE',
		skills: ['JavaScript', 'TypeScript'],
		categories: ['development'],
		budget: {
			currency: 'USD',
			type: 'fixed',
			tier: 'medium'
		},
		...overrides
	};
}

function createAxiosError(status: number, message: string): AxiosError {
	const error = new AxiosError(message, String(status));
	error.response = {
		status,
		data: { message },
		statusText: message,
		headers: {},
		config: {} as never
	} as never;
	return error;
}

describe('SavedSearchService', () => {
	let service: InstanceType<typeof SavedSearchService>;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new SavedSearchService();
	});

	it('sends task body to check-task endpoint and returns result', async () => {
		mockPost.mockResolvedValue({
			data: {
				success: true,
				matchCount: 3,
				message: '3 saved search notifications sent'
			},
			status: 200,
			statusText: 'OK'
		});

		const dto = createTaskBodyDto();
		const result = await service.triggerSavedSearchCheck(dto);

		expect(mockPost).toHaveBeenCalledWith(
			'/api/v1/saved-searches/check-task',
			dto,
			undefined
		);
		expect(result).toEqual({
			success: true,
			matchCount: 3,
			message: '3 saved search notifications sent'
		});
	});

	it('throws on 401 unauthorized error', async () => {
		mockPost.mockRejectedValue(createAxiosError(401, 'Unauthorized'));

		await expect(service.triggerSavedSearchCheck(createTaskBodyDto())).rejects.toThrow(
			'Unauthorized. Please login again.'
		);
	});

	it('throws on 500 server error', async () => {
		mockPost.mockRejectedValue(createAxiosError(500, 'Internal Server Error'));

		await expect(service.triggerSavedSearchCheck(createTaskBodyDto())).rejects.toThrow(
			'Internal server error. Please try again later.'
		);
	});

	it('throws 500 message for plain errors (handled by BaseApiService)', async () => {
		mockPost.mockRejectedValue(new Error('Network timeout'));

		await expect(service.triggerSavedSearchCheck(createTaskBodyDto())).rejects.toThrow(
			'Internal server error. Please try again later.'
		);
	});

	it('sends title and description in the payload', async () => {
		mockPost.mockResolvedValue({
			data: { success: true, matchCount: 0, message: 'No matches' },
			status: 200,
			statusText: 'OK'
		});

		const dto = createTaskBodyDto({
			title: 'Specific Task Title',
			description: 'A very specific description for this task'
		});

		await service.triggerSavedSearchCheck(dto);

		const sentPayload = mockPost.mock.calls[0][1] as TaskBodyDto;
		expect(sentPayload.title).toBe('Specific Task Title');
		expect(sentPayload.description).toBe('A very specific description for this task');
		expect(sentPayload.title).not.toBe('');
		expect(sentPayload.description).not.toBe('');
	});

	it('sends optional location fields when provided', async () => {
		mockPost.mockResolvedValue({
			data: { success: true, matchCount: 0, message: 'No matches' },
			status: 200,
			statusText: 'OK'
		});

		const dto = createTaskBodyDto({
			pickupLocation: { longitude: -73.9857, latitude: 40.7484, displayName: 'NYC' },
			dropOffLocation: { longitude: -74.006, latitude: 40.7128, displayName: 'Manhattan' }
		});

		await service.triggerSavedSearchCheck(dto);

		const sentPayload = mockPost.mock.calls[0][1] as TaskBodyDto;
		expect(sentPayload.pickupLocation).toEqual({
			longitude: -73.9857,
			latitude: 40.7484,
			displayName: 'NYC'
		});
		expect(sentPayload.dropOffLocation).toEqual({
			longitude: -74.006,
			latitude: 40.7128,
			displayName: 'Manhattan'
		});
	});
});
