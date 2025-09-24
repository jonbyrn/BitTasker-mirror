/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Freelancer } from './freelancer';

// Legacy bid types
export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN' | 'SATS';
export type Visibility = 'PUBLIC' | 'PRIVATE';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COUNTERED';

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
	status?: BidStatus;
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
	dropOffLocation: any;
	pickupLocation: any;
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


// New nostr bid types
export interface NostrBid {
	type: 'bid';
	taskId: string;
	taskTitle: string; // Add task title
	taskDescription: string; // Add task description
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
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
	// Add this field to identify it as a bid
	messageType: 'bid';
	taskCreatorUsername?: string;
	taskCreatorAvatar?: string;
	taskCreatorPubkey?: string;
	// Bidder information
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;
	// RSK wallet address for escrow funding
	bidderWalletAddress?: string;
}

export interface BidMessage {
	bid: NostrBid; // The bid data
	senderPubkey: string; // Who sent the bid
	event: NostrEvent; // The Nostr event
}


export interface NostrBidData {
	type: 'bid';
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	hourlyRate: number | null;
	estimatedHours: number | null;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	taskCreatorPubkey: string;
	taskCreatorUsername: string;
	taskCreatorAvatar: string;
	bidderId: string;
	bidderName: string;
	bidderAvatar: string;
	bidderWalletAddress: string;
	startDateTime: string;
	endDateTime: string;
	messageType: 'bid';
}

export interface NostrBidMessage {
	bid: NostrBidData;
	senderPubkey: string;
	event: {
		id: string;
		pubkey: string;
		created_at: number;
		kind: number;
		tags: string[][];
		content: string;
		sig: string;
	};
}

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
			id: string;
			name: string;
			avatar: string;
		};
	};
}
