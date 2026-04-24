import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import {
	buildEarningQueryUrl,
	buildServicesWorkspaceQueryUrl,
	isValidQuoteRequestId,
	isValidServiceAddress,
	parseDashboardQuery,
	parseServicesWorkspaceQuery,
	type ServicesWorkspaceTab
} from '$lib/utils/dashboardQuery';

export type { ServicesWorkspaceTab };

export type ServicesWorkspaceMessageCode = 'service_requests_request_not_found';

export interface ServicesWorkspaceRouteState {
	tab: ServicesWorkspaceTab;
	serviceAddress: string | null;
	requestId: string | null;
}

export interface ServicesWorkspaceRouteParseResult {
	state: ServicesWorkspaceRouteState;
	searchParams: URLSearchParams;
	changed: boolean;
	messageCode: ServicesWorkspaceMessageCode | null;
}

export interface ServicesWorkspaceRouteContext {
	providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
	providerLoadedByService: Record<string, boolean>;
	providerLoadErrorByService: Record<string, string | null>;
	focusSync: {
		requestId: string | null;
		serviceAddress: string | null;
		expiresAt: number | null;
	};
}

export const emptyServicesWorkspaceRouteContext: ServicesWorkspaceRouteContext = {
	providerTimelinesByService: {},
	providerLoadedByService: {},
	providerLoadErrorByService: {},
	focusSync: {
		requestId: null,
		serviceAddress: null,
		expiresAt: null
	}
};

function hasMatchingTimeline(
	timelines: ServiceQuoteTimelineEntry[],
	requestId: string | null
): boolean {
	if (!requestId) {
		return false;
	}

	return timelines.some((timeline) => timeline.request.content.quoteRequestId === requestId);
}

function getContextServiceAddresses(context: ServicesWorkspaceRouteContext): string[] {
	return [
		...new Set([
			...Object.keys(context.providerTimelinesByService),
			...Object.keys(context.providerLoadedByService),
			...Object.keys(context.providerLoadErrorByService)
		])
	];
}

function isRequestSyncActive(
	context: Pick<ServicesWorkspaceRouteContext, 'focusSync'>,
	requestId: string | null | undefined,
	serviceAddress: string | null | undefined,
	now = Date.now()
): boolean {
	const { focusSync } = context;
	if (
		!requestId ||
		!focusSync.requestId ||
		focusSync.requestId !== requestId ||
		!focusSync.expiresAt ||
		focusSync.expiresAt <= now
	) {
		return false;
	}

	if (serviceAddress && focusSync.serviceAddress && focusSync.serviceAddress !== serviceAddress) {
		return false;
	}

	return true;
}

export function parseServicesWorkspaceRouteQuery(
	searchParams: URLSearchParams,
	context: ServicesWorkspaceRouteContext,
	now = Date.now()
): ServicesWorkspaceRouteParseResult {
	const url = new URL('https://bittasker.local/services/manage');
	url.search = searchParams.toString();

	const parsed = parseServicesWorkspaceQuery(url);
	const normalized: ServicesWorkspaceRouteState = {
		tab: parsed.tab,
		serviceAddress: null,
		requestId: null
	};
	let messageCode: ServicesWorkspaceMessageCode | null = null;

	if (
		parsed.tab === 'service-requests' &&
		parsed.service &&
		isValidServiceAddress(parsed.service)
	) {
		normalized.serviceAddress = parsed.service;
	}

	if (normalized.tab === 'service-requests' && parsed.request) {
		if (isValidQuoteRequestId(parsed.request)) {
			normalized.requestId = parsed.request;
		} else {
			messageCode = 'service_requests_request_not_found';
		}
	}

	if (normalized.tab === 'service-requests' && normalized.requestId) {
		const serviceAddresses = normalized.serviceAddress
			? [normalized.serviceAddress]
			: getContextServiceAddresses(context);
		const providerTimelines = serviceAddresses.flatMap(
			(serviceAddress) => context.providerTimelinesByService[serviceAddress] ?? []
		);
		const providerLoaded =
			serviceAddresses.length > 0 &&
			serviceAddresses.every(
				(serviceAddress) => context.providerLoadedByService[serviceAddress] === true
			);
		const providerLoadError = serviceAddresses.some(
			(serviceAddress) => context.providerLoadErrorByService[serviceAddress] != null
		);
		const keepFocusedRequest =
			!providerLoaded ||
			providerLoadError ||
			isRequestSyncActive(context, normalized.requestId, normalized.serviceAddress, now) ||
			hasMatchingTimeline(providerTimelines, normalized.requestId);

		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'service_requests_request_not_found';
		}
	}

	const canonicalUrl = buildServicesWorkspaceQueryUrl(
		new URL('https://bittasker.local/services/manage'),
		{
			tab: normalized.tab,
			service:
				normalized.tab === 'service-requests'
					? (normalized.serviceAddress ?? undefined)
					: undefined,
			request: normalized.requestId ?? undefined
		}
	);
	const canonicalSearchParams = new URL(canonicalUrl).searchParams;

	return {
		state: normalized,
		searchParams: canonicalSearchParams,
		changed: canonicalSearchParams.toString() !== searchParams.toString(),
		messageCode
	};
}

export function createServicesWorkspaceRedirectUrl(baseUrl: URL): URL {
	const parsed = parseServicesWorkspaceRouteQuery(
		baseUrl.searchParams,
		emptyServicesWorkspaceRouteContext
	).state;
	const targetTab = parsed.tab === 'service-requests' ? 'requests' : 'my-services';
	const nextUrl = buildEarningQueryUrl(new URL('/dashboard/earning', baseUrl), {
		tab: targetTab,
		service: parsed.tab === 'service-requests' ? (parsed.serviceAddress ?? undefined) : undefined,
		request: parsed.tab === 'service-requests' ? (parsed.requestId ?? undefined) : undefined
	});

	return new URL(nextUrl);
}

export function createServicesWorkspaceUrl(
	baseUrl: URL,
	updates: Partial<ServicesWorkspaceRouteState>
): URL {
	const current = parseServicesWorkspaceRouteQuery(
		baseUrl.searchParams,
		emptyServicesWorkspaceRouteContext
	).state;
	const next: ServicesWorkspaceRouteState = {
		...current,
		...updates
	};
	const legacyWorkspaceUrl = new URL(
		buildServicesWorkspaceQueryUrl(new URL('/services/manage', baseUrl), {
			tab: next.tab,
			service: next.tab === 'service-requests' ? (next.serviceAddress ?? undefined) : undefined,
			request: next.tab === 'service-requests' ? (next.requestId ?? undefined) : undefined
		})
	);

	return createServicesWorkspaceRedirectUrl(legacyWorkspaceUrl);
}

export function createServicesWorkspaceRedirectUrlFromLegacyDashboard(baseUrl: URL): URL | null {
	const parsed = parseDashboardQuery(baseUrl);
	if (parsed.tab !== 'my-services' || !parsed.service) {
		return null;
	}

	const rawView = baseUrl.searchParams.get('view');
	const isQuotesView =
		parsed.view === 'service-requests' ||
		parsed.view === 'quotes' ||
		rawView === 'service-requests' ||
		rawView === 'quotes';

	if (!isQuotesView) {
		return null;
	}

	return createServicesWorkspaceUrl(new URL('/dashboard/earning', baseUrl), {
		tab: 'service-requests',
		serviceAddress: parsed.service,
		requestId: parsed.request ?? null
	});
}
