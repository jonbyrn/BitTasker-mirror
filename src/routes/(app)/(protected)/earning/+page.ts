import { redirect } from '@sveltejs/kit';
import { parseEarningQuery } from '$lib/utils/dashboardQuery';

export const prerender = false;

/**
 * Redirect handler for backward compatibility.
 * New URL: /earning/bids?service=X&request=Y&type=tasks&highlight=Z&status=S
 */
export function load({ url }: { url: URL }) {
	const parsed = parseEarningQuery(url);

	const targetUrl = new URL(`/earning/${parsed.tab}`, url.origin);

	// Carry over relevant query params
	if (parsed.service) {
		targetUrl.searchParams.set('service', parsed.service);
	}
	if (parsed.request) {
		targetUrl.searchParams.set('request', parsed.request);
	}
	if (parsed.type) {
		targetUrl.searchParams.set('type', parsed.type);
	}
	if (parsed.highlight) {
		targetUrl.searchParams.set('highlight', parsed.highlight);
	}
	if (parsed.status) {
		targetUrl.searchParams.set('status', parsed.status);
	}
	if (parsed.bidStatus) {
		targetUrl.searchParams.set('bidStatus', parsed.bidStatus);
	}

	throw redirect(307, `${targetUrl.pathname}${targetUrl.search}`);
}
