import type { NostrEvent } from 'nostr-tools';
import type { TaskTranslations } from './task.d';
import type { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import type { BidTranslations } from '$lib/nostr/bid';

export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN' | 'SATS';
/** New bids lock in USD. Older relay events may still quote SATS. */
export type LockedBidCurrency = 'USD' | 'SATS';
export type Visibility = 'PUBLIC' | 'PRIVATE';

export interface NostrBidContent {
	type: 'bid';
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	taskBudget?: { amount: number; currency?: string };
	taskCreatorAvatar?: string;
	taskCreatorUsername?: string;
	taskCreatorRating?: number;
	taskCreatorPubkey?: string;
	taskTranslations?: TaskTranslations;
	/** Quote in `currency` units. Outbound bids use USD. */
	amount: number;
	/** `USD` for new bids. Historical bids use `SATS`. */
	currency: string;
	paymentType: PaymentType;
	hourlyRate?: number | null;
	estimatedHours?: number | null;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	startDateTime: number;
	endDateTime: number;
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;
	bidderRating?: number;
	status?: BidStatusEnum;
	translations?: BidTranslations;
}

export interface CounterOffer {
	id: string;
	bidId: string;
	price: { amount: number; currency: Currency };
	startDateTime?: number;
	endDateTime?: number;
	paymentType?: PaymentType;
	hourlyRate?: number | null;
	estimatedHours?: number | null;
	timeFrame?: { estimatedCompletion: string };
	message: string;
	proposedBy: string;
	createdAt: string;
	status: 'pending' | 'accepted' | 'rejected';
}

export interface NostrBidStatus {
	type: 'bid-status';
	taskId: string;
	status: BidStatusEnum;
	message?: string;
	timestamp: number;
	escrowId?: string;
	transactionHash?: string;
	/** Blank RGB invoice created by the Taskee. The Tasker pays this, not a self-invoice. */
	invoice?: string;
}

export type NostrEventWithFollowup = NostrEvent & {
	latestStatus?: NostrEvent & { content: NostrBidStatus | string };
};

export interface Bid {
	id: string;
	taskId: string;
	freelancerId: number;
	amount: number;
	currency: Currency;
	paymentType: PaymentType;
	hourlyRate?: number;
	estimatedHours?: number;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	visibility: Visibility;
	status?: BidStatusEnum;
	createdAt?: string;
	updatedAt?: string;
	bidderName?: string;
	bidderAvatar?: string;
	counterOffers?: CounterOffer[];
}
