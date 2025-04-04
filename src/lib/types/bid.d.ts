export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN';
export type Visibility = 'PUBLIC' | 'PRIVATE';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered';

export interface Bid {
	// Basic Information
	id?: string;
	taskId: string;
	bidderId?: string; // Nostr public key of bidder
	bidderName?: string;
	
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
	
	// Provider Information
	providerHighlights?: {
		skills: string[];
		certifications: string[];
		portfolioItems: string[];
	};
	
	// Visibility and Responsiveness
	visibility: Visibility;
	milestones?: string[];
	responseTime: number;
	
	// Negotiation Tracking
	counterOffers?: CounterOffer[];
	
	// Status Information
	status?: BidStatus;
	createdAt?: string;
	updatedAt?: string;
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
