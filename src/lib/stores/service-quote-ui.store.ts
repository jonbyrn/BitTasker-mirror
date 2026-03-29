import { browser, dev } from '$app/environment';
import { get, writable } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import type { QuoteRequestPayload, Service } from '$lib/types/service.d';
import type {
	ServiceAcceptanceUnknownReasonCode,
	ServiceProposalContent,
	ServiceProposalStatus,
	ServiceProposalStatusContent,
	ServiceQuoteTimelineEntry
} from '$lib/types/service-quote';
import { walletStore } from '$lib/stores/wallet.store';
import {
	buildServiceAddress,
	generateServiceQuoteEntityId,
	SERVICE_QUOTE_MESSAGE_TYPES
} from '$lib/utils/service-quote/protocol';
import {
	createDashboardUrl,
	getDashboardProviderTimelines,
	isDashboardRequestSyncActive,
	parseServiceQuoteDashboardQuery,
	type DashboardContractsContext,
	type DashboardMessageCode,
	type DashboardRouteParseResult,
	type DashboardRouteState,
	type DashboardTab,
	type DashboardView
} from '$lib/utils/service-quote/dashboard-route';
import {
	publishServiceProposal,
	publishServiceProposalDeletion,
	publishServiceProposalStatus,
	publishServiceQuoteRequest,
	publishServiceQuoteRequestDeletion
} from '$lib/utils/service-quote/publish';
import {
	beginServiceProposalAcceptance,
	markServiceProposalAcceptanceUnknown,
	validateServiceProposalAcceptance
} from '$lib/utils/service-quote/accept';
import { createServiceContract } from '$lib/utils/service-contract/create';
import type { ServiceContractPreflightErrorCode } from '$lib/utils/service-contract/preflight';
import {
	CONTRACT_CREATION_SYNCING_MESSAGE,
	getContractCreationTimeoutReason,
	waitForContractCreationByTransactionHash
} from '$lib/utils/service-contract/await-contract-creation';
import {
	queryServiceQuotesForTaskee,
	queryServiceQuotesForTasker
} from '$lib/utils/service-quote/query';
import { ensureProviderProposalAuthoring } from '$lib/utils/service-quote/provider-authoring';

const REQUEST_SYNC_WINDOW_MS = 15_000;
const PROVIDER_CACHE_TTL_MS = 30_000;

function logProviderTimelineDebug(event: string, details: Record<string, unknown>) {
	if (!browser || !dev) {
		return;
	}

	console.info('[serviceQuoteUiStore:provider]', event, details);
}

export { buildServiceAddress };
export { createDashboardUrl };
export type {
	DashboardContractsContext,
	DashboardMessageCode,
	DashboardRouteParseResult,
	DashboardRouteState,
	DashboardTab,
	DashboardView
};

export interface QuoteRequestSubmitResult {
	success: boolean;
	quoteRequestId?: string;
	serviceAddress?: string;
	error?: string;
}

export interface ServiceProposalComposerInput {
	service: Service;
	serviceAddress: string;
	quoteRequestId: string;
	description: string;
	amountUsdt: string;
	estimatedDuration: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	expirationDays: number;
	expirationHours: number;
	coverLetter?: string;
	dmMirror?: boolean;
}

export interface TaskerStatusActionInput {
	quoteRequestId: string;
	proposalId: string;
	status: Extract<
		ServiceProposalStatus,
		'accepting' | 'accepted' | 'accept_failed' | 'accept_unknown' | 'declined'
	>;
	message?: string;
	reasonCode?: ServiceAcceptanceUnknownReasonCode;
}

export interface TaskerProposalAcceptanceInput {
	quoteRequestId: string;
	proposalId: string;
}

export interface TaskerProposalAcceptanceResult {
	success: boolean;
	transactionHash?: string;
	error?: string;
	errorCode?: ServiceContractPreflightErrorCode;
}

export interface TaskerRequestDeletionInput {
	quoteRequestId: string;
}

export interface TaskerRequestDeletionResult {
	success: boolean;
	error?: string;
}

export interface ProviderProposalDeletionInput {
	serviceAddress: string;
	quoteRequestId: string;
	proposalId: string;
}

export interface ProviderProposalDeletionResult {
	success: boolean;
	error?: string;
}

type FocusSyncState = {
	requestId: string | null;
	serviceAddress: string | null;
	expiresAt: number | null;
};

export type ServiceQuoteDataFreshness = 'fresh' | 'stale' | 'partial';

type ServiceQuoteUiState = {
	taskerTimelines: ServiceQuoteTimelineEntry[];
	providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
	providerCacheKeyByService: Record<string, string>;
	loadingTasker: boolean;
	loadingProviderByService: Record<string, boolean>;
	taskerLoaded: boolean;
	providerLoadedByService: Record<string, boolean>;
	taskerLoadError: string | null;
	providerLoadErrorByService: Record<string, string | null>;
	taskerDataFreshness: ServiceQuoteDataFreshness;
	providerDataFreshnessByService: Record<string, ServiceQuoteDataFreshness>;
	providerLastLoadedAtByService: Record<string, number>;
	focusSync: FocusSyncState;
	nonBlockingMessageCode: DashboardMessageCode | null;
};

