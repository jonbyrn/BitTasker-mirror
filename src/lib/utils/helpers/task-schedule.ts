export type ScheduleTask = {
	flexibleSchedule?: boolean;
	deadline?: string | null;
	dateRange?: { start?: string | null; end?: string | null } | null;
};

/** "I'm flexible" is a flag. A leftover date range must not survive it. */
export function clearFlexibleDates<T extends ScheduleTask>(task: T): T {
	if (task.flexibleSchedule !== true) return task;
	return { ...task, deadline: undefined, dateRange: undefined };
}

export function reviewTimeline(task: ScheduleTask): 'flexible' | 'range' | 'deadline' | 'none' {
	const next = clearFlexibleDates(task);
	if (next.flexibleSchedule === true) return 'flexible';
	if (next.dateRange?.start && next.dateRange?.end) return 'range';
	if (next.deadline) return 'deadline';
	return 'none';
}
