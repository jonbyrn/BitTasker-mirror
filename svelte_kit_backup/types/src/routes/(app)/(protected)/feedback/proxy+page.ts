// @ts-nocheck
import type { PageLoad } from './$types';

export const load = async ({ parent }: Parameters<PageLoad>[0]) => {
	// Get the parent data (user authentication, etc.)
	const parentData = await parent();

	return {
		...parentData
		// Add any feedback-specific data here if needed
	};
};
