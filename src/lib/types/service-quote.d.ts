import type { Event as NostrEvent } from 'nostr-tools';
import type { Attachment, Location } from './task.d';
import type { ServicePricingType } from './service.d';

export type ServiceQuoteMessageType =
	| 'service-quote-request'
	| 'service-proposal'
	| 'service-proposal-status';

export type ServiceProposalStatus =
	| 'accepting'
	| 'contract_sync_pending'
	| 'accepted'
	| 'accept_failed'
	| 'accept_unknown'
	| 'declined'
	| 'withdrawn';

export type ServiceAcceptanceUnknownReasonCode =
	| 'pending_timeout'
	| 'tx_replaced'
	| 'rpc_unavailable'
	| 'nonce_conflict'
	| 'reconciliation_deferred';

export type ResolvedServiceProposalState = 'pending' | ServiceProposalStatus | 'expired';

export type ServiceQuoteFeatureKey = 'read' | 'write' | 'accept' | 'contractsFilter';

export interface ServiceQuoteFeatureState {
	read: boolean;
	write: boolean;
	accept: boolean;
	contractsFilter: boolean;
}

export interface ServiceQuoteRequestContent {
	type: 'service-quote-request';
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	serviceEventId?: string;
	pricingType: ServicePricingType;
	tierId?: string;
	selectedAddOns?: string[];
	rushDelivery?: boolean;
	inquiry: {
		title: string;
		description: string;
		customFormResponses?: Record<string, string | number | boolean | string[]>;
		attachments?: Attachment[];
	};
	quoteAmountUsdt?: string;
	timestamp: number;
	nonce?: string;
	version: 'v1';
	serviceLocation?: {
		mode: 'tasker_location';
		label: string;
		location: Location;
	};
}

export interface ServiceProposalPricingSnapshot {
	serviceVersionRef: string;
	tierId?: string;
	selectedAddOns?: string[];
	rushDelivery?: boolean;
	travelFeeUsdt?: string;
}

export interface ServiceProposalContent {
	type: 'service-proposal';
	proposalId: string;
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	paymentType: 'FIXED' | 'HOURLY';
	amountUsdt: string;
	description: string;
	estimatedDuration: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	coverLetter?: string;
	expirationDays: number;
	expirationHours: number;
	expirationTimestamp: number;
	freelancerBitcoinAddress: string;
	freelancerFeeTier: 0 | 1 | 2;
	pricingSnapshot: ServiceProposalPricingSnapshot;
	timestamp: number;
	nonce?: string;
	version: 'v1';
}

export interface ServiceAcceptanceSnapshot {
	clientBtcAddress: string;
	clientFeeTier: 0 | 1 | 2;
	freelancerBitcoinAddress: string;
	freelancerFeeTier: 0 | 1 | 2;
	chainId: number;
	contractAddress: string;
	conversionFormulaVersion: 'v1';
	conversionSnapshotId: string;
	btcUsdRateMicros: number;
	sourceTimestamp: number;
	requiredConfirmations: number;
	finalityPolicyVersion: string;
	sats: string;
	weiAmount: string;
	confirmationsAtVerification: number;
	verificationRpc: string;
}

export interface ServiceProposalStatusContent {
	type: 'service-proposal-status';
	proposalId: string;
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	status: ServiceProposalStatus;
	actorPubkey: string;
	message?: string;
	reasonCode?: ServiceAcceptanceUnknownReasonCode;
	timestamp: number;
	nonce?: string;
	escrowId?: string;
	transactionHash?: string;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
	version: 'v1';
}

export interface ServiceQuoteRequestEvent extends NostrEvent {
	kind: 6420;
	content: ServiceQuoteRequestContent;
}

export interface ServiceProposalEvent extends NostrEvent {
	kind: 6421;
	content: ServiceProposalContent;
}

export interface ServiceProposalStatusEvent extends NostrEvent {
	kind: 6422;
	content: ServiceProposalStatusContent;
}

export type ServiceQuoteContent =
	| ServiceQuoteRequestContent
	| ServiceProposalContent
	| ServiceProposalStatusContent;

export type ServiceQuoteValidatedEvent =
	| ServiceQuoteRequestEvent
	| ServiceProposalEvent
	| ServiceProposalStatusEvent;

export interface ResolvedServiceProposal {
	proposal: ServiceProposalEvent;
	statusEvents: ServiceProposalStatusEvent[];
	state: ResolvedServiceProposalState;
	expiresAt: number;
	isExpired: boolean;
	linkedEscrowId?: string;
	linkedTransactionHash?: string;
	winningStatus?: ServiceProposalStatusEvent;
}

