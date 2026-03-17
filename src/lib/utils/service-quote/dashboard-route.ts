import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import {
	buildDashboardQueryUrl,
	isValidQuoteRequestId,
	isValidServiceAddress,
	parseDashboardQuery,
	type DashboardContractsContext,
	type DashboardTab,
	type DashboardView
} from '$lib/utils/dashboardQuery';

const ESCROW_HIGHLIGHT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export type { DashboardContractsContext, DashboardTab, DashboardView };

export type DashboardMessageCode =
	| 'quotes_request_not_found'
	| 'service_quotes_request_not_found'
	| 'contracts_highlight_not_found'
	| 'service_quote_protocol_pending';

export interface DashboardRouteState {
	tab: DashboardTab;
	view: DashboardView;
	context: DashboardContractsContext;
	serviceAddress: string | null;
	requestId: string | null;
	highlight: string | null;
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

/** Empty dashboard-route context used when only query canonicalization is needed. */
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

function hasMatchingTimeline(
	timelines: ServiceQuoteTimelineEntry[],
	requestId: string | null
): boolean {
	if (!requestId) {
		return false;
	}

	return timelines.some((timeline) => timeline.request.content.quoteRequestId === requestId);
}

function isValidEscrowHighlight(value: string | null | undefined): value is string {
	return Boolean(value && ESCROW_HIGHLIGHT_RE.test(value));
}

/** Returns provider timelines for the selected service or an empty list when none are loaded. */
export function getDashboardProviderTimelines(
	context: Pick<DashboardRouteContext, 'providerTimelinesByService'>,
	serviceAddress: string | null | undefined
): ServiceQuoteTimelineEntry[] {
	if (!serviceAddress) {
		return [];
	}

	return context.providerTimelinesByService[serviceAddress] ?? [];
}

/**
 * Indicates whether the current dashboard request focus should be preserved while quote data syncs.
 */
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

/**
 * Canonicalizes dashboard quote/contract query params against the locked route contract.
 */
export function parseServiceQuoteDashboardQuery(
	searchParams: URLSearchParams,
	context: DashboardRouteContext,
	now = Date.now()
): DashboardRouteParseResult {
	const url = new URL('https://bittasker.local/dashboard');
	url.search = searchParams.toString();

	const parsed = parseDashboardQuery(url);
	const normalized: DashboardRouteState = {
		tab: parsed.tab,
		view:
			parsed.tab === 'quotes'
				? 'tasker'
				: parsed.tab === 'my-services'
					? parsed.view === 'quotes'
						? 'quotes'
						: 'default'
					: 'default',
		context: parsed.tab === 'contracts' ? (parsed.context ?? 'all') : 'all',
		serviceAddress: null,
		requestId: null,
		highlight: null
	};

	let messageCode: DashboardMessageCode | null = null;

	if (
		parsed.tab === 'my-services' &&
		normalized.view === 'quotes' &&
		parsed.service &&
		isValidServiceAddress(parsed.service)
	) {
		normalized.serviceAddress = parsed.service;
	}

	if (parsed.tab === 'contracts') {
		if (parsed.highlight && isValidEscrowHighlight(parsed.highlight)) {
			normalized.highlight = parsed.highlight;
		} else if (parsed.highlight) {
			messageCode = 'contracts_highlight_not_found';
		}
	}

	const requestAllowed =
		(parsed.tab === 'quotes' && normalized.view === 'tasker') ||
		(parsed.tab === 'my-services' &&
			normalized.view === 'quotes' &&
			Boolean(normalized.serviceAddress));

	if (requestAllowed && parsed.request) {
		if (isValidQuoteRequestId(parsed.request)) {
			normalized.requestId = parsed.request;
		} else {
			messageCode =
				parsed.tab === 'quotes'
					? 'quotes_request_not_found'
					: 'service_quotes_request_not_found';
		}
	}

	if (
		normalized.tab === 'quotes' &&
		normalized.requestId &&
		!hasMatchingTimeline(context.taskerTimelines, normalized.requestId)
	) {
		const keepFocusedRequest =
			!context.taskerLoaded ||
			isDashboardRequestSyncActive(context, normalized.requestId, null, now);
		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'quotes_request_not_found';
		}
	}

	if (
		normalized.tab === 'my-services' &&
		normalized.view === 'quotes' &&
		normalized.serviceAddress &&
		normalized.requestId
	) {
		const providerTimelines = getDashboardProviderTimelines(context, normalized.serviceAddress);
		const providerLoaded = context.providerLoadedByService[normalized.serviceAddress] === true;
		const keepFocusedRequest =
			!providerLoaded ||
			isDashboardRequestSyncActive(context, normalized.requestId, normalized.serviceAddress, now) ||
			hasMatchingTimeline(providerTimelines, normalized.requestId);

		if (!keepFocusedRequest) {
			normalized.requestId = null;
			messageCode = 'service_quotes_request_not_found';
		}
	}

	const canonicalUrl = buildDashboardQueryUrl(
		new URL('https://bittasker.local/dashboard'),
		{
			tab: normalized.tab,
			view:
				normalized.tab === 'quotes'
					? 'tasker'
					: normalized.tab === 'my-services'
						? normalized.view
						: undefined,
			context: normalized.tab === 'contracts' ? normalized.context : undefined,
			service:
				normalized.tab === 'my-services' && normalized.view === 'quotes'
					? normalized.serviceAddress ?? undefined
					: undefined,
			request: normalized.requestId ?? undefined,
			highlight: normalized.tab === 'contracts' ? normalized.highlight ?? undefined : undefined
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

/** Builds a canonical dashboard URL from the current route plus a partial state update. */
export function createDashboardUrl(
	baseUrl: URL,
	updates: Partial<DashboardRouteState>
): URL {
	const current = parseServiceQuoteDashboardQuery(
		baseUrl.searchParams,
		emptyDashboardRouteContext
	).state;
	const next: DashboardRouteState = {
		...current,
		...updates
	};
	const nextUrl = buildDashboardQueryUrl(baseUrl, {
		tab: next.tab,
		view:
			next.tab === 'quotes'
				? 'tasker'
				: next.tab === 'my-services'
					? next.view
					: undefined,
		context: next.tab === 'contracts' ? next.context : undefined,
		service:
			next.tab === 'my-services' && next.view === 'quotes'
				? next.serviceAddress ?? undefined
				: undefined,
		request: next.requestId ?? undefined,
		highlight: next.tab === 'contracts' ? next.highlight ?? undefined : undefined
	});

	return new URL(nextUrl);
}
