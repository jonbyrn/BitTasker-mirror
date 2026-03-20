import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import {
	buildServicesWorkspaceQueryUrl,
	isValidQuoteRequestId,
	isValidServiceAddress,
	parseDashboardQuery,
	parseServicesWorkspaceQuery,
	type ServicesWorkspaceTab
} from '$lib/utils/dashboardQuery';

export type { ServicesWorkspaceTab };

export type ServicesWorkspaceMessageCode = 'service_quotes_request_not_found';

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

	if (parsed.tab === 'quotes' && parsed.service && isValidServiceAddress(parsed.service)) {
		normalized.serviceAddress = parsed.service;
	} else if (parsed.tab === 'quotes') {
		normalized.tab = 'listings';
	}

	if (normalized.tab === 'quotes' && parsed.request) {
		if (isValidQuoteRequestId(parsed.request)) {
			normalized.requestId = parsed.request;
		} else {
			messageCode = 'service_quotes_request_not_found';
		}
	}

	if (normalized.tab === 'quotes' && normalized.serviceAddress && normalized.requestId) {
		const providerTimelines = context.providerTimelinesByService[normalized.serviceAddress] ?? [];
		const providerLoaded = context.providerLoadedByService[normalized.serviceAddress] === true;
		const providerLoadError =
			context.providerLoadErrorByService[normalized.serviceAddress] ?? null;
		const keepFocusedRequest =
			!providerLoaded ||
			providerLoadError !== null ||
			isRequestSyncActive(context, normalized.requestId, normalized.serviceAddress, now) ||
			hasMatchingTimeline(providerTimelines, normalized.requestId);

		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'service_quotes_request_not_found';
		}
	}

	const canonicalUrl = buildServicesWorkspaceQueryUrl(
		new URL('https://bittasker.local/services/manage'),
		{
			tab: normalized.tab,
			service: normalized.tab === 'quotes' ? (normalized.serviceAddress ?? undefined) : undefined,
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

	const nextUrl = buildServicesWorkspaceQueryUrl(baseUrl, {
		tab: next.tab,
		service: next.tab === 'quotes' ? (next.serviceAddress ?? undefined) : undefined,
		request: next.requestId ?? undefined
	});

	return new URL(nextUrl);
}

export function createServicesWorkspaceRedirectUrlFromLegacyDashboard(baseUrl: URL): URL | null {
	const parsed = parseDashboardQuery(baseUrl);
	if (parsed.tab !== 'my-services' || parsed.view !== 'quotes' || !parsed.service) {
		return null;
	}

	return createServicesWorkspaceUrl(new URL('/services/manage', baseUrl), {
		tab: 'quotes',
		serviceAddress: parsed.service,
		requestId: parsed.request ?? null
	});
}
