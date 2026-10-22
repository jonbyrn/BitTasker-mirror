import { isTaskStaffId } from '$lib/browse/staff-card';
import { taskDetailsPath } from '$lib/utils/tasks/task-path';

export type BrowseKind = 'tasks' | 'services' | 'staff';

/** A shift id is not a task id. Posted tasks reused on the staff board still are. */
export function isShiftPin(kind: BrowseKind, id: string): boolean {
	return kind === 'staff' && !isTaskStaffId(id);
}

/** Public path a browse pin opens. Shift pins go to /shifts/<slug>. */
export function browsePinTarget(kind: BrowseKind, id: string): string {
	if (isShiftPin(kind, id)) return `/shifts/${encodeURIComponent(id)}`;
	return taskDetailsPath(id);
}

/**
 * A pin with onOpenTask uses that callback. Task and service maps keep the
 * task page. Staff passes onOpenTask so a shift does not fall through to /tasks/.
 */
export function activateListingPin<T extends { id: string }>(
	item: T,
	onOpenTask: ((item: T) => void) | undefined,
	openTaskPage: (id: string) => void
): void {
	if (onOpenTask) {
		onOpenTask(item);
		return;
	}
	openTaskPage(item.id);
}