const initialState: ServiceQuoteUiState = {
	taskerTimelines: [],
	providerTimelinesByService: {},
	providerCacheKeyByService: {},
	loadingTasker: false,
	loadingProviderByService: {},
	taskerLoaded: false,
	providerLoadedByService: {},
	taskerLoadError: null,
	providerLoadErrorByService: {},
	taskerDataFreshness: 'fresh',
	providerDataFreshnessByService: {},
	providerLastLoadedAtByService: {},
	focusSync: {
		requestId: null,
		serviceAddress: null,
		expiresAt: null
	},
	nonBlockingMessageCode: null
};

export function getTaskerTimelines(state: ServiceQuoteUiState): ServiceQuoteTimelineEntry[] {
	return state.taskerTimelines;
}

export function getProviderTimelines(
	state: ServiceQuoteUiState,
	serviceAddress: string | null | undefined
): ServiceQuoteTimelineEntry[] {
	if (!serviceAddress) {
		return [];
	}

	return getDashboardProviderTimelines(state, serviceAddress);
}

export function isRequestSyncActive(
	state: Pick<ServiceQuoteUiState, 'focusSync'>,
	requestId: string | null | undefined,
	serviceAddress: string | null | undefined
): boolean {
	return isDashboardRequestSyncActive(state, requestId, serviceAddress);
}

export function getTaskerDataFreshness(
	state: Pick<ServiceQuoteUiState, 'taskerDataFreshness'>
): ServiceQuoteDataFreshness {
	return state.taskerDataFreshness;
}

export function getProviderDataFreshness(
	state: Pick<ServiceQuoteUiState, 'providerDataFreshnessByService'>,
	serviceAddress: string | null | undefined
): ServiceQuoteDataFreshness {
	if (!serviceAddress) {
		return 'fresh';
	}

	return state.providerDataFreshnessByService[serviceAddress] ?? 'fresh';
}

export function isTaskerTimelineSyncing(
	state: Pick<ServiceQuoteUiState, 'loadingTasker' | 'focusSync'>,
	requestId: string | null | undefined
): boolean {
	return state.loadingTasker || isRequestSyncActive(state, requestId, null);
}

export function isProviderTimelineSyncing(
	state: Pick<ServiceQuoteUiState, 'loadingProviderByService' | 'focusSync'>,
	serviceAddress: string | null | undefined,
	requestId: string | null | undefined
): boolean {
	if (!serviceAddress) {
		return false;
	}

	return (
		state.loadingProviderByService[serviceAddress] === true ||
		isRequestSyncActive(state, requestId, serviceAddress)
	);
}

function clearFocusSyncIfVisible(
	state: ServiceQuoteUiState,
	requestId: string | null | undefined,
	serviceAddress: string | null = null
): ServiceQuoteUiState {
	if (!requestId || !isRequestSyncActive(state, requestId, serviceAddress)) {
		return state;
	}

	return {
		...state,
		focusSync: {
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		}
	};
}

function hasTimelineForRequest(
	timelines: ServiceQuoteTimelineEntry[],
	requestId: string | null | undefined
): boolean {
	if (!requestId) {
		return false;
	}

	return timelines.some((timeline) => timeline.request.content.quoteRequestId === requestId);
}

function reconcileProviderRequestFocus(
	state: ServiceQuoteUiState,
	serviceAddress: string,
	requestId: string | null | undefined,
	timelines: ServiceQuoteTimelineEntry[]
): ServiceQuoteUiState {
	if (!requestId || state.providerLoadErrorByService[serviceAddress]) {
		return state;
	}

	const partialSync =
		isRequestSyncActive(state, requestId, serviceAddress) &&
		!hasTimelineForRequest(timelines, requestId);
	const nextState = {
		...state,
		providerDataFreshnessByService: {
			...state.providerDataFreshnessByService,
			[serviceAddress]: partialSync ? 'partial' : 'fresh'
		}
	};

	return partialSync ? nextState : clearFocusSyncIfVisible(nextState, requestId, serviceAddress);
}

function createSyntheticStatusEvent(
	content: ServiceProposalStatusContent,
	proposalId: string,
	status: ServiceProposalStatus
) {
	return {
		id: `${proposalId}-${status}-${content.timestamp}`,
		kind: 6422 as const,
		pubkey: content.actorPubkey,
		created_at: content.timestamp,
		tags: [],
		content,
		sig: ''
	};
}

function buildStatusContent(
	timeline: ServiceQuoteTimelineEntry,
	input: TaskerStatusActionInput,
	actorPubkey: string,
	overrides: Partial<ServiceProposalStatusContent> = {}
): ServiceProposalStatusContent {
	return {
		type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
		proposalId: input.proposalId,
		quoteRequestId: input.quoteRequestId,
		serviceId: timeline.request.content.serviceId,
		serviceAddress: timeline.request.content.serviceAddress,
		status: input.status,
		actorPubkey,
		message: input.message,
		reasonCode: input.reasonCode,
		timestamp: Math.floor(Date.now() / 1000),
		version: 'v1',
		...overrides
	};
}

