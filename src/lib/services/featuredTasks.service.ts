import type { Budget, Task } from '$lib/types/task.d';
import type { LiveTask } from '$lib/types/homepage';
import { findTasks } from '$lib/nostr/findTasks';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

/**
 * Service to fetch featured tasks from Nostr relay
 * Filters tasks that have images, are not expired, and are publicly available
 * Prioritizes tasks that are close to expiring (within 24 hours)
 * Only shows tasks with actual image attachments (no fallback images)
 * Proposals count is not displayed as it's not publicly accessible
 */
export class FeaturedTasksService {
	private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
	private static cache: { data: LiveTask[]; timestamp: number } | null = null;

	/**
	 * Fetch featured tasks with images from Nostr relay
	 */
	static async getFeaturedTasks(limit: number = 8): Promise<LiveTask[]> {
		// Check cache first
		if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
			return this.cache.data.slice(0, limit);
		}

		try {
			// Fetch tasks from Nostr relay
			const result = await findTasks({
				status: [TaskStatusEnum.OPEN],
				limit: 50, // Fetch more to filter for images
				page: 1
			});

			// Filter tasks that have images and are not expired
			const validTasks = result.tasks.filter(task => 
				this.hasImage(task) && !this.isExpired(task)
			);

			// Sort tasks to prioritize those close to expiring, then by creation date (newest first)
			const sortedTasks = validTasks.sort((a, b) => {
				// First priority: tasks close to expiring
				const aCloseToExpiring = this.isCloseToExpiring(a);
				const bCloseToExpiring = this.isCloseToExpiring(b);
				
				if (aCloseToExpiring && !bCloseToExpiring) return -1;
				if (!aCloseToExpiring && bCloseToExpiring) return 1;
				
				// Second priority: newest tasks first
				return b.createdAt - a.createdAt;
			});

			// Convert to LiveTask format and limit results
			const featuredTasks = sortedTasks
				.slice(0, limit)
				.map(task => this.convertToLiveTask(task));

			// Update cache
			this.cache = {
				data: featuredTasks,
				timestamp: Date.now()
			};

			return featuredTasks;
		} catch (error) {
			console.error('Error fetching featured tasks:', error);
			// Return empty array on error
			return [];
		}
	}

	/**
	 * Check if a task has at least one image attachment
	 */
	private static hasImage(task: Task): boolean {
		if (!task.attachments || task.attachments.length === 0) {
			return false;
		}

		return task.attachments.some(attachment => {
			const url = attachment.url.toLowerCase();
			const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
			return imageExtensions.some(ext => url.includes(ext));
		});
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
		if (!task.attachments || task.attachments.length === 0) {
			return '';
		}

		const imageAttachment = task.attachments.find(attachment => {
			const url = attachment.url.toLowerCase();
			const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
			return imageExtensions.some(ext => url.includes(ext));
		});

		return imageAttachment?.url || '';
	}

	/**
	 * Convert Task to LiveTask format for homepage display
	 */
	private static convertToLiveTask(task: Task): LiveTask {
		// Calculate time left based on deadline
		const timeLeft = this.calculateTimeLeft(task.deadline);
		
		// Get budget amount (convert from sats to USD if needed)
		const budgetAmount = this.getBudgetAmount(task.budget);

		return {
			id: task.id,
			title: task.title,
			budget: budgetAmount,
			proposals: 0, // Not publicly accessible
			timeLeft,
			image: this.getFirstImage(task)
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
		this.cache = null;
	}
}
