import { redirect } from '@sveltejs/kit';
import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';

export function load() {
	throw redirect(
		302,
		buildEarningQueryUrl(new URL('https://bittasker.local/earning'), {
			tab: 'my-services'
		})
	);
}
