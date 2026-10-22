/** Job titles people actually hire for. Shown first on the shift form. */
export const COMMON_STAFF_ROLES = [
	'waiter',
	'cook',
	'cashier',
	'pupusera',
	'security',
	'cleaner',
	'reception',
	'loader'
] as const;

/**
 * Older listings still use these ids. `shop_assistant` stays readable so a saved
 * shift does not break, and it is left out of the picker because it repeats Retail.
 */
export const LEGACY_STAFF_ROLES = [
	'hospitality',
	'events',
	'warehouse',
	'retail',
	'shop_assistant',
	'admin',
	'cleaning',
	'promo',
	'other'
] as const;

export const STAFF_ROLES = [...COMMON_STAFF_ROLES, ...LEGACY_STAFF_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_CHOICES: StaffRole[] = STAFF_ROLES.filter(
	(role) => role !== 'shop_assistant'
);

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
	/** Public pin. Older shifts omit these and fall back to the location text. */
	latitude?: number;
	longitude?: number;
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
	role: string;
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
