import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { VALID_EARNING_TABS } from '$lib/utils/dashboardQuery';

export const load: PageServerLoad = async ({ url }) => {
	const tab = url.searchParams.get('tab') || 'bids';
	const validTabs = Array.from(VALID_EARNING_TABS);
	const targetTab = validTabs.includes(tab) ? tab : 'bids';

	// Build clean query string excluding 'tab' (now part of path)
	const params = new URLSearchParams();
	for (const [key, value] of url.searchParams.entries()) {
		if (key !== 'tab') {
			params.set(key, value);
		}
	}
	const queryString = params.toString() ? `?${params.toString()}` : '';

	throw redirect(301, `/earning/${targetTab}${queryString}`);
};
