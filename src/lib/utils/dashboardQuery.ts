export type DashboardTab =
	| 'tasks'
	| 'my-services'
	| 'bids'
	| 'contracts'
	| 'alerts'
	| 'service-requests'
	| 'requests';

export type EarningTab = 'bids' | 'requests' | 'contracts' | 'my-services' | 'alerts';

export type DashboardView = 'default' | 'service-requests' | 'tasker';
export type DashboardContractsType = 'all' | 'tasks' | 'services';
export type ServicesWorkspaceTab = 'listings' | 'service-requests';

export interface DashboardQueryState {
	tab: DashboardTab;
	view?: DashboardView;
	type?: DashboardContractsType;
	service?: string | null;
	request?: string | null;
	highlight?: string | null;
	status?: string | null;
}

export interface ServicesWorkspaceQueryState {
	tab: ServicesWorkspaceTab;
	service?: string | null;
	request?: string | null;
}

export interface EarningQueryState {
	tab: EarningTab;
	type?: DashboardContractsType;
	service?: string | null;
	request?: string | null;
	highlight?: string | null;
	status?: string | null;
	bidStatus?: string | null;
}

const VALID_TABS = new Set<DashboardTab>([
	'tasks',
	'my-services',
	'bids',
	'contracts',
	'alerts',
	'service-requests',
	'requests'
]);
const VALID_EARNING_TABS = new Set<EarningTab>([
	'bids',
	'requests',
	'contracts',
	'my-services',
	'alerts'
]);
const SERVICE_ADDRESS_PATTERN = /^(30402|30403):[0-9a-f]{64}:[^:]+$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const VALID_SERVICES_WORKSPACE_TABS = new Set<ServicesWorkspaceTab>([
	'listings',
	'service-requests'
]);

