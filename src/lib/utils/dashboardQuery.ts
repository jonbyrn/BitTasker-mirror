export type DashboardTab =
	| 'tasks'
	| 'my-services'
	| 'bids'
	| 'contracts'
	| 'saved-searches'
	| 'quotes';

export type DashboardView = 'default' | 'quotes' | 'tasker';
export type DashboardContractsContext = 'all' | 'tasks' | 'services';
export type ServicesWorkspaceTab = 'listings' | 'quotes';

export interface DashboardQueryState {
	tab: DashboardTab;
	view?: DashboardView;
	context?: DashboardContractsContext;
	service?: string | null;
	request?: string | null;
	highlight?: string | null;
}

export interface ServicesWorkspaceQueryState {
	tab: ServicesWorkspaceTab;
	service?: string | null;
	request?: string | null;
}

const VALID_TABS = new Set<DashboardTab>([
	'tasks',
	'my-services',
	'bids',
	'contracts',
	'saved-searches',
	'quotes'
]);
const SERVICE_ADDRESS_PATTERN = /^(30402|30403):[0-9a-f]{64}:[^:]+$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const VALID_SERVICES_WORKSPACE_TABS = new Set<ServicesWorkspaceTab>(['listings', 'quotes']);

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

export function isValidServiceAddress(value: string | null | undefined): value is string {
	return Boolean(value && SERVICE_ADDRESS_PATTERN.test(value));
}

export function isValidQuoteRequestId(value: string | null | undefined): value is string {
	return Boolean(value && REQUEST_ID_PATTERN.test(value));
}

export function parseDashboardQuery(url: URL): DashboardQueryState {
	const rawTab = url.searchParams.get('tab');
	const tab = VALID_TABS.has(rawTab as DashboardTab) ? (rawTab as DashboardTab) : 'tasks';
	const state: DashboardQueryState = { tab };

	if (tab === 'contracts') {
		const context = url.searchParams.get('context');
		state.context = context === 'tasks' || context === 'services' ? context : 'all';
		const highlight = url.searchParams.get('highlight');
		state.highlight = highlight || null;
		return state;
	}

	if (tab === 'quotes') {
		state.view = 'tasker';
		const request = url.searchParams.get('request');
		state.request = request || null;
		return state;
	}

	if (tab === 'my-services') {
		const view = url.searchParams.get('view');
		state.view = view === 'quotes' ? 'quotes' : 'default';
		if (state.view === 'quotes') {
			state.service = decodeSearchParam(url.searchParams.get('service'));
			const request = url.searchParams.get('request');
			state.request = request || null;
		}
	}

	return state;
}

export function parseServicesWorkspaceQuery(url: URL): ServicesWorkspaceQueryState {
	const rawTab = url.searchParams.get('tab');
	const tab = VALID_SERVICES_WORKSPACE_TABS.has(rawTab as ServicesWorkspaceTab)
		? (rawTab as ServicesWorkspaceTab)
		: 'listings';
	const state: ServicesWorkspaceQueryState = { tab };

	if (tab === 'quotes') {
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
		url.searchParams.set('context', state.context ?? 'all');
		if (state.highlight) {
			url.searchParams.set('highlight', state.highlight);
		}
		return url.toString();
	}

	if (state.tab === 'quotes') {
		url.searchParams.set('view', 'tasker');
		if (state.request) {
			url.searchParams.set('request', state.request);
		}
		return url.toString();
	}

	if (state.tab === 'my-services' && state.view === 'quotes') {
		url.searchParams.set('view', 'quotes');
		if (state.service) {
			url.searchParams.set('service', encodeURIComponent(state.service));
		}
		if (state.request) {
			url.searchParams.set('request', state.request);
		}
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

	if (state.tab === 'quotes') {
		if (state.service) {
			url.searchParams.set('service', state.service);
		}
		if (state.request) {
			url.searchParams.set('request', state.request);
		}
	}

	return url.toString();
}
