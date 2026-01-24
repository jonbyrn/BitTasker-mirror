import type { Task } from '$lib/types/task';

/**
 * Get the stable identifier for a task (uniqueId if available, fallback to id)
 * This ensures we use the stable uniqueId when available, but maintain backward compatibility
 */
export function getTaskId(task: Task): string {
	// Type guard: check if task has uniqueId property
	if ('uniqueId' in task && typeof (task as any).uniqueId === 'string' && (task as any).uniqueId) {
		return (task as any).uniqueId;
	}
	return task.id;
}
