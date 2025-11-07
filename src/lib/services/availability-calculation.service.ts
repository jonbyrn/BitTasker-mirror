import type { Task } from '$lib/types/task';
import type { AvailabilityResponse } from '$lib/types/scheduling';
import type { TimeSlot, Availability } from '$lib/types/profile';
import { getUserContracts } from '$lib/utils/nostr-bid';
import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';
import { generateNonce } from '$lib/utils/scheduling-utils';

/**
 * Service for collecting and calculating taskee availability data
 */

const MAX_AVAILABILITY_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get task window from task (dateRange or deadline)
 * Returns window limited to max 30 days
 */
function getTaskWindow(task: Task): { start: number; end: number } {
	const now = Date.now();
	let start: number;
	let end: number;

	if (task.dateRange) {
		// Use dateRange if available
		start = new Date(task.dateRange.start).getTime();
		end = new Date(task.dateRange.end).getTime();
	} else if (task.deadline) {
		// Use deadline if no dateRange
		start = now;
		end = new Date(task.deadline).getTime();
	} else {
		// Default to 30 days from now
		start = now;
		end = now + MAX_AVAILABILITY_DAYS * MILLISECONDS_PER_DAY;
	}

	// Ensure start is not in the past
	if (start < now) {
		start = now;
	}

	// Limit to max 30 days
	const maxEnd = start + MAX_AVAILABILITY_DAYS * MILLISECONDS_PER_DAY;
	if (end > maxEnd) {
		end = maxEnd;
	}

	return { start, end };
}

/**
 * Get blocked times from active contracts within the task window
 */
async function getBlockedTimesWithinWindow(
	taskeePubkey: string,
	taskWindow: { start: number; end: number }
): Promise<Array<{ startTime: number; endTime: number; taskId: string }>> {
	try {
		const contracts = await getUserContracts();
		const blockedTimes: Array<{ startTime: number; endTime: number; taskId: string }> = [];

		const now = Date.now();

		for (const { contract } of contracts) {
			// Only consider active contracts where taskee is the freelancer
			const contractFreelancerPubkey =
				typeof contract.freelancerPubkey === 'string'
					? contract.freelancerPubkey
					: contract.freelancerPubkey || '';

			if (
				contractFreelancerPubkey.toLowerCase() === taskeePubkey.toLowerCase() &&
				contract.status === 'active'
			) {
				// Handle both seconds and milliseconds timestamps
				const startTime =
					contract.estimatedStartTime > 1000000000000
						? contract.estimatedStartTime
						: contract.estimatedStartTime * 1000; // Convert to milliseconds
				const endTime =
					contract.estimatedCompletionTime > 1000000000000
						? contract.estimatedCompletionTime
						: contract.estimatedCompletionTime * 1000; // Convert to milliseconds

				// Only include if it overlaps with task window and is in the future
				if (
					startTime < taskWindow.end &&
					endTime > taskWindow.start &&
					endTime > now // Only future/present blocked times
				) {
					blockedTimes.push({
						startTime: Math.max(startTime, taskWindow.start),
						endTime: Math.min(endTime, taskWindow.end),
						taskId: contract.taskId
					});
				}
			}
		}

		return blockedTimes;
	} catch (error) {
		console.error('Error getting blocked times:', error);
		return [];
	}
}

/**
 * Collect taskee availability data scoped to task window
 */
export async function collectTaskeeAvailabilityData(
	taskeePubkey: string,
	task: Task,
	bidId: string,
	taskerPubkey: string
): Promise<AvailabilityResponse> {
	// Get task window (limited to 30 days max)
	const taskWindow = getTaskWindow(task);

	// Fetch taskee profile availability
	const profile = await fetchComprehensiveProfile(taskeePubkey);
	const profileAvailability: Availability = {
		timeSlots: profile.availability?.timeSlots || [],
		timezone: profile.availability?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
		noticeHours: profile.availability?.noticeHours || 24,
		maxBookingsPerDay: profile.availability?.maxBookingsPerDay || 5,
		breakBetweenBookings: profile.availability?.breakBetweenBookings || 60
	};

	// Get blocked times from active contracts
	const blockedTimes = await getBlockedTimesWithinWindow(taskeePubkey, taskWindow);

	// Filter out past blocked times (they're no longer relevant)
	const now = Date.now();
	const relevantBlockedTimes = blockedTimes.filter(
		(blocked) => blocked.endTime > now
	);

	// Create availability response with current timestamp
	const availabilityResponse: AvailabilityResponse = {
		messageType: 'availability-response',
		bidId,
		taskId: task.id,
		taskerPubkey,
		taskeePubkey,
		timestamp: Date.now(), // Always use current timestamp for freshness
		taskWindow,
		profileAvailability: {
			timeSlots: profileAvailability.timeSlots,
			timezone: profileAvailability.timezone,
			noticeHours: profileAvailability.noticeHours,
			maxBookingsPerDay: profileAvailability.maxBookingsPerDay,
			breakBetweenBookings: profileAvailability.breakBetweenBookings
		},
		blockedTimes: relevantBlockedTimes, // Only include future blocked times
		nonce: generateNonce()
	};

	return availabilityResponse;
}

