/** A deadline lasts through its calendar day. The next day is expired. */
export function isTaskDeadlineExpired(deadline?: string | null, now: Date = new Date()): boolean {
	if (!deadline) return false;
	const deadlineDate = new Date(deadline);
	if (Number.isNaN(deadlineDate.getTime())) return false;
	const deadlineDay = deadlineDate.toISOString().split('T')[0];
	const today = now.toISOString().split('T')[0];
	return today > deadlineDay;
}
