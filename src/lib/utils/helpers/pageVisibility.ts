/**
 * Page Visibility Manager
 * 
 * Provides a centralized way to manage polling and background tasks
 * based on page visibility state using the Page Visibility API.
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface PollingConfig {
	interval: number;
	callback: () => void | Promise<void>;
	runImmediately?: boolean;
}

class PageVisibilityManager {
	private isVisible: Writable<boolean> = writable(true);
	private pollingTasks: Map<string, {
		config: PollingConfig;
		timeoutId: NodeJS.Timeout | null;
		isPaused: boolean;
	}> = new Map();
	private visibilityListenerAdded = false;

	constructor() {
		if (browser) {
			// Initialize with current visibility state
			this.isVisible.set(!document.hidden);
			this.setupVisibilityListener();
		}
	}

	/**
	 * Set up the page visibility change listener
	 */
	private setupVisibilityListener(): void {
		if (this.visibilityListenerAdded) return;

		const handleVisibilityChange = () => {
			const isCurrentlyVisible = !document.hidden;
			this.isVisible.set(isCurrentlyVisible);

			if (isCurrentlyVisible) {
				console.log('[PageVisibility] Page became visible - resuming polling tasks');
				this.resumeAllPolling();
			} else {
				console.log('[PageVisibility] Page became hidden - pausing polling tasks');
				this.pauseAllPolling();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);
		this.visibilityListenerAdded = true;
	}

	/**
	 * Register a polling task that respects page visibility
	 * @param taskId Unique identifier for the polling task
	 * @param config Polling configuration
	 */
	public registerPolling(taskId: string, config: PollingConfig): void {
		if (!browser) return;

		// Clear existing task if any
		this.unregisterPolling(taskId);

		// Create polling task entry
		this.pollingTasks.set(taskId, {
			config,
			timeoutId: null,
			isPaused: false
		});

		// Start polling immediately if page is visible
		if (!document.hidden) {
			if (config.runImmediately) {
				this.executeTask(taskId);
			} else {
				this.scheduleNextPoll(taskId);
			}
		}
	}

	/**
	 * Unregister a polling task
	 * @param taskId Task identifier to remove
	 */
	public unregisterPolling(taskId: string): void {
		const task = this.pollingTasks.get(taskId);
		if (task?.timeoutId) {
			clearTimeout(task.timeoutId);
		}
		this.pollingTasks.delete(taskId);
	}

	/**
	 * Execute a specific polling task
	 * @param taskId Task identifier
	 */
	private async executeTask(taskId: string): Promise<void> {
		const task = this.pollingTasks.get(taskId);
		if (!task || task.isPaused) return;

		try {
			await task.config.callback();
		} catch (error) {
			console.error(`[PageVisibility] Error executing task ${taskId}:`, error);
		}

		// Schedule next poll if task still exists and not paused
		if (this.pollingTasks.has(taskId) && !task.isPaused) {
			this.scheduleNextPoll(taskId);
		}
	}

	/**
	 * Schedule the next poll for a task
	 * @param taskId Task identifier
	 */
	private scheduleNextPoll(taskId: string): void {
		const task = this.pollingTasks.get(taskId);
		if (!task || task.isPaused) return;

		task.timeoutId = setTimeout(() => {
			this.executeTask(taskId);
		}, task.config.interval);
	}

	/**
	 * Pause all polling tasks
	 */
	private pauseAllPolling(): void {
		this.pollingTasks.forEach((task, taskId) => {
			if (task.timeoutId) {
				clearTimeout(task.timeoutId);
				task.timeoutId = null;
			}
			task.isPaused = true;
		});
	}

	/**
	 * Resume all polling tasks
	 */
	private resumeAllPolling(): void {
		this.pollingTasks.forEach((task, taskId) => {
			task.isPaused = false;
			// Execute immediately when resuming to get fresh data
			this.executeTask(taskId);
		});
	}

	/**
	 * Pause a specific polling task
	 * @param taskId Task identifier
	 */
	public pausePolling(taskId: string): void {
		const task = this.pollingTasks.get(taskId);
		if (!task) return;

		if (task.timeoutId) {
			clearTimeout(task.timeoutId);
			task.timeoutId = null;
		}
		task.isPaused = true;
	}

	/**
	 * Resume a specific polling task
	 * @param taskId Task identifier
	 */
	public resumePolling(taskId: string): void {
		const task = this.pollingTasks.get(taskId);
		if (!task) return;

		task.isPaused = false;
		if (!document.hidden) {
			this.executeTask(taskId);
		}
	}

	/**
	 * Check if page is currently visible
	 */
	public isPageVisible(): boolean {
		return browser ? !document.hidden : true;
	}

	/**
	 * Get the visibility store for reactive subscriptions
	 */
	public getVisibilityStore(): Writable<boolean> {
		return this.isVisible;
	}

	/**
	 * Clean up all polling tasks and listeners
	 */
	public cleanup(): void {
		// Clear all polling tasks
		this.pollingTasks.forEach((task) => {
			if (task.timeoutId) {
				clearTimeout(task.timeoutId);
			}
		});
		this.pollingTasks.clear();

		// Note: We don't remove the visibility listener as it's global
		// and should persist across component lifecycles
	}

	/**
	 * Get all registered polling task IDs
	 */
	public getRegisteredTasks(): string[] {
		return Array.from(this.pollingTasks.keys());
	}
}

// Export singleton instance
export const pageVisibilityManager = new PageVisibilityManager();

// Export store for reactive usage
export const isPageVisible = pageVisibilityManager.getVisibilityStore();


