import { redirectBrowseServices } from '$lib/search/browse-routes';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	redirectBrowseServices();
};
