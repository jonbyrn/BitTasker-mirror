export type PaymentType = 'FIXED' | 'HOURLY';
export type Currency = 'USD' | 'BTC' | 'L-BTC' | 'LN';
export type Visibility = 'PUBLIC' | 'PRIVATE';

export interface Bid {
	taskId: string;
	amount: number;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	paymentType: PaymentType;
	hourlyRate?: number;
	estimatedHours?: number;
	currency: Currency;
	visibility: Visibility;
	milestones?: string[];
	responseTime: number;
}
