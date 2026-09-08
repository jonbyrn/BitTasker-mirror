import { redirect } from '@sveltejs/kit';
import { parseEarningQuery } from '$lib/utils/dashboardQuery';

export const prerender = false;

const HIRING_TAB_MAP: Record<string, string> = {
	tasks: '/hiring/my-tasks',
	contracts: '/hiring/contracts',
	'service-requests': '/hiring/service-requests'
};

	const EARNING_TABS = new Set(['bids', 'my-services', 'requests', 'saved-searches']);

export function load({ url }: { url: URL }) {
	const rawTab = url.searchParams.get('tab');

	if (!rawTab || (!HIRING_TAB_MAP[rawTab] && !EARNING_TABS.has(rawTab))) {
		throw redirect(301, '/hiring/my-tasks');
	}

	if (EARNING_TABS.has(rawTab)) {
		const parsed = parseEarningQuery(url);
		const targetTab = rawTab === 'saved-searches' ? 'alerts' : parsed.tab;
		const targetUrl = new URL(`/earning/${targetTab}`, url.origin);

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

		throw redirect(301, targetUrl.toString());
	}

	const targetPath = HIRING_TAB_MAP[rawTab] ?? '/hiring/my-tasks';
	const targetUrl = new URL(targetPath, url.origin);

	const type = url.searchParams.get('type');
	if (type) {
		targetUrl.searchParams.set('type', type);
	}

	const highlight = url.searchParams.get('highlight');
	if (highlight) {
		targetUrl.searchParams.set('highlight', highlight);
	}

	const status = url.searchParams.get('status');
	if (status) {
		targetUrl.searchParams.set('status', status);
	}

	const requestId = url.searchParams.get('requestId');
	if (requestId) {
		targetUrl.searchParams.set('requestId', requestId);
	}

	const view = url.searchParams.get('view');
	if (view) {
		targetUrl.searchParams.set('view', view);
	}

	const messageCode = url.searchParams.get('messageCode');
	if (messageCode) {
		targetUrl.searchParams.set('messageCode', messageCode);
	}

	throw redirect(301, targetUrl.toString());
}
