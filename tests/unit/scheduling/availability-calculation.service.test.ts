import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectTaskeeAvailabilityData } from '$lib/services/availability-calculation.service';
import { getUserContracts } from '$lib/utils/nostr-bid';
import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';
import type { Task } from '$lib/types/task';

// Mock dependencies
vi.mock('$lib/utils/nostr-bid');
vi.mock('$lib/utils/nostr-message');
vi.mock('$lib/utils/scheduling-utils', () => ({
	generateNonce: () => 'test-nonce-1234567890123456789012345678901234567890123456789012345678901234'
}));

describe('Availability Calculation Service', () => {
	const mockTaskeePubkey = 'taskee-pubkey-123';
	const mockTaskerPubkey = 'tasker-pubkey-456';
	const mockBidId = 'bid-123';
	const mockTaskId = 'task-123';

	const mockTask: Task = {
		id: mockTaskId,
		npub: mockTaskerPubkey,
		status: 'OPEN',
		title: 'Test Task',
		taskType: 'REMOTE',
		description: 'Test description',
		budget: {
			amount: 100,
			currency: 'BTC',
			type: 'FIXED'
		},
		deadline: null,
		dateRange: {
			start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
			end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
		},
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		estimatedHours: 2,
		createdAt: Date.now(),
		updatedAt: new Date().toISOString(),
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('collectTaskeeAvailabilityData', () => {
		it('should collect availability data scoped to task window', async () => {
			const mockProfile = {
				availability: {
					timeSlots: [
						{ day: 1, start: '09:00', end: '17:00' }, // Monday
						{ day: 2, start: '09:00', end: '17:00' } // Tuesday
					],
					timezone: 'America/New_York',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			};

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue(mockProfile as any);
			vi.mocked(getUserContracts).mockResolvedValue([]);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			expect(result.messageType).toBe('availability-response');
			expect(result.bidId).toBe(mockBidId);
			expect(result.taskId).toBe(mockTaskId);
			expect(result.taskerPubkey).toBe(mockTaskerPubkey);
			expect(result.taskeePubkey).toBe(mockTaskeePubkey);
			expect(result.timestamp).toBeGreaterThan(0);
			expect(result.taskWindow.start).toBeGreaterThan(0);
			expect(result.taskWindow.end).toBeGreaterThan(result.taskWindow.start);
			expect(result.profileAvailability.timeSlots).toHaveLength(2);
			expect(result.blockedTimes).toEqual([]);
			expect(result.nonce).toBeDefined();
		});

		it('should limit task window to 30 days max', async () => {
			const longTask: Task = {
				...mockTask,
				dateRange: {
					start: new Date().toISOString(),
					end: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days
				}
			};

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);
			vi.mocked(getUserContracts).mockResolvedValue([]);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				longTask,
				mockBidId,
				mockTaskerPubkey
			);

			const windowDuration = result.taskWindow.end - result.taskWindow.start;
			const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
			expect(windowDuration).toBeLessThanOrEqual(maxDuration);
		});

		it('should use deadline if dateRange not provided', async () => {
			const taskWithDeadline: Task = {
				...mockTask,
				dateRange: null,
				deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days
			};

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);
			vi.mocked(getUserContracts).mockResolvedValue([]);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				taskWithDeadline,
				mockBidId,
				mockTaskerPubkey
			);

			expect(result.taskWindow.start).toBeGreaterThan(0);
			expect(result.taskWindow.end).toBeGreaterThan(result.taskWindow.start);
		});

		it('should filter blocked times within task window', async () => {
			const now = Date.now();
			const tomorrow = now + 24 * 60 * 60 * 1000;
			const dayAfter = now + 2 * 24 * 60 * 60 * 1000;

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [{ day: 1, start: '09:00', end: '17:00' }],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);

			vi.mocked(getUserContracts).mockResolvedValue([
				{
					contract: {
						freelancerPubkey: mockTaskeePubkey,
						status: 'active',
						taskId: 'other-task',
						estimatedStartTime: Math.floor(tomorrow / 1000), // Tomorrow
						estimatedCompletionTime: Math.floor(dayAfter / 1000) // Day after
					}
				}
			] as any);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			expect(result.blockedTimes.length).toBeGreaterThan(0);
			expect(result.blockedTimes[0].taskId).toBe('other-task');
		});

		it('should filter out past blocked times', async () => {
			const pastTime = Date.now() - 24 * 60 * 60 * 1000; // Yesterday

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);

			vi.mocked(getUserContracts).mockResolvedValue([
				{
					contract: {
						freelancerPubkey: mockTaskeePubkey,
						status: 'active',
						taskId: 'past-task',
						estimatedStartTime: Math.floor(pastTime / 1000),
						estimatedCompletionTime: Math.floor(pastTime / 1000) + 3600 // 1 hour later
					}
				}
			] as any);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			// Past blocked times should be filtered out
			expect(result.blockedTimes.every((bt) => bt.endTime > Date.now())).toBe(true);
		});

		it('should use default values if profile availability missing', async () => {
			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({} as any);
			vi.mocked(getUserContracts).mockResolvedValue([]);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			expect(result.profileAvailability.timeSlots).toEqual([]);
			expect(result.profileAvailability.timezone).toBeDefined();
			expect(result.profileAvailability.noticeHours).toBeGreaterThan(0);
			expect(result.profileAvailability.maxBookingsPerDay).toBeGreaterThan(0);
			expect(result.profileAvailability.breakBetweenBookings).toBeGreaterThan(0);
		});

		it('should only include contracts where taskee is freelancer', async () => {
			const futureTime = Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000) / 1000); // 2 days from now

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);

			vi.mocked(getUserContracts).mockResolvedValue([
				{
					contract: {
						freelancerPubkey: 'different-pubkey', // Not the taskee
						status: 'active',
						taskId: 'other-task',
						estimatedStartTime: futureTime,
						estimatedCompletionTime: futureTime + 3600
					}
				},
				{
					contract: {
						freelancerPubkey: mockTaskeePubkey, // This is the taskee
						status: 'active',
						taskId: 'taskee-task',
						estimatedStartTime: futureTime,
						estimatedCompletionTime: futureTime + 3600
					}
				}
			] as any);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			// Should only include contract where taskee is freelancer
			expect(result.blockedTimes.length).toBe(1);
			expect(result.blockedTimes[0].taskId).toBe('taskee-task');
		});

		it('should only include active contracts', async () => {
			const futureTime = Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000) / 1000); // 2 days from now

			vi.mocked(fetchComprehensiveProfile).mockResolvedValue({
				availability: {
					timeSlots: [],
					timezone: 'UTC',
					noticeHours: 24,
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				}
			} as any);

			vi.mocked(getUserContracts).mockResolvedValue([
				{
					contract: {
						freelancerPubkey: mockTaskeePubkey,
						status: 'completed', // Not active
						taskId: 'completed-task',
						estimatedStartTime: futureTime,
						estimatedCompletionTime: futureTime + 3600
					}
				},
				{
					contract: {
						freelancerPubkey: mockTaskeePubkey,
						status: 'active', // Active
						taskId: 'active-task',
						estimatedStartTime: futureTime,
						estimatedCompletionTime: futureTime + 3600
					}
				}
			] as any);

			const result = await collectTaskeeAvailabilityData(
				mockTaskeePubkey,
				mockTask,
				mockBidId,
				mockTaskerPubkey
			);

			// Should only include active contract
			expect(result.blockedTimes.length).toBe(1);
			expect(result.blockedTimes[0].taskId).toBe('active-task');
		});
	});
});

