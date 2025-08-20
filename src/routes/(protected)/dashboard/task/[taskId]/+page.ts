import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const { taskId } = params;
	
	if (!taskId) {
		error(400, 'Task ID is required');
	}

	return {
		taskId
	};
};
