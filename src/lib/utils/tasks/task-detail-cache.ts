import type { Task } from '$lib/types/task';
import { browser } from '$app/environment';
import { preloadData } from '$app/navigation';
import { taskDetailsPath } from '$lib/utils/tasks/task-path';

const remembered = new Map<string, Task>();

export function rememberTask(task: (Pick<Task, 'id'> & Partial<Task>) | null | undefined): void {
	if (!task?.id) return;
	remembered.set(task.id, task as Task);
}

export function recallTask(id: string | null | undefined): Task | null {
	if (!id) return null;
	return remembered.get(id) ?? remembered.get(decodeURIComponent(id)) ?? null;
}

/** Keep the list card's task and start loading its page before the click. */
export function prefetchTask(task: (Pick<Task, 'id'> & Partial<Task>) | null | undefined): void {
	if (!task?.id) return;
	rememberTask(task);
	if (!browser) return;
	void preloadData(taskDetailsPath(task.id)).catch(() => undefined);
}
