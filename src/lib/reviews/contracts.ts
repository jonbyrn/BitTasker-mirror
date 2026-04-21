export type ReviewSubjectType = 'task' | 'service_booking';

export type ReviewSettlementType = 'escrow' | 'service_quote_contract' | 'instant_buy_contract';

export type ReviewContractOutcome =
	| 'completed'
	| 'disputed_resolved_payout'
	| 'disputed_resolved_refund'
	| 'refunded';

export type ReviewRole = 'client' | 'provider' | 'freelancer' | 'tasker' | 'taskee';

export type ReviewLocale = 'en' | 'es';

export type ReviewTab = 'pending' | 'given' | 'received';

export interface ReviewAttachment {
	url: string;
	type: 'image' | 'video';
	alt: string;
	size: number;
	key?: string;
	cloudflareId?: string;
	variants?: Record<string, string>;
	width?: number;
	height?: number;
	mimeType?: string;
}

export interface ReviewLocalizedText {
	title?: string;
	comment: string;
}

export interface ReviewBilingualContent {
	sourceLanguage: ReviewLocale;
	en: ReviewLocalizedText;
	es: ReviewLocalizedText;
}

export interface ReviewDraftInput {
	subjectType: ReviewSubjectType;
	settlementType: ReviewSettlementType;
	reviewerPubkey: string;
	revieweePubkey: string;
	reviewerRole: ReviewRole;
	revieweeRole: ReviewRole;
	contractOutcome: ReviewContractOutcome;
	createdAt: number;
	rating: number;
	content: ReviewBilingualContent;
	attachments: ReviewAttachment[];
}

export interface ReviewDraftPayload extends ReviewDraftInput {
	reviewDraftHash: string;
}

export interface ReviewAttestationPayload {
	reviewEventId: string;
	reviewDraftHash: string;
	subjectType: ReviewSubjectType;
	settlementType: ReviewSettlementType;
	reviewerPubkey: string;
	revieweePubkey: string;
	reviewerRole: ReviewRole;
	revieweeRole: ReviewRole;
	contractOutcome: ReviewContractOutcome;
}

export interface ReviewAttestationRecord extends ReviewAttestationPayload {
	attestationEventId: string;
	issuerPubkey: string;
	keyId: string;
	issuedAt: number;
	expiresAt: number;
}

export interface ReviewReplyContent {
	sourceLanguage: ReviewLocale;
	en: ReviewLocalizedText;
	es: ReviewLocalizedText;
}

export interface ReviewReplyPayload {
	schemaVersion: 1;
	parentReviewEventId: string;
	revieweePubkey: string;
	createdAt: number;
	content: ReviewReplyContent;
	attachments: ReviewAttachment[];
}

export interface ReviewEventRecord extends ReviewDraftPayload {
	reviewEventId: string;
	attestationEventId?: string;
	attestation?: ReviewAttestationRecord;
	reply?: ReviewReplyPayload | null;
	isDeleted?: boolean;
	sourceVisibility?: ReviewSourceVisibility;
	sourcePresentation?: ReviewSourcePresentation | null;
}

export type ReviewSourceVisibility = 'public_present' | 'public_deleted' | 'public_unknown';

export interface ReviewSourcePresentation {
	label?: string;
	href?: string | null;
}

export interface ReviewSummary {
	totalGiven: number;
	totalReceived: number;
	totalPending: number;
	averageRating: number;
}

export interface ReviewFeedResponse {
	pending: ReviewEventRecord[];
	given: ReviewEventRecord[];
	received: ReviewEventRecord[];
	summary: ReviewSummary;
}

export interface ReviewRouteState {
	tab: ReviewTab;
	highlight: string | null;
	replyTo: string | null;
}

export interface ReviewComposerDraft {
	id: string;
	createdAt: number;
	title: string;
	comment: string;
	sourceLanguage: ReviewLocale;
	rating: number;
	attachments: ReviewAttachment[];
}

export interface ReviewComposerDraftSet {
	review: ReviewComposerDraft | null;
	reply: ReviewComposerDraft | null;
}

export interface ReviewSubmissionResult {
	reviewEventId: string;
	attestationEventId: string;
	reviewDraftHash: string;
}