function updateTaskerTimeline(
	timeline: ServiceQuoteTimelineEntry,
	input: TaskerStatusActionInput,
	content: ServiceProposalStatusContent
): ServiceQuoteTimelineEntry {
	const nextStatusEvent = createSyntheticStatusEvent(content, input.proposalId, input.status);
	const statusEvents = timeline.statusEventsByProposalId[input.proposalId] ?? [];

	return {
		...timeline,
		statusEventsByProposalId: {
			...timeline.statusEventsByProposalId,
			[input.proposalId]: [...statusEvents, nextStatusEvent]
		},
		resolvedStatus: input.status,
		linkedEscrowId: content.escrowId ?? timeline.linkedEscrowId,
		resolvedTerminalEvent:
			input.status === 'declined' || input.status === 'accepted'
				? nextStatusEvent
				: timeline.resolvedTerminalEvent
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return fallback;
}

function resolveProposalPaymentType(service: Service): ServiceProposalContent['paymentType'] {
	return service.pricing.type === 'HOURLY' ? 'HOURLY' : 'FIXED';
}

function buildProposalPricingSnapshot(
	service: Service,
	timeline: ServiceQuoteTimelineEntry
): ServiceProposalContent['pricingSnapshot'] {
	return {
		serviceVersionRef: service.id,
		tierId: timeline.request.content.tierId,
		selectedAddOns: timeline.request.content.selectedAddOns,
		rushDelivery: timeline.request.content.rushDelivery,
		travelFeeUsdt: '0.00'
	};
}

function buildAgreementSnapshot(
	timeline: ServiceQuoteTimelineEntry,
	proposal: ServiceQuoteTimelineEntry['proposals'][number]
) {
	return {
		selectedTierId: timeline.request.content.tierId,
		selectedAddOns: timeline.request.content.selectedAddOns,
		rushDelivery: timeline.request.content.rushDelivery,
		deliverables: proposal.content.description,
		inquiryAnswers: timeline.request.content.inquiry.customFormResponses,
		priceSnapshotRef: proposal.content.pricingSnapshot.serviceVersionRef,
		priceSnapshotLabel: proposal.content.estimatedDuration
	};
}

function mapAcceptanceError(code: 'expired' | 'invalid_time_bounds'): string {
	switch (code) {
		case 'expired':
			return 'This proposal has already expired.';
		case 'invalid_time_bounds':
			return 'This proposal has invalid timing information.';
	}
}

function getAcceptanceUnknownMessage(reasonCode: ServiceAcceptanceUnknownReasonCode): string {
	switch (reasonCode) {
		case 'tx_replaced':
			return 'Your wallet replaced the original escrow transaction, and the final confirmation is still syncing. Open Contracts to monitor the acceptance.';
		case 'reconciliation_deferred':
			return 'The escrow was created, but the acceptance status is still syncing between relays. Open Contracts to verify the service contract.';
		case 'rpc_unavailable':
			return 'The escrow confirmation could not be verified because the RPC is unavailable. Open Contracts to monitor the acceptance.';
		case 'nonce_conflict':
			return 'The escrow confirmation is waiting on a nonce conflict to settle. Open Contracts to monitor the acceptance.';
		case 'pending_timeout':
		default:
			return CONTRACT_CREATION_SYNCING_MESSAGE;
	}
}

function createServiceQuoteUiStore() {
	const store = writable<ServiceQuoteUiState>(initialState);
	const { subscribe, set, update } = store;
	const providerLoadPromisesByService = new Map<
		string,
		{ cacheKey: string; promise: Promise<ServiceQuoteTimelineEntry[]> }
	>();
	const providerLoadSequenceByService = new Map<string, number>();
	const FULL_PROVIDER_CACHE_KEY = '*';

	function shouldUseProviderCache(
		state: ServiceQuoteUiState,
		serviceAddress: string,
		requestId?: string | null,
		force = false,
		now = Date.now()
	): boolean {
		if (force) {
			return false;
		}

		if (state.providerLoadedByService[serviceAddress] !== true) {
			return false;
		}

		const lastLoadedAt = state.providerLastLoadedAtByService[serviceAddress];
		if (!lastLoadedAt || now - lastLoadedAt > PROVIDER_CACHE_TTL_MS) {
			return false;
		}

		const cacheKey = state.providerCacheKeyByService[serviceAddress] ?? FULL_PROVIDER_CACHE_KEY;
		if (!requestId && cacheKey !== FULL_PROVIDER_CACHE_KEY) {
			return false;
		}
		if (requestId && cacheKey !== FULL_PROVIDER_CACHE_KEY && cacheKey !== requestId) {
			return false;
		}

		if (
			requestId &&
			!hasTimelineForRequest(state.providerTimelinesByService[serviceAddress] ?? [], requestId)
		) {
			return false;
		}

		return true;
	}

	async function monitorPendingTaskerAcceptance(params: {
		timeline: ServiceQuoteTimelineEntry;
		proposal: ServiceQuoteTimelineEntry['proposals'][number];
		actorPubkey: string;
		quoteRequestId: string;
		proposalId: string;
		transactionHash: string;
	}) {
		try {
			const contractCreationEvent = await waitForContractCreationByTransactionHash(
				params.transactionHash
			);
			const acceptedInput: TaskerStatusActionInput = {
				quoteRequestId: params.quoteRequestId,
				proposalId: params.proposalId,
				status: 'accepted'
			};

			update((state) => ({
				...state,
				taskerTimelines: state.taskerTimelines.map((entry) =>
					entry.request.content.quoteRequestId === params.quoteRequestId
						? updateTaskerTimeline(
								entry,
								acceptedInput,
								buildStatusContent(params.timeline, acceptedInput, params.actorPubkey, {
									escrowId: contractCreationEvent.escrowId,
									transactionHash: contractCreationEvent.transactionHash ?? params.transactionHash
								})
							)
						: entry
				)
			}));
			return;
		} catch (error) {
			const reasonCode =
				error instanceof Error && error.message === CONTRACT_CREATION_SYNCING_MESSAGE
					? getContractCreationTimeoutReason(params.transactionHash)
					: 'reconciliation_deferred';
			const message =
				error instanceof Error && error.message !== CONTRACT_CREATION_SYNCING_MESSAGE
					? error.message
					: getAcceptanceUnknownMessage(reasonCode);
			const unknownInput: TaskerStatusActionInput = {
				quoteRequestId: params.quoteRequestId,
				proposalId: params.proposalId,
				status: 'accept_unknown',
				message,
				reasonCode
			};
			const unknownContent = buildStatusContent(params.timeline, unknownInput, params.actorPubkey, {
				transactionHash: params.transactionHash
			});

			markServiceProposalAcceptanceUnknown(params.proposalId, reasonCode, params.transactionHash);

			try {
				await publishServiceProposalStatus({
					content: unknownContent,
					proposalEventId: params.proposal.id,
					counterpartyPubkey: params.proposal.pubkey,
					taskerPubkey: params.timeline.request.pubkey,
					taskeePubkey: params.proposal.pubkey
				});
			} catch {
				// Preserve the acceptance ambiguity locally even if the relay publish fails.
			}

			update((state) => ({
				...state,
				taskerTimelines: state.taskerTimelines.map((entry) =>
					entry.request.content.quoteRequestId === params.quoteRequestId
						? updateTaskerTimeline(entry, unknownInput, unknownContent)
						: entry
				)
			}));
		}
	}

	return {
		subscribe,
		reset() {
			providerLoadPromisesByService.clear();
			providerLoadSequenceByService.clear();
			set(initialState);
		},
		parseDashboardQuery(searchParams: URLSearchParams): DashboardRouteParseResult {
			return parseServiceQuoteDashboardQuery(searchParams, get(store));
		},
		setNonBlockingMessage(messageCode: DashboardMessageCode | null) {
			update((state) => ({
				...state,
				nonBlockingMessageCode: messageCode
			}));
		},
		clearRecentSubmit() {
			update((state) => ({
				...state,
				focusSync: {
					requestId: null,
					serviceAddress: null,
					expiresAt: null
				}
			}));
		},
		async loadTaskerTimelines(requestId?: string | null) {
			update((state) => ({
				...state,
				loadingTasker: true,
				taskerLoadError: null
			}));

			try {
				const taskerPubkey = await getNpub();
				const result = await queryServiceQuotesForTasker(taskerPubkey);

				update((state) => {
					const partialSync =
						Boolean(requestId) &&
						isRequestSyncActive(state, requestId, null) &&
						!hasTimelineForRequest(result.timelines, requestId);
					const taskerDataFreshness: ServiceQuoteDataFreshness =
						partialSync || result.isPartial === true ? 'partial' : 'fresh';

					const nextState = {
						...state,
						taskerTimelines: result.timelines,
						taskerLoaded: true,
						loadingTasker: false,
						taskerLoadError: null,
						taskerDataFreshness
					};

					return partialSync ? nextState : clearFocusSyncIfVisible(nextState, requestId);
				});

				return result.timelines;
			} catch (error) {
				update((state) => ({
					...state,
					taskerLoaded: true,
					loadingTasker: false,
					taskerLoadError: getErrorMessage(
						error,
						'Unable to load your service quote requests right now.'
					),
					taskerDataFreshness: state.taskerTimelines.length > 0 ? 'stale' : 'fresh'
				}));
				throw error;
			}
		},
		async loadProviderTimelines(
			serviceAddress: string,
			requestId?: string | null,
			options: { force?: boolean } = {}
		) {
			const currentState = get(store);
			if (shouldUseProviderCache(currentState, serviceAddress, requestId, options.force)) {
				logProviderTimelineDebug('cache-hit', {
					serviceAddress,
					requestId: requestId ?? null,
					force: options.force === true,
					timelineCount: currentState.providerTimelinesByService[serviceAddress]?.length ?? 0,
					requestIds:
						currentState.providerTimelinesByService[serviceAddress]?.map(
							(timeline) => timeline.request.content.quoteRequestId
						) ?? [],
					loaded: currentState.providerLoadedByService[serviceAddress] === true,
					error: currentState.providerLoadErrorByService[serviceAddress] ?? null,
					freshness: currentState.providerDataFreshnessByService[serviceAddress] ?? 'fresh'
				});
				return currentState.providerTimelinesByService[serviceAddress] ?? [];
			}

			const requestCacheKey = requestId ?? FULL_PROVIDER_CACHE_KEY;
			const existingLoad = providerLoadPromisesByService.get(serviceAddress);
			if (existingLoad && options.force !== true && existingLoad.cacheKey === requestCacheKey) {
				logProviderTimelineDebug('join-inflight', {
					serviceAddress,
					requestId: requestId ?? null,
					force: false
				});
				return existingLoad.promise.then((timelines) => {
					update((state) =>
						reconcileProviderRequestFocus(state, serviceAddress, requestId, timelines)
					);
					return timelines;
				});
			}

			const sequence = (providerLoadSequenceByService.get(serviceAddress) ?? 0) + 1;
			providerLoadSequenceByService.set(serviceAddress, sequence);
			logProviderTimelineDebug('query-start', {
				serviceAddress,
				requestId: requestId ?? null,
				force: options.force === true,
				sequence
			});

			update((state) => ({
				...state,
				loadingProviderByService: {
					...state.loadingProviderByService,
					[serviceAddress]: true
				},
				providerLoadErrorByService: {
					...state.providerLoadErrorByService,
					[serviceAddress]: null
				}
			}));

			let providerPromise: Promise<ServiceQuoteTimelineEntry[]> | null = null;
			providerPromise = (async () => {
				try {
					const taskeePubkey = await getNpub();
					const result = await queryServiceQuotesForTaskee(
						serviceAddress,
						taskeePubkey,
						undefined,
						requestId ?? undefined
					);
					logProviderTimelineDebug('query-success', {
						serviceAddress,
						requestId: requestId ?? null,
						sequence,
						taskeePubkey,
						timelineCount: result.timelines.length,
						requestIds: result.timelines.map((timeline) => timeline.request.content.quoteRequestId)
					});

					update((state) => {
						if (providerLoadSequenceByService.get(serviceAddress) !== sequence) {
							return state;
						}

						const nextState = {
							...state,
							providerTimelinesByService: {
								...state.providerTimelinesByService,
								[serviceAddress]: result.timelines
							},
							providerCacheKeyByService: {
								...state.providerCacheKeyByService,
								[serviceAddress]: requestId ?? FULL_PROVIDER_CACHE_KEY
							},
							providerLoadedByService: {
								...state.providerLoadedByService,
								[serviceAddress]: true
							},
							providerLoadErrorByService: {
								...state.providerLoadErrorByService,
								[serviceAddress]: null
							},
							providerDataFreshnessByService: {
								...state.providerDataFreshnessByService,
								[serviceAddress]: result.isPartial === true ? 'partial' : 'fresh'
							},
							providerLastLoadedAtByService: {
								...state.providerLastLoadedAtByService,
								[serviceAddress]: Date.now()
							},
							loadingProviderByService: {
								...state.loadingProviderByService,
								[serviceAddress]: false
							}
						};

						return reconcileProviderRequestFocus(
							nextState,
							serviceAddress,
							requestId,
							result.timelines
						);
					});

					return result.timelines;
				} catch (error) {
					logProviderTimelineDebug('query-error', {
						serviceAddress,
						requestId: requestId ?? null,
						sequence,
						error: error instanceof Error ? error.message : String(error)
					});
					update((state) => {
						if (providerLoadSequenceByService.get(serviceAddress) !== sequence) {
							return state;
						}

						const hasCachedProviderData =
							(state.providerTimelinesByService[serviceAddress]?.length ?? 0) > 0 ||
							state.providerLoadedByService[serviceAddress] === true;
						const providerDataFreshness: ServiceQuoteDataFreshness = hasCachedProviderData
							? 'stale'
							: 'fresh';

						return {
							...state,
							providerLoadedByService: {
								...state.providerLoadedByService,
								[serviceAddress]: hasCachedProviderData
							},
							providerLoadErrorByService: {
								...state.providerLoadErrorByService,
								[serviceAddress]: getErrorMessage(
									error,
									'Unable to load service quote requests for this service right now.'
								)
							},
							providerDataFreshnessByService: {
								...state.providerDataFreshnessByService,
								[serviceAddress]: providerDataFreshness
							},
							loadingProviderByService: {
								...state.loadingProviderByService,
								[serviceAddress]: false
							}
						};
					});
					throw error;
				} finally {
					if (
						providerPromise &&
						providerLoadPromisesByService.get(serviceAddress)?.promise === providerPromise
					) {
						providerLoadPromisesByService.delete(serviceAddress);
					}
				}
			})();

			providerLoadPromisesByService.set(serviceAddress, {
				cacheKey: requestCacheKey,
				promise: providerPromise
			});
			return providerPromise;
		},
		async submitQuoteRequest(input: {
			service: Service;
			payload: QuoteRequestPayload;
			tierId?: string | null;
			selectedAddOnIds?: string[];
			rushDelivery?: boolean;
			dmMirror?: boolean;
		}): Promise<QuoteRequestSubmitResult> {
			try {
				const quoteRequestId = generateServiceQuoteEntityId('qr');
				const payload: QuoteRequestPayload = {
					...input.payload,
					tierId: input.tierId ?? input.payload.tierId,
					selectedAddOns: input.selectedAddOnIds ?? input.payload.selectedAddOns,
					rushDelivery: input.rushDelivery ?? input.payload.rushDelivery
				};
				const serviceAddress = buildServiceAddress(input.service);

				await publishServiceQuoteRequest({
					service: input.service,
					payload,
					quoteRequestId,
					sideEffects: {
						dmMirror: input.dmMirror
					}
				});

				update((state) => ({
					...state,
					focusSync: {
						requestId: quoteRequestId,
						serviceAddress,
						expiresAt: Date.now() + REQUEST_SYNC_WINDOW_MS
					},
					nonBlockingMessageCode: null
				}));

				return {
					success: true,
					quoteRequestId,
					serviceAddress
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error ? error.message : 'Unable to submit quote request right now.'
				};
			}
		},
		async sendLocalProposal(input: ServiceProposalComposerInput) {
			let timeline = getProviderTimelines(get(store), input.serviceAddress).find(
				(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
			);

			if (!timeline) {
				await this.loadProviderTimelines(input.serviceAddress, input.quoteRequestId);
				timeline = getProviderTimelines(get(store), input.serviceAddress).find(
					(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
				);
			}

			if (!timeline) {
				return {
					success: false,
					error: 'Unable to locate the selected quote request.'
				};
			}
			if (timeline.linkedEscrowId) {
				return {
					success: false,
					error: 'This quote request has already been converted into an active service contract.'
				};
			}
			if (timeline.isExpired || timeline.resolvedStatus === 'expired') {
				return {
					success: false,
					error: 'This quote request has already expired.'
				};
			}

			const providerAuthoring = await ensureProviderProposalAuthoring(get(walletStore).rsk.address);
			if (!providerAuthoring.ok) {
				return {
					success: false,
					error: providerAuthoring.error
				};
			}

			try {
				const proposalContent: ServiceProposalContent = {
					type: SERVICE_QUOTE_MESSAGE_TYPES.PROPOSAL,
					proposalId: generateServiceQuoteEntityId('pr'),
					quoteRequestId: input.quoteRequestId,
					serviceId: timeline.request.content.serviceId,
					serviceAddress: timeline.request.content.serviceAddress,
					paymentType: resolveProposalPaymentType(input.service),
					amountUsdt: input.amountUsdt,
					description: input.description,
					estimatedDuration: input.estimatedDuration,
					estimatedStartTime: input.estimatedStartTime,
					estimatedEndTime: input.estimatedEndTime,
					coverLetter: input.coverLetter,
					expirationDays: input.expirationDays,
					expirationHours: input.expirationHours,
					expirationTimestamp: 0,
					freelancerRskAddress: providerAuthoring.walletAddress,
					freelancerFeeTier: providerAuthoring.freelancerFeeTier,
					pricingSnapshot: buildProposalPricingSnapshot(input.service, timeline),
					timestamp: Math.floor(Date.now() / 1000),
					version: 'v1'
				};
				const publishResult = await publishServiceProposal({
					content: proposalContent,
					requestEventId: timeline.request.id,
					taskerPubkey: timeline.request.pubkey,
					sideEffects: {
						dmMirror: input.dmMirror
					}
				});
				const localProposalEvent =
					'content' in publishResult.event
						? publishResult.event
						: ({
								id: publishResult.event.id,
								kind: 6421,
								pubkey: input.service.npub,
								created_at: proposalContent.timestamp,
								tags: [
									['e', timeline.request.id],
									['p', timeline.request.pubkey]
								],
								content: {
									...proposalContent,
									expirationTimestamp:
										proposalContent.estimatedEndTime +
										proposalContent.expirationDays * 86_400 +
										proposalContent.expirationHours * 3_600
								},
								sig: ''
							} as ServiceQuoteTimelineEntry['proposals'][number]);

				update((state) => ({
					...state,
					providerTimelinesByService: {
						...state.providerTimelinesByService,
						[input.serviceAddress]: (
							state.providerTimelinesByService[input.serviceAddress] ?? []
						).map((entry) =>
							entry.request.content.quoteRequestId === input.quoteRequestId
								? {
										...entry,
										proposals: [...entry.proposals, localProposalEvent],
										latestProposal: localProposalEvent,
										resolvedStatus: 'pending',
										expirationTimestamp: localProposalEvent.content.expirationTimestamp,
										isExpired: false
									}
								: entry
						)
					},
					providerLoadedByService: {
						...state.providerLoadedByService,
						[input.serviceAddress]: true
					},
					providerDataFreshnessByService: {
						...state.providerDataFreshnessByService,
						[input.serviceAddress]: 'fresh'
					},
					providerLastLoadedAtByService: {
						...state.providerLastLoadedAtByService,
						[input.serviceAddress]: Date.now()
					},
					nonBlockingMessageCode: null
				}));

				return {
					success: true
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error ? error.message : 'Unable to publish the proposal right now.'
				};
			}
		},
		async deleteLocalProposal(
			input: ProviderProposalDeletionInput
		): Promise<ProviderProposalDeletionResult> {
			const currentState = get(store);
			let timeline = getProviderTimelines(currentState, input.serviceAddress).find(
				(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
			);

			if (!timeline) {
				await this.loadProviderTimelines(input.serviceAddress, input.quoteRequestId, {
					force: true
				});
				timeline = getProviderTimelines(get(store), input.serviceAddress).find(
					(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
				);
			}

			const proposal = timeline?.proposals.find(
				(entry) => entry.content.proposalId === input.proposalId
			);

			if (!timeline || !proposal) {
				return {
					success: false,
					error: 'Unable to locate the selected proposal.'
				};
			}

			if (timeline.linkedEscrowId || timeline.resolvedStatus === 'accepted') {
				return {
					success: false,
					error: 'This proposal is already linked to an active service contract.'
				};
			}

			try {
				await publishServiceProposalDeletion({
					proposalEventId: proposal.id,
					taskerPubkey: timeline.request.pubkey
				});

				await this.loadProviderTimelines(input.serviceAddress, input.quoteRequestId, {
					force: true
				});

				return { success: true };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error ? error.message : 'Unable to delete this proposal right now.'
				};
			}
		},
		async applyTaskerStatus(input: TaskerStatusActionInput) {
			const currentState = get(store);
			const timeline = currentState.taskerTimelines.find(
				(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
			);
			const proposal = timeline?.proposals.find(
				(entry) => entry.content.proposalId === input.proposalId
			);

			if (!timeline || !proposal) {
				return {
					success: false,
					error: 'Unable to locate the selected proposal.'
				};
			}

			try {
				const actorPubkey = await getNpub();
				const content = buildStatusContent(timeline, input, actorPubkey);

				await publishServiceProposalStatus({
					content,
					proposalEventId: proposal.id,
					counterpartyPubkey: proposal.pubkey,
					taskerPubkey: timeline.request.pubkey,
					taskeePubkey: proposal.pubkey
				});

				update((state) => ({
					...state,
					taskerTimelines: state.taskerTimelines.map((entry) =>
						entry.request.content.quoteRequestId === input.quoteRequestId
							? updateTaskerTimeline(entry, input, content)
							: entry
					),
					nonBlockingMessageCode: null
				}));

				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unable to update quote status.'
				};
			}
		},
		async deleteTaskerRequest(
			input: TaskerRequestDeletionInput
		): Promise<TaskerRequestDeletionResult> {
			const currentState = get(store);
			const timeline = currentState.taskerTimelines.find(
				(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
			);

			if (!timeline) {
				return {
					success: false,
					error: 'Unable to locate the selected service request.'
				};
			}

			if (timeline.linkedEscrowId) {
				return {
					success: false,
					error: 'This service request is already linked to a contract and cannot be deleted.'
				};
			}

			if (
				timeline.resolvedStatus === 'accepting' ||
				timeline.resolvedStatus === 'accept_unknown' ||
				timeline.resolvedStatus === 'accepted'
			) {
				return {
					success: false,
					error:
						'This service request is currently resolving a contract acceptance and cannot be deleted.'
				};
			}

			try {
				await publishServiceQuoteRequestDeletion({
					requestEventId: timeline.request.id,
					taskerPubkey: timeline.request.pubkey
				});

				update((state) => ({
					...state,
					taskerTimelines: state.taskerTimelines.filter(
						(entry) => entry.request.content.quoteRequestId !== input.quoteRequestId
					),
					providerTimelinesByService: Object.fromEntries(
						Object.entries(state.providerTimelinesByService).map(([serviceAddress, timelines]) => [
							serviceAddress,
							timelines.filter(
								(entry) => entry.request.content.quoteRequestId !== input.quoteRequestId
							)
						])
					),
					focusSync:
						state.focusSync.requestId === input.quoteRequestId
							? {
									requestId: null,
									serviceAddress: null,
									expiresAt: null
								}
							: state.focusSync,
					nonBlockingMessageCode: null
				}));

				return { success: true };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: 'Unable to delete this service request right now.'
				};
			}
		},
		async acceptTaskerProposal(
			input: TaskerProposalAcceptanceInput
		): Promise<TaskerProposalAcceptanceResult> {
			const currentState = get(store);
			const timeline = currentState.taskerTimelines.find(
				(entry) => entry.request.content.quoteRequestId === input.quoteRequestId
			);
			const proposal = timeline?.proposals.find(
				(entry) => entry.content.proposalId === input.proposalId
			);

			if (!timeline || !proposal) {
				return {
					success: false,
					error: 'Unable to locate the selected proposal.'
				};
			}

			if (timeline.linkedEscrowId || timeline.resolvedStatus === 'accepted') {
				return {
					success: false,
					error: 'This proposal is already linked to an active service contract.'
				};
			}

			if (timeline.resolvedStatus === 'accepting' || timeline.resolvedStatus === 'accept_unknown') {
				return {
					success: false,
					error:
						'This proposal acceptance is already in progress or still syncing. Open Contracts to monitor the service contract.'
				};
			}

			if (timeline.resolvedStatus !== 'pending' && timeline.resolvedStatus !== 'accept_failed') {
				return {
					success: false,
					error: 'This proposal is no longer available for acceptance.'
				};
			}

			const validation = validateServiceProposalAcceptance({
				proposalId: input.proposalId,
				quoteRequestId: input.quoteRequestId,
				serviceId: timeline.request.content.serviceId,
				estimatedStartTime: proposal.content.estimatedStartTime,
				estimatedEndTime: proposal.content.estimatedEndTime,
				expirationTimestamp: proposal.content.expirationTimestamp
			});
			if (!validation.ok && validation.errorCode) {
				return {
					success: false,
					error: mapAcceptanceError(validation.errorCode)
				};
			}

			let actorPubkey = '';
			try {
				actorPubkey = await getNpub();
				const acceptingInput: TaskerStatusActionInput = {
					quoteRequestId: input.quoteRequestId,
					proposalId: input.proposalId,
					status: 'accepting'
				};
				const acceptingContent = buildStatusContent(timeline, acceptingInput, actorPubkey);

				await publishServiceProposalStatus({
					content: acceptingContent,
					proposalEventId: proposal.id,
					counterpartyPubkey: proposal.pubkey,
					taskerPubkey: timeline.request.pubkey,
					taskeePubkey: proposal.pubkey
				});

				update((state) => ({
					...state,
					taskerTimelines: state.taskerTimelines.map((entry) =>
						entry.request.content.quoteRequestId === input.quoteRequestId
							? updateTaskerTimeline(entry, acceptingInput, acceptingContent)
							: entry
					),
					nonBlockingMessageCode: null
				}));

				const contractResult = await createServiceContract({
					freelancerPubkey: proposal.pubkey,
					freelancerAddress: proposal.content.freelancerRskAddress,
					amountUsdt: proposal.content.amountUsdt,
					estimatedStartTime: proposal.content.estimatedStartTime,
					estimatedCompletionTime: proposal.content.estimatedEndTime,
					serviceId: timeline.request.content.serviceId,
					serviceAddress: timeline.request.content.serviceAddress,
					serviceTitle: timeline.request.content.inquiry.title,
					serviceDescription: timeline.request.content.inquiry.description,
					contextVersionRef: proposal.content.pricingSnapshot.serviceVersionRef,
					purchaseMode: 'quote',
					quoteRequestId: input.quoteRequestId,
					proposalId: input.proposalId,
					proposalEventId: proposal.id,
					selectedTierId:
						proposal.content.pricingSnapshot.tierId ?? timeline.request.content.tierId,
					pricingSnapshot: proposal.content.pricingSnapshot,
					agreementSnapshot: buildAgreementSnapshot(timeline, proposal),
					freelancerFeeTier: proposal.content.freelancerFeeTier
				});

				if (!contractResult.success) {
					const failedInput: TaskerStatusActionInput = {
						quoteRequestId: input.quoteRequestId,
						proposalId: input.proposalId,
						status: 'accept_failed',
						message: contractResult.error
					};
					const failedContent = buildStatusContent(timeline, failedInput, actorPubkey, {
						transactionHash: contractResult.transactionHash
					});

					try {
						await publishServiceProposalStatus({
							content: failedContent,
							proposalEventId: proposal.id,
							counterpartyPubkey: proposal.pubkey,
							taskerPubkey: timeline.request.pubkey,
							taskeePubkey: proposal.pubkey
						});
					} catch {
						// Preserve the contract-creation failure as the primary error.
					}

					update((state) => ({
						...state,
						taskerTimelines: state.taskerTimelines.map((entry) =>
							entry.request.content.quoteRequestId === input.quoteRequestId
								? updateTaskerTimeline(entry, failedInput, failedContent)
								: entry
						)
					}));

					return {
						success: false,
						error: contractResult.error || 'Unable to create the service contract.',
						errorCode: contractResult.errorCode
					};
				}

				beginServiceProposalAcceptance(input.proposalId, contractResult.transactionHash);
				update((state) => ({
					...state,
					taskerTimelines: state.taskerTimelines.map((entry) =>
						entry.request.content.quoteRequestId === input.quoteRequestId
							? updateTaskerTimeline(
									entry,
									acceptingInput,
									buildStatusContent(timeline, acceptingInput, actorPubkey, {
										transactionHash: contractResult.transactionHash
									})
								)
							: entry
					)
				}));

				if (contractResult.transactionHash) {
					void monitorPendingTaskerAcceptance({
						timeline,
						proposal,
						actorPubkey,
						quoteRequestId: input.quoteRequestId,
						proposalId: input.proposalId,
						transactionHash: contractResult.transactionHash
					});
				}

				return {
					success: true,
					transactionHash: contractResult.transactionHash
				};
			} catch (error) {
				const failedInput: TaskerStatusActionInput = {
					quoteRequestId: input.quoteRequestId,
					proposalId: input.proposalId,
					status: 'accept_failed',
					message: error instanceof Error ? error.message : 'Unable to create the service contract.'
				};
				const failedContent = buildStatusContent(
					timeline,
					failedInput,
					actorPubkey || timeline.request.pubkey
				);

				try {
					await publishServiceProposalStatus({
						content: failedContent,
						proposalEventId: proposal.id,
						counterpartyPubkey: proposal.pubkey,
						taskerPubkey: timeline.request.pubkey,
						taskeePubkey: proposal.pubkey
					});
				} catch {
					// Preserve the local recoverable failure state when the relay update cannot be published.
				}

				update((state) => ({
					...state,
					taskerTimelines: state.taskerTimelines.map((entry) =>
						entry.request.content.quoteRequestId === input.quoteRequestId
							? updateTaskerTimeline(entry, failedInput, failedContent)
							: entry
					)
				}));

				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unable to create the service contract.'
				};
			}
		}
	};
}

export const serviceQuoteUiStore = createServiceQuoteUiStore();
