export const STAFF_ROLES = [
	'hospitality',
	'events',
	'warehouse',
	'retail',
	'admin',
	'cleaning',
	'promo',
	'other'
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const SEAT_STATUSES = [
	'invited',
	'applied',
	'picked',
	'funded',
	'checked_in',
	'checked_out',
	'approved',
	'released',
	'disputed',
	'declined'
] as const;

export type SeatStatus = (typeof SEAT_STATUSES)[number];

export type JobStatus = 'open' | 'filled' | 'cancelled';

export const PAY_ASSETS = ['usdt', 'btc'] as const;

export type PayAsset = (typeof PAY_ASSETS)[number];

export interface StaffJob {
	id: string;
	title: string;
	role: StaffRole;
	requirements: string;
	location: string;
	date: string;
	endDate: string;
	startTime: string;
	endTime: string;
	days: number;
	headcount: number;
	hourlyRateUsd: number;
	businessPubkey: string;
	status: JobStatus;
	createdAt: number;
}

export interface StaffSeat {
	id: string;
	jobId: string;
	workerPubkey: string;
	workerName: string;
	businessPubkey: string;
	status: SeatStatus;
	checkInAt: string;
	checkOutAt: string;
	hoursWorked: number;
	approvedHours: number;
	escrowUsd: number;
	escrowSats: number;
	asset: PayAsset;
	releaseUsd: number;
	contractId: string;
	contractStatus: string;
	disputeNote: string;
	businessRating: number;
	workerRating: number;
	businessNote: string;
	workerNote: string;
	favourite: boolean;
	createdAt: number;
}

export interface ShiftFilters {
	role: string;
	date: string;
	maxRate: number;
	location: string;
}

export interface RebookDraft {
	role: StaffRole;
	location: string;
	hourlyRateUsd: number;
	requirements: string;
	invitedPubkey: string;
	headcount: number;
}

export interface JobDraft {
	title: string;
	role: StaffRole;
	requirements: string;
	location: string;
	date: string;
	startTime: string;
	endTime: string;
	days: number;
	endDate?: string;
	headcount: number;
	hourlyRateUsd: number;
	invitedPubkey: string;
}