export interface ServiceQuoteThread {
	request: ServiceQuoteRequestEvent;
	proposals: ResolvedServiceProposal[];
	taskerPubkey: string;
	taskeePubkey: string;
	serviceAddress: string;
	serviceId: string;
	latestProposal?: ResolvedServiceProposal;
	linkedEscrowId?: string;
}

export interface ServiceQuoteTimelineEntry {
	request: ServiceQuoteRequestEvent;
	proposals: ServiceProposalEvent[];
	statusEventsByProposalId: Record<string, ServiceProposalStatusEvent[]>;
	latestProposal?: ServiceProposalEvent;
	resolvedStatus: ResolvedServiceProposalState;
	resolvedTerminalEvent?: ServiceProposalStatusEvent;
	expirationTimestamp?: number;
	isExpired: boolean;
	linkedEscrowId?: string;
}

export interface ResolveServiceQuoteTimelineInput {
	request: ServiceQuoteRequestEvent;
	proposals: ServiceProposalEvent[];
	statusEvents: ServiceProposalStatusEvent[];
	now?: number;
}

export interface ServiceQuoteQueryResult {
	requests: ServiceQuoteRequestEvent[];
	proposals: ServiceProposalEvent[];
	statusEvents: ServiceProposalStatusEvent[];
	timelines: ServiceQuoteTimelineEntry[];
	isPartial?: boolean;
}

export interface ServiceQuoteStoreState extends ServiceQuoteQueryResult {
	loading: boolean;
	error: string | null;
	lastUpdatedAt: number | null;
}

export interface ServiceQuotePublishResult<TEvent extends object> {
	event: TEvent;
	relayResults: { relay: string; success: boolean; error?: string }[];
	publishedRelaySet: string[];
	duplicateOf?: string;
}

export interface ServiceQuotePublishSideEffectOptions {
	dmMirror?: boolean;
}

export type ServiceQuoteSideEffectAction =
	| 'inquiry_received'
	| 'proposal_received'
	| 'contract_created';

export interface ServiceQuoteMirrorPayload {
	type: 'service-quote-mirror';
	version: 'v1';
	action: Extract<ServiceQuoteSideEffectAction, 'inquiry_received' | 'proposal_received'>;
	serviceAddress: string;
	quoteRequestId: string;
	proposalId?: string;
	canonicalEventId: string;
	clickAction: string;
	text: string;
}

export interface ServiceQuoteRelayCapability {
	relay: string;
	state: 'supports_40' | 'unknown' | 'explicit_no_40';
	supportedNips?: number[];
}

export interface ServiceQuoteDeepLinkState {
	tab:
		| 'tasks'
		| 'my-services'
		| 'bids'
		| 'contracts'
		| 'saved-searches'
		| 'service-requests'
		| 'requests';
	view?: 'default' | 'service-requests' | 'tasker';
	context?: 'all' | 'tasks' | 'services';
	service?: string;
	request?: string;
	highlight?: string;
}

export interface ServiceQuoteFocusState {
	recentRequestId?: string;
	recentServiceAddress?: string;
	isSyncing?: boolean;
	messageCode?: string | null;
}

export interface ServiceQuoteContractSnapshot {
	contextType: 'service';
	contextId: string;
	contextTitle: string;
	contextDescription?: string;
	contextVersionRef?: string;
	serviceId: string;
	serviceAddress: string;
	quoteRequestId?: string;
	proposalId?: string;
	proposalEventId?: string;
	purchaseMode: 'quote' | 'instant_buy';
	instantOrderId?: string;
	selectedTierId?: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	pricingSnapshot: ServiceProposalPricingSnapshot;
}

export interface ServiceInstantBuySnapshot {
	serviceId: string;
	serviceAddress: string;
	serviceEventId: string;
	selectedTierId?: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	pricingSnapshot: ServiceProposalPricingSnapshot;
	instantOrderId: string;
}

export interface ServiceInstantBuyEligibility {
	eligible: boolean;
	reason?:
		| 'pricing_type'
		| 'missing_lead_hours'
		| 'invalid_lead_hours'
		| 'missing_delivery_time'
		| 'unsupported_add_ons'
		| 'unsupported_rush';
}

export interface ServiceQuoteContextSummary {
	title: string;
	description?: string;
	serviceAddress: string;
	serviceId: string;
	selectedTierId?: string;
	selectedAddOns?: string[];
	rushDelivery?: boolean;
	estimatedStartTime?: number;
	estimatedEndTime?: number;
	priceLabel?: string;
}

export interface ServiceQuoteProviderSummary {
	serviceAddress: string;
	serviceTitle?: string;
	serviceImage?: string;
	serviceLocation?: Location;
}
