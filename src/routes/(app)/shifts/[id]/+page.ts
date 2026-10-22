import { resolveRoute } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { isTaskStaffId } from '$lib/browse/staff-card';

/** A task posted into temporary staff is not a shift. Send it to the task page. */
export function load({ params }: { params: { id: string } }) {
	if (isTaskStaffId(params.id)) {
		redirect(307, resolveRoute('/(app)/tasks/[taskId]', { taskId: params.id }));
	}
	return {};
}
