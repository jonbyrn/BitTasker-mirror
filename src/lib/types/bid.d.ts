import type { Freelancer } from './freelancer';

export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN';
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

	// Provider Information
	// providerHighlights?: {
	// 	skills: string[];
	// 	certifications: string[];
	// 	portfolioItems: string[];
	// };

	// Negotiation Tracking
	counterOffers?: CounterOffer[];
}

export interface TaskBid extends Bid {
	freelancerId: number;
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
		verificationLevel: VerificationLevelEnum;
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
