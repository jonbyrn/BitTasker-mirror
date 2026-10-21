import type { Budget, Task } from '$lib/types/task.d';
import type { LiveTask } from '$lib/types/homepage';
import { findTasks } from '$lib/nostr/findTasks';
import {
	FEATURED_HOMEPAGE_LIMIT,
	clearFeaturedHomepageCache,
	getFirstImageUrl,
	hasImageAttachment,
	loadFeaturedHomepageItems
} from '$lib/services/featuredHomepage';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { isFeaturedTestTask } from '$lib/services/featuredTestListing';

export { isFeaturedTestTask };

/**
 * Service to fetch featured tasks from Nostr relay
 * Prioritizes recently posted tasks whose deadline hasn't passed
 * Falls back to recently posted tasks (even expired) if not enough non-expired tasks
 * Proposals count is not displayed as it's not publicly accessible
 */
export class FeaturedTasksService {
	private static readonly CACHE_KEY = 'homepage:featured-tasks';

	/**
	 * Fetch featured tasks from Nostr relay
	 * Prioritizes non-expired tasks, fills remaining slots with expired tasks if needed
	 */
	static async getFeaturedTasks(limit: number = FEATURED_HOMEPAGE_LIMIT): Promise<LiveTask[]> {
		try {
			const featuredTasks = await loadFeaturedHomepageItems<Task>({
				cacheKey: this.CACHE_KEY,
				limit,
				getId: (task) => task.id,
				sorter: (left, right) => {
					const imageScore =
						Number(hasImageAttachment(right.attachments)) -
						Number(hasImageAttachment(left.attachments));
					if (imageScore !== 0) {
						return imageScore;
					}

					const leftCloseToExpiring = this.isCloseToExpiring(left);
					const rightCloseToExpiring = this.isCloseToExpiring(right);

					if (leftCloseToExpiring !== rightCloseToExpiring) {
						return Number(rightCloseToExpiring) - Number(leftCloseToExpiring);
					}

					return (right.createdAt ?? 0) - (left.createdAt ?? 0);
				},
				fetcher: async () => {
					const result = await findTasks({
						status: [TaskStatusEnum.OPEN],
						limit: 50,
						page: 1
					});

					const visibleTasks = result.tasks.filter((task) => !isFeaturedTestTask(task));
					const nonExpiredTasks = visibleTasks.filter((task) => !this.isExpired(task));
					const expiredTasks = visibleTasks.filter((task) => this.isExpired(task));
					const combinedTasks = [...nonExpiredTasks, ...expiredTasks];

					return combinedTasks;
				}
			});

			return featuredTasks.map((task) => this.convertToLiveTask(task));
		} catch (error) {
			console.error('Error fetching featured tasks:', error);
			return [];
		}
	}

	/**
	 * Check if a task has expired based on its deadline
	 */
	private static isExpired(task: Task): boolean {
		// If no deadline is set, the task is not expired
		if (!task.deadline) {
			return false;
		}

		const now = new Date();
		const deadlineDate = new Date(task.deadline);

		// Task is expired if current time is past the deadline
		return now.getTime() > deadlineDate.getTime();
	}

	/**
	 * Check if a task is close to expiring (within 24 hours)
	 */
	private static isCloseToExpiring(task: Task): boolean {
		if (!task.deadline) {
			return false;
		}

		const now = new Date();
		const deadlineDate = new Date(task.deadline);
		const diffMs = deadlineDate.getTime() - now.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);

		// Task is close to expiring if it has less than 24 hours left
		return diffHours > 0 && diffHours <= 24;
	}

	/**
	 * Get the first image from task attachments
	 */
	private static getFirstImage(task: Task): string {
		return getFirstImageUrl(task.attachments);
	}

	/**
	 * Convert Task to LiveTask format for homepage display
	 */
	private static convertToLiveTask(task: Task): LiveTask {
		// Calculate time left based on deadline
		const timeLeft = this.calculateTimeLeft(task.deadline);

		// Get budget amount (convert from sats to USD if needed)
		const budgetAmount = this.getBudgetAmount(task.budget);

		const locationDisplay =
			task.pickupLocation?.displayName ||
			task.pickupLocation?.formattedAddress ||
			(task.taskType === TaskTypeEnum.REMOTE ? 'Remote' : '');

		return {
			id: task.id,
			title: task.title,
			budget: budgetAmount,
			proposals: 0, // Not publicly accessible
			timeLeft,
			image: this.getFirstImage(task),
			description: task.description || '',
			location: locationDisplay || undefined
		};
	}

	/**
	 * Calculate time left until deadline
	 */
	private static calculateTimeLeft(deadline: string | null): string {
		if (!deadline) {
			return 'No deadline';
		}

		const now = new Date();
		const deadlineDate = new Date(deadline);
		const diffMs = deadlineDate.getTime() - now.getTime();

		// This should not happen since we filter out expired tasks, but just in case
		if (diffMs <= 0) {
			return 'Expired';
		}

		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffHours / 24);

		if (diffDays > 0) {
			return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
		} else if (diffHours > 0) {
			return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
		} else {
			const diffMinutes = Math.floor(diffMs / (1000 * 60));
			return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
		}
	}

	/**
	 * Get budget amount in USD
	 */
	private static getBudgetAmount(budget: Budget): number {
		if (!budget || !budget.amount) {
			return 0;
		}

		// If budget is in sats, convert to USD (rough conversion)
		if (budget.currency === 'SATS' || budget.currency === 'sats') {
			// Rough conversion: 1 USD ≈ 100,000 sats (adjust as needed)
			const usdAmount = budget.amount / 100000;
			return Math.max(1, Math.round(usdAmount)); // Minimum $1
		}

		// If already in USD or other fiat currency
		if (budget.currency === 'USD' || budget.currency === 'usd') {
			return Math.round(budget.amount);
		}

		// For other currencies, return the amount as-is (could be improved with real conversion)
		return Math.round(budget.amount);
	}

	/**
	 * Clear cache (useful for testing or manual refresh)
	 */
	static clearCache(): void {
		clearFeaturedHomepageCache(this.CACHE_KEY);
	}
}
