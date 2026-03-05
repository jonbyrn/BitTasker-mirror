import type { Task } from '$lib/types/task';

/**
 * Get the identifier for a task (event id).
 * Tasks are identified by event id; #d tag uses readable format (task title + timestamp) per Nostr conventions.
 */
export function getTaskId(task: Task): string {
	return task.id;
}