function decodeSearchParam(value: string | null): string | null {
	if (!value) {
		return null;
	}
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function isValidServiceAddress(value: string | null): boolean {
	return Boolean(value && SERVICE_ADDRESS_PATTERN.test(value));
}

export function isValidQuoteRequestId(value: string | null): boolean {
	return Boolean(value && REQUEST_ID_PATTERN.test(value));
}

export function parseDashboardQuery(url: URL): DashboardQueryState {
	const rawTab = url.searchParams.get('tab');
	const tab =
		rawTab === 'quotes'
			? 'service-requests'
			: VALID_TABS.has(rawTab as DashboardTab)
				? (rawTab as DashboardTab)
				: 'tasks';
	const state: DashboardQueryState = { tab };

	if (tab === 'contracts') {
		const type = url.searchParams.get('type');
		state.type = type === 'tasks' || type === 'services' ? type : 'all';
		const highlight = url.searchParams.get('highlight');
		state.highlight = highlight || null;
		const status = url.searchParams.get('status');
		state.status = status || 'all';
		return state;
	}

	if (tab === 'service-requests') {
		state.view = 'tasker';
		const request = url.searchParams.get('request');
		state.request = request || null;
		state.status = url.searchParams.get('status') || null;
		return state;
	}

	if (tab === 'my-services') {
		const view = url.searchParams.get('view');
		state.view = view === 'service-requests' ? 'service-requests' : 'default';
		if (state.view === 'service-requests') {
			state.service = decodeSearchParam(url.searchParams.get('service'));
			const request = url.searchParams.get('request');
			state.request = request || null;
		}
		state.status = url.searchParams.get('status') || null;
		return state;
	}

	state.status = url.searchParams.get('status') || null;
	return state;
}

export function parseEarningQuery(url: URL): EarningQueryState {
	// Extract tab from path first (new path-based routing: /earning/bids)
	// Fall back to query param for backward compatibility
	const pathSegments = url.pathname.split('/').filter(Boolean);
	let tab: EarningTab = 'bids';

	// Check if we're on an earning sub-route
	if (pathSegments[0] === 'earning' && pathSegments[1]) {
		const pathTab = pathSegments[1] as EarningTab;
		if (VALID_EARNING_TABS.has(pathTab)) {
			tab = pathTab;
		}
	} else {
		// Fallback to query param for legacy URLs
		const rawTab = url.searchParams.get('tab');
		if (VALID_EARNING_TABS.has(rawTab as EarningTab)) {
			tab = rawTab as EarningTab;
		}

		if (rawTab === 'my-services' && url.searchParams.get('view') === 'service-requests') {
			tab = 'requests';
		} else if (rawTab === 'service-requests') {
			tab = 'requests';
		}
	}

	const _rawView = url.searchParams.get('view');
	const decodedService = decodeSearchParam(url.searchParams.get('service'));
	const rawRequest = url.searchParams.get('request');

	const state: EarningQueryState = {
		tab,
		service: decodedService,
		request: rawRequest,
		highlight: url.searchParams.get('highlight'),
		status: url.searchParams.get('status'),
		bidStatus: url.searchParams.get('bidStatus')
	};

	// Validate service and request for requests tab
	if (tab === 'requests') {
		if (decodedService !== null && !isValidServiceAddress(decodedService)) {
			state.service = null;
		}
		if (rawRequest !== null && !isValidQuoteRequestId(rawRequest)) {
			state.request = null;
		}
	}

	if (tab === 'contracts') {
		const type = url.searchParams.get('type');
		state.type = type === 'tasks' || type === 'services' ? type : 'all';
	}

	return state;
}

export function parseServicesWorkspaceQuery(url: URL): ServicesWorkspaceQueryState {
	const rawTab = url.searchParams.get('tab');
	const tab = VALID_SERVICES_WORKSPACE_TABS.has(rawTab as ServicesWorkspaceTab)
		? (rawTab as ServicesWorkspaceTab)
		: 'listings';
	const state: ServicesWorkspaceQueryState = { tab };

	if (tab === 'service-requests') {
		state.service = decodeSearchParam(url.searchParams.get('service'));
		const request = url.searchParams.get('request');
		state.request = request || null;
	}

	return state;
}

export function buildDashboardQueryUrl(baseUrl: URL, state: DashboardQueryState): string {
	const url = new URL(baseUrl.toString());
	url.search = '';
	url.searchParams.set('tab', state.tab);

	if (state.tab === 'contracts') {
		url.searchParams.set('type', state.type ?? 'all');
		if (state.highlight) {
			url.searchParams.set('highlight', state.highlight);
		}
		if (state.status && state.status !== 'all') {
			url.searchParams.set('status', state.status);
		}
		return url.toString();
	}

	if (state.tab === 'service-requests') {
		url.searchParams.set('view', 'tasker');
		if (state.request) {
			url.searchParams.set('request', state.request);
		}
		if (state.status) {
			url.searchParams.set('status', state.status);
		}
		return url.toString();
	}

	if (state.tab === 'my-services') {
		if (state.view === 'service-requests') {
			url.searchParams.set('view', 'service-requests');
			if (state.service) {
				url.searchParams.set('service', state.service);
			}
			if (state.request) {
				url.searchParams.set('request', state.request);
			}
		}
		if (state.status) {
			url.searchParams.set('status', state.status);
		}
		return url.toString();
	}

	if (state.status) {
		url.searchParams.set('status', state.status);
	}

	return url.toString();
}

export function buildEarningQueryUrl(baseUrl: URL, state: EarningQueryState): string {
	// Build path-based URL: /earning/{tab} instead of /earning?tab={tab}
	const url = new URL(`/earning/${state.tab}`, baseUrl.origin);

	if (state.tab === 'contracts' && state.type) {
		url.searchParams.set('type', state.type);
		if (state.highlight) {
			url.searchParams.set('highlight', state.highlight);
		}
	}

	if (state.service) {
		url.searchParams.set('service', state.service);
	}
	if (state.request) {
		url.searchParams.set('request', state.request);
	}
	if (state.status) {
		url.searchParams.set('status', state.status);
	}
	if (state.bidStatus) {
		url.searchParams.set('bidStatus', state.bidStatus);
	}

	return url.toString();
}

export function buildServicesWorkspaceQueryUrl(
	baseUrl: URL,
	state: ServicesWorkspaceQueryState
): string {
	const url = new URL(baseUrl.toString());
	url.search = '';
	url.searchParams.set('tab', state.tab);

	if (state.tab === 'service-requests') {
		if (state.service) {
			url.searchParams.set('service', state.service);
		}
		if (state.request) {
			url.searchParams.set('request', state.request);
		}
	}

	return url.toString();
}
