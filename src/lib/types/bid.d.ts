import type { Freelancer } from './freelancer';
import type { Event as NostrEvent } from 'nostr-tools';
import type { Location, TaskTranslations } from '$lib/types/task';
import type { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import type { BidTranslations } from '$lib/nostr/bid';
import type { PaymentAsset, PaymentNetwork } from '$lib/utils/helpers/paymentContext';

// Legacy bid types
export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN' | 'SATS';
export type Visibility = 'PUBLIC' | 'PRIVATE';

// New nostr bid types
export interface NostrBidContent {
	schemaVersion?: string;
	type: 'bid';
	bidRef?: string;
	taskId: string;
	taskRef?: string;
	taskTitle: string; // Add task title
	taskDescription: string; // Add task description
	taskTranslations?: TaskTranslations; // Task translations for simple display
	amount: number;
	amountAtomic?: string;
	currency: string;
	paymentAsset?: PaymentAsset;
	paymentNetwork?: PaymentNetwork;
	paymentType: PaymentType;
	hourlyRate?: number | null; // Allow null values
	estimatedHours?: number | null; // Allow null values
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	// Updated datetime fields to match actual data structure
	startDateTime: string;
	endDateTime: string;

	taskCreatorUsername?: string;
	taskCreatorAvatar?: string;
	taskCreatorPubkey?: string;
	taskCreatorRating?: number;

	/** Original task budget (when bid was created) for display in sent offers */
	taskBudget?: {
		amount: number;
		currency?: string;
		paymentAsset?: PaymentAsset;
		paymentNetwork?: PaymentNetwork;
	};

	// Bidder information
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;
	bidderRating?: number;

	// RSK wallet address for escrow funding
	bidderWalletAddress?: string;
	bidderWalletNetwork?: PaymentNetwork;

	// Runtime properties added when processing bids
	status?: BidStatusEnum;
	
	// Translations (optional, may not be present in older bids)
	translations?: BidTranslations;
}

/**
 * @deprecated
 * Still used in BidCard.svelte, BidDetailsDrawer.svelte, BidsPanel.svelte, CounterOfferHistory.svelte
 */
export interface Bid {
	// Basic Information
	id: string;
	taskId: string;
	freelancerId: number;

	// Pricing Details
	amount: number;
	currency: Currency;
	paymentType: PaymentType;
	hourlyRate?: number;
	estimatedHours?: number;

	// Bid Details
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;

	// Visibility and Responsiveness
	visibility: Visibility;
	milestones?: Array<{ description: string }>;
	responseTime: number;

	// Status Information
	status?: BidStatusEnum;
	createdAt?: string;
	updatedAt?: string;

	// Client View
	clientViewed: boolean;
	clientViewedAt: string | null;
	featured: boolean;
	clientResponse: string | null;
	competitiveScore: number | null;
	rank: number | null;
	impressions: number;
	clicks: number;
	isWithdrawn: boolean;
	withdrawnReason: string | null;
	expiresAt: string | null;

	// Task Information
	task: {
		id: number;
		title: string;
		description: string;
		status: string;
	};

	// Freelancer Information
	freelancer: Freelancer;

	// Bidder Information (for Nostr bids)
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;

	// Provider Information
	// providerHighlights?: {
	// 	skills: string[];
	// 	certifications: string[];
	// 	portfolioItems: string[];
	// };

	// Negotiation Tracking
	counterOffers?: CounterOffer[];
}

export interface UserProfileOutput {
	user: {
		id: string;
		name: string;
		avatar: string;
	};
}

export interface TaskBid extends Bid {
	dropOffLocation: Location;
	pickupLocation: Location;
	freelancerId: number;
	bidderWalletAddress: string;
	clientViewed: boolean;
	clientViewedAt: string | null;
	featured: boolean;
	clientResponse: string | null;
	competitiveScore: number | null;
	rank: number | null;
	impressions: number;
	clicks: number;
	isWithdrawn: boolean;
	withdrawnReason: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	freelancer: {
		id: number;
		userId: number;
		professionalTitle: string | null;
		bio: string | null;
		promotionalVideo: string | null;
		yearsExperience: number | null;
		specialties: string[];
		standardRates: number | null;
		tasksCompleted: number;
		bidsSent: number;
		successRate: number | null;
		averageRating: number | null;
		level: number;
		experiencePoints: number;
		reputationScore: number;
		feeDiscount: number;
		monthlyActivityPoints: number;
		verificationLevel: 'UNVERIFIED' | 'VERIFIED' | 'PREMIUM';
		identityVerified: boolean;
		createdAt: string;
		updatedAt: string;
		user: {
			id: number;
			email: string;
		};
	};
	userProfile: UserProfileOutput;
}

export interface BidsResponse {
	received: {
		data: Bid[];
		pagination: {
			total: number;
			totalCount: number;
			offset: number;
			limit: number;
			hasNextPage: boolean;
			hasPreviousPage: boolean;
		};
	};
	submitted: {
		data: Bid[];
		pagination: {
			total: number;
			totalCount: number;
			offset: number;
			limit: number;
			hasNextPage: boolean;
			hasPreviousPage: boolean;
		};
	};
}

export interface CounterOffer {
	id: string;
	bidId: string;
	price: {
		amount: number;
		currency: Currency;
	};
	timeFrame?: {
		estimatedCompletion: string;
	};
	message: string;
	proposedBy: string; // Nostr public key of proposer
	createdAt: string;
	status: 'pending' | 'accepted' | 'rejected';
}

export interface Milestone {
	title: string;
	description: string;
	amount: number;
	deliverables: string;
	sequence: number;
	dueDate: string;
	estimatedHours: number;
}

export interface CreateBidParams {
	taskId: number;
	paymentType: PaymentType;
	currency: Currency;
	amount: number;
	hourlyRate?: number;
	estimatedHours?: number;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	milestones?: Array<Milestone>;
	visibility: Visibility;
	responseTime: number;
}

/**
 * @deprecated Use NostrBid instead
 * This type should no longer be used and will be removed in a future version
 */
export interface SimplifiedTaskBid {
	id: string;
	taskId: string;
	bidderWalletAddress: string;
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	hourlyRate?: number;
	estimatedHours?: number;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COUNTERED';
	createdAt: string;
	startDateTime: string;
	endDateTime: string;
	userProfile: {
		user: {
			rating: number;
			id: string;
			name: string;
			avatar: string;
		};
	};
}

// Bid status message types for Nostr communication
export interface NostrBidStatus {
	type: 'bid-status';
	schemaVersion?: string;
	taskId: string;
	taskRef?: string;
	bidRef?: string;
	status: BidStatusEnum;
	message?: string;
	timestamp: number;
	paymentAsset?: PaymentAsset;
	paymentNetwork?: PaymentNetwork;
	// For accepted bids, include escrow details
	escrowId?: string;
	transactionHash?: string;
}

export interface NostrEventWithFollowup extends NostrEvent {
	latestStatus?: Omit<NostrEvent, 'content'> & {
		content: NostrBidStatus;
	};
}
