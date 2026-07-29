import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import {
	buildDashboardQuerySearchParams,
	buildDashboardQueryUrl,
	isValidQuoteRequestId,
	isValidServiceAddress,
	parseDashboardQuery,
	type DashboardContractsType,
	type DashboardTab,
	type DashboardView
} from '$lib/utils/dashboardQuery';

const ESCROW_HIGHLIGHT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export type { DashboardContractsType, DashboardTab, DashboardView };

export type DashboardMessageCode =
	| 'service_requests_request_not_found'
	| 'service_quotes_request_not_found'
	| 'contracts_highlight_not_found';

export interface DashboardRouteState {
	tab: DashboardTab;
	view: DashboardView;
	type: DashboardContractsType;
	serviceAddress: string | null;
	requestId: string | null;
	highlight: string | null;
	status: string | null;
}

export interface DashboardRouteParseResult {
	state: DashboardRouteState;
	searchParams: URLSearchParams;
	changed: boolean;
	messageCode: DashboardMessageCode | null;
}

export interface DashboardRouteContext {
	taskerTimelines: ServiceQuoteTimelineEntry[];
	providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
	taskerLoaded: boolean;
	providerLoadedByService: Record<string, boolean>;
	focusSync: {
		requestId: string | null;
		serviceAddress: string | null;
		expiresAt: number | null;
	};
}

export function isDashboardRequestSyncActive(
	context: Pick<DashboardRouteContext, 'focusSync'>,
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

function hasMatchingTimeline(
	timelines: ServiceQuoteTimelineEntry[],
	requestId: string | null
): boolean {
	if (!requestId) {
		return false;
	}

	return timelines.some((timeline) => timeline.request.content.quoteRequestId === requestId);
}

export function getDashboardProviderTimelines(
	state: Pick<DashboardRouteContext, 'providerTimelinesByService'>,
	serviceAddress: string
): ServiceQuoteTimelineEntry[] {
	return state.providerTimelinesByService[serviceAddress] ?? [];
}

/**
 * Canonicalizes dashboard quote/contract query params against the locked route contract.
 */
export function parseServiceQuoteDashboardQuery(
	searchParams: URLSearchParams,
	context: DashboardRouteContext,
	now = Date.now()
): DashboardRouteParseResult {
	const parsed = parseDashboardQuery(searchParams);
	const normalized: DashboardRouteState = {
		tab: parsed.tab,
		view:
			parsed.tab === 'service-requests'
				? 'tasker'
				: parsed.tab === 'my-services'
					? parsed.view === 'service-requests'
						? 'service-requests'
						: 'default'
					: 'default',
		type: parsed.tab === 'contracts' ? (parsed.type ?? 'all') : 'all',
		serviceAddress: null,
		requestId: null,
		highlight: null,
		status: null
	};
	let messageCode: DashboardMessageCode | null = null;

	if (
		parsed.tab === 'my-services' &&
		normalized.view === 'service-requests' &&
		parsed.service &&
		isValidServiceAddress(parsed.service)
	) {
		normalized.serviceAddress = parsed.service;
	}

	const requestAllowed =
		(parsed.tab === 'service-requests' && normalized.view === 'tasker') ||
		(parsed.tab === 'my-services' &&
			normalized.view === 'service-requests' &&
			Boolean(normalized.serviceAddress));

	if (requestAllowed && parsed.request) {
		if (isValidQuoteRequestId(parsed.request)) {
			normalized.requestId = parsed.request;
		} else {
			messageCode =
				parsed.tab === 'service-requests'
					? 'service_requests_request_not_found'
					: 'service_quotes_request_not_found';
		}
	}

	if (
		normalized.tab === 'service-requests' &&
		normalized.requestId &&
		!hasMatchingTimeline(context.taskerTimelines, normalized.requestId)
	) {
		const keepFocusedRequest =
			!context.taskerLoaded ||
			isDashboardRequestSyncActive(context, normalized.requestId, null, now);
		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'service_requests_request_not_found';
		}
	}

	if (
		normalized.tab === 'my-services' &&
		normalized.view === 'service-requests' &&
		normalized.serviceAddress &&
		normalized.requestId &&
		!hasMatchingTimeline(
			context.providerTimelinesByService[normalized.serviceAddress] ?? [],
			normalized.requestId
		)
	) {
		const keepFocusedRequest =
			context.providerLoadedByService[normalized.serviceAddress] !== true ||
			isDashboardRequestSyncActive(context, normalized.requestId, normalized.serviceAddress, now);
		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'service_quotes_request_not_found';
		}
	}

	if (normalized.tab === 'contracts' && parsed.highlight) {
		if (ESCROW_HIGHLIGHT_RE.test(parsed.highlight)) {
			normalized.highlight = parsed.highlight;
		} else {
			messageCode = 'contracts_highlight_not_found';
		}
	}

	const canonicalSearchParams = buildDashboardQuerySearchParams({
		tab: normalized.tab,
		view:
			normalized.tab === 'service-requests'
				? 'tasker'
				: normalized.tab === 'my-services'
					? normalized.view
					: undefined,
		type: normalized.tab === 'contracts' ? normalized.type : undefined,
		service:
			normalized.tab === 'my-services' && normalized.view === 'service-requests'
				? (normalized.serviceAddress ?? undefined)
				: undefined,
		request: normalized.requestId ?? undefined,
		highlight: normalized.tab === 'contracts' ? (normalized.highlight ?? undefined) : undefined
	});

	return {
		state: normalized,
		searchParams: canonicalSearchParams,
		changed: canonicalSearchParams.toString() !== searchParams.toString(),
		messageCode
	};
}

export const emptyDashboardRouteContext: DashboardRouteContext = {
	taskerTimelines: [],
	providerTimelinesByService: {},
	taskerLoaded: false,
	providerLoadedByService: {},
	focusSync: {
		requestId: null,
		serviceAddress: null,
		expiresAt: null
	}
};

export function createDashboardUrl(baseUrl: URL, updates: Partial<DashboardRouteState>): URL {
	const current = parseServiceQuoteDashboardQuery(baseUrl.searchParams, {
		taskerTimelines: [],
		providerTimelinesByService: {},
		taskerLoaded: false,
		providerLoadedByService: {},
		focusSync: {
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		}
	}).state;
	const next: DashboardRouteState = {
		...current,
		...updates
	};
	const nextUrl = buildDashboardQueryUrl(baseUrl, {
		tab: next.tab,
		view:
			next.tab === 'service-requests'
				? 'tasker'
				: next.tab === 'my-services'
					? next.view
					: undefined,
		type: next.tab === 'contracts' ? next.type : undefined,
		service:
			next.tab === 'my-services' && next.view === 'service-requests'
				? (next.serviceAddress ?? undefined)
				: undefined,
		request: next.requestId ?? undefined,
		highlight: next.tab === 'contracts' ? (next.highlight ?? undefined) : undefined
	});

	return new URL(nextUrl);
}
