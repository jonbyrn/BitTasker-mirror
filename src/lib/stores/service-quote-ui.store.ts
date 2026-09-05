import { writable } from 'svelte/store';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import type { Service } from '$lib/types/service.d';
import { buildServiceAddress } from '$lib/utils/service-quote/protocol';
import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';

export type ServiceQuoteDataFreshness = 'fresh' | 'stale' | 'partial';

export interface ServiceQuoteUiState {
	taskerTimelines: ServiceQuoteTimelineEntry[];
	providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
	lastUpdatedAt: number | null;
	loadingTasker: boolean;
	taskerLoaded: boolean;
	taskerLoadError: string | null;
	nonBlockingMessageCode: string | null;
}

const quoteStore = writable<ServiceQuoteUiState>({
	taskerTimelines: [],
	providerTimelinesByService: {},
	lastUpdatedAt: null,
	loadingTasker: false,
	taskerLoaded: false,
	taskerLoadError: null,
	nonBlockingMessageCode: null
});

export const serviceQuoteUiStore = Object.assign(quoteStore, {
	loadTaskerTimelines,
	setNonBlockingMessage
});

export type DashboardContractsType = 'all' | 'services' | 'tasks';

export function getTaskerTimelines(state: ServiceQuoteUiState): ServiceQuoteTimelineEntry[] {
	return state.taskerTimelines;
}

export function isRequestSyncActive(
	state: ServiceQuoteUiState,
	requestId: string | null,
	_serviceAddress: string | null
): boolean {
	return Boolean(requestId && state.loadingTasker);
}

export function setNonBlockingMessage(messageCode: string | null): void {
	quoteStore.update((state) => ({ ...state, nonBlockingMessageCode: messageCode }));
}

export async function loadTaskerTimelines(_requestId: string | null = null): Promise<void> {
	quoteStore.update((state) => ({ ...state, loadingTasker: false, taskerLoaded: true }));
}

export function getProviderDataFreshness(
	state: ServiceQuoteUiState,
	serviceAddress: string | null
): ServiceQuoteDataFreshness {
	if (!serviceAddress) return 'fresh';
	return state.providerTimelinesByService[serviceAddress] ? 'fresh' : 'partial';
}

export { buildServiceAddress, createDashboardUrl };

export function setProviderTimelines(
	service: Service,
	timelines: ServiceQuoteTimelineEntry[]
): void {
	const address = buildServiceAddress(service);
	quoteStore.update((state) => ({
		...state,
		providerTimelinesByService: {
			...state.providerTimelinesByService,
			[address]: timelines
		},
		lastUpdatedAt: Date.now()
	}));
}
