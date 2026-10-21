import {
	endDateFor,
	expectedHours,
	hoursWorked,
	inclusiveDays,
	isIsoDate,
	payoutUsd
} from './hours';
import { pubkeyHex, samePerson } from './ids';
import { isStaffRole } from './roles';
import type { JobDraft, RebookDraft, SeatStatus, ShiftFilters, StaffJob, StaffSeat } from './types';

export class StaffRuleError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const COUNTED: ReadonlySet<SeatStatus> = new Set([
	'picked',
	'funded',
	'checked_in',
	'checked_out',
	'approved',
	'released',
	'disputed'
]);

const AFTER_CHECKOUT: ReadonlySet<SeatStatus> = new Set([
	'checked_out',
	'approved',
	'released',
	'disputed'
]);

export function foldText(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function seatsForJob(seats: readonly StaffSeat[], jobId: string): StaffSeat[] {
	return seats.filter((seat) => seat.jobId === jobId);
}

export function countedSeats(seats: readonly StaffSeat[]): StaffSeat[] {
	return seats.filter((seat) => COUNTED.has(seat.status));
}

export function canPick(job: StaffJob, seats: readonly StaffSeat[]): boolean {
	return (
		job.status !== 'cancelled' && countedSeats(seatsForJob(seats, job.id)).length < job.headcount
	);
}

export function shiftMatches(job: StaffJob, filters: ShiftFilters): boolean {
	if (job.status === 'cancelled') return false;
	if (filters.role && job.role !== filters.role) return false;
	if (filters.date && job.date < filters.date) return false;
	if (filters.maxRate > 0 && job.hourlyRateUsd > filters.maxRate) return false;
	if (filters.location && !foldText(job.location).includes(foldText(filters.location)))
		return false;
	return true;
}

export function jobExpectedHours(job: Pick<StaffJob, 'startTime' | 'endTime' | 'days'>): number {
	return expectedHours(job.startTime, job.endTime, job.days);
}

export function jobEscrowUsd(
	job: Pick<StaffJob, 'startTime' | 'endTime' | 'days' | 'hourlyRateUsd'>
): number {
	return payoutUsd(job.hourlyRateUsd, jobExpectedHours(job));
}

function resolveEndDate(draft: JobDraft): string {
	const explicit = draft.endDate?.trim() ?? '';
	if (explicit) {
		if (!isIsoDate(explicit) || !isIsoDate(draft.date) || explicit < draft.date) {
			throw new StaffRuleError('days');
		}
		return explicit;
	}
	const count = Math.floor(draft.days);
	if (!Number.isInteger(count) || count < 1 || count > 31) throw new StaffRuleError('days');
	try {
		return endDateFor(draft.date, count);
	} catch {
		throw new StaffRuleError('days');
	}
}

function seatFor(
	seats: readonly StaffSeat[],
	jobId: string,
	workerPubkey: string
): StaffSeat | undefined {
	return seats.find((seat) => seat.jobId === jobId && samePerson(seat.workerPubkey, workerPubkey));
}

function blankSeat(
	job: StaffJob,
	workerPubkey: string,
	workerName: string,
	now: number
): StaffSeat {
	return {
		id: `${job.id}:${pubkeyHex(workerPubkey).slice(0, 16)}`,
		jobId: job.id,
		workerPubkey: pubkeyHex(workerPubkey),
		workerName: workerName.trim() || 'Worker',
		businessPubkey: job.businessPubkey,
		status: 'applied',
		checkInAt: '',
		checkOutAt: '',
		hoursWorked: 0,
		approvedHours: 0,
		escrowUsd: 0,
		escrowSats: 0,
		asset: 'usdt',
		releaseUsd: 0,
		contractId: '',
		contractStatus: '',
		disputeNote: '',
		businessRating: 0,
		workerRating: 0,
		businessNote: '',
		workerNote: '',
		favourite: false,
		createdAt: now
	};
}

export function applyToShift(
	job: StaffJob,
	seats: readonly StaffSeat[],
	workerPubkey: string,
	workerName: string,
	now = Date.now()
): StaffSeat {
	if (job.status !== 'open') throw new StaffRuleError('closed');
	if (samePerson(job.businessPubkey, workerPubkey)) throw new StaffRuleError('own-job');
	if (!pubkeyHex(workerPubkey)) throw new StaffRuleError('pubkey');
	const existing = seatFor(seats, job.id, workerPubkey);
	if (existing && existing.status !== 'declined') throw new StaffRuleError('already');
	if (!canPick(job, seats)) throw new StaffRuleError('full');
	const seat = existing ? { ...existing } : blankSeat(job, workerPubkey, workerName, now);
	seat.status = 'applied';
	seat.workerName = workerName.trim() || seat.workerName;
	return seat;
}

/** A worker claims an open seat. The business funds it before check-in. */
export function acceptShift(
	job: StaffJob,
	seats: readonly StaffSeat[],
	workerPubkey: string,
	workerName: string,
	now = Date.now()
): StaffSeat {
	if (job.status !== 'open') throw new StaffRuleError('closed');
	if (samePerson(job.businessPubkey, workerPubkey)) throw new StaffRuleError('own-job');
	if (!pubkeyHex(workerPubkey)) throw new StaffRuleError('pubkey');
	const existing = seatFor(seats, job.id, workerPubkey);
	if (existing && existing.status !== 'declined' && existing.status !== 'applied') {
		throw new StaffRuleError('already');
	}
	if (!canPick(job, seats)) throw new StaffRuleError('full');
	const seat = existing ? { ...existing } : blankSeat(job, workerPubkey, workerName, now);
	seat.status = 'picked';
	seat.workerName = workerName.trim() || seat.workerName;
	return seat;
}

export function acceptInvite(
	job: StaffJob,
	seats: readonly StaffSeat[],
	workerPubkey: string
): StaffSeat {
	const seat = seatFor(seats, job.id, workerPubkey);
	if (!seat || seat.status !== 'invited' || !samePerson(seat.workerPubkey, workerPubkey)) {
		throw new StaffRuleError('not-invited');
	}
	if (!canPick(job, seats)) throw new StaffRuleError('full');
	return { ...seat, status: 'picked' };
}

export function pickWorker(job: StaffJob, seats: readonly StaffSeat[], seatId: string): StaffSeat {
	const seat = seats.find((item) => item.id === seatId && item.jobId === job.id);
	if (!seat || seat.status !== 'applied') throw new StaffRuleError('already');
	if (!canPick(job, seats)) throw new StaffRuleError('full');
	return { ...seat, status: 'picked' };
}

export function declineSeat(seat: StaffSeat): StaffSeat {
	if (seat.status !== 'invited' && seat.status !== 'applied' && seat.status !== 'picked') {
		throw new StaffRuleError('closed');
	}
	return { ...seat, status: 'declined' };
}

export function inviteWorker(
	job: StaffJob,
	seats: readonly StaffSeat[],
	workerPubkey: string,
	workerName: string,
	now = Date.now()
): StaffSeat {
	if (job.status === 'cancelled') throw new StaffRuleError('closed');
	if (samePerson(job.businessPubkey, workerPubkey)) throw new StaffRuleError('own-job');
	if (!pubkeyHex(workerPubkey)) throw new StaffRuleError('pubkey');
	if (seatFor(seats, job.id, workerPubkey)) throw new StaffRuleError('already');
	const seat = blankSeat(job, workerPubkey, workerName, now);
	seat.status = 'invited';
	return seat;
}

export function checkIn(seat: StaffSeat, at: string): StaffSeat {
	if (seat.status !== 'funded') throw new StaffRuleError('not-funded');
	if (!Number.isFinite(Date.parse(at))) throw new StaffRuleError('clock');
	return { ...seat, status: 'checked_in', checkInAt: at };
}

export function checkOut(seat: StaffSeat, at: string): StaffSeat {
	if (seat.status !== 'checked_in' || !seat.checkInAt) throw new StaffRuleError('clock');
	const worked = hoursWorked(seat.checkInAt, at);
	return { ...seat, status: 'checked_out', checkOutAt: at, hoursWorked: worked };
}

export function approveHours(seat: StaffSeat, hours: number, hourlyRateUsd: number): StaffSeat {
	if (seat.status !== 'checked_out') throw new StaffRuleError('clock');
	if (seat.disputeNote) throw new StaffRuleError('disputed');
	const approved = Math.round(hours * 100) / 100;
	if (!(approved > 0) || approved > seat.hoursWorked + 0.001) throw new StaffRuleError('hours');
	return {
		...seat,
		status: 'approved',
		approvedHours: approved,
		releaseUsd: payoutUsd(hourlyRateUsd, approved)
	};
}

export function canRelease(seat: StaffSeat): boolean {
	return seat.status === 'approved' && !seat.disputeNote && seat.releaseUsd > 0;
}

/** Bitcoin escrow pays the funded sats. A shorter approval has to use USDT. */
export function btcPartialRelease(seat: StaffSeat): boolean {
	return (
		seat.asset === 'btc' && seat.status === 'approved' && seat.releaseUsd + 0.001 < seat.escrowUsd
	);
}

export function disputeSeat(seat: StaffSeat, note: string): StaffSeat {
	const reason = note.trim();
	if (!reason) throw new StaffRuleError('dispute');
	const open =
		seat.status === 'funded' ||
		seat.status === 'checked_in' ||
		seat.status === 'checked_out' ||
		seat.status === 'approved';
	if (!open) throw new StaffRuleError('fund-first');
	return { ...seat, status: 'disputed', disputeNote: reason };
}

export function rateWorker(seat: StaffSeat, stars: number, note: string): StaffSeat {
	if (!AFTER_CHECKOUT.has(seat.status)) throw new StaffRuleError('clock');
	if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new StaffRuleError('rating');
	return { ...seat, workerRating: stars, workerNote: note.trim() };
}

export function rateBusiness(seat: StaffSeat, stars: number, note: string): StaffSeat {
	if (!AFTER_CHECKOUT.has(seat.status)) throw new StaffRuleError('clock');
	if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new StaffRuleError('rating');
	return { ...seat, businessRating: stars, businessNote: note.trim() };
}

export function markFavourite(seat: StaffSeat, favourite: boolean): StaffSeat {
	if (!COUNTED.has(seat.status)) throw new StaffRuleError('closed');
	return { ...seat, favourite };
}

export function rebookDraft(job: StaffJob, seat: StaffSeat): RebookDraft {
	if (!seat.favourite) throw new StaffRuleError('favourite');
	return {
		role: job.role,
		location: job.location,
		hourlyRateUsd: job.hourlyRateUsd,
		requirements: job.requirements,
		invitedPubkey: seat.workerPubkey,
		headcount: 1
	};
}

export function nextJobStatus(job: StaffJob, seats: readonly StaffSeat[]): StaffJob['status'] {
	if (job.status === 'cancelled') return 'cancelled';
	return canPick(job, seats) ? 'open' : 'filled';
}

export function buildJob(
	draft: JobDraft,
	businessPubkey: string,
	id: string,
	createdAt: number
): StaffJob {
	const title = draft.title.trim();
	const requirements = draft.requirements.trim();
	const location = draft.location.trim();
	if (!isStaffRole(draft.role)) throw new StaffRuleError('fields');
	if (!title || !requirements || !location) throw new StaffRuleError('fields');
	if (!isIsoDate(draft.date)) throw new StaffRuleError('fields');
	const endDate = resolveEndDate(draft);
	let days = 1;
	try {
		days = inclusiveDays(draft.date, endDate);
		expectedHours(draft.startTime, draft.endTime, days);
	} catch (error) {
		throw new StaffRuleError(error instanceof Error ? error.message : 'fields');
	}
	const headcount = Math.floor(draft.headcount);
	if (!Number.isInteger(headcount) || headcount < 1 || headcount > 100)
		throw new StaffRuleError('fields');
	if (!(draft.hourlyRateUsd > 0) || draft.hourlyRateUsd > 10_000)
		throw new StaffRuleError('fields');
	if (!pubkeyHex(businessPubkey)) throw new StaffRuleError('login');
	return {
		id,
		title,
		role: draft.role,
		requirements,
		location,
		date: draft.date,
		endDate,
		startTime: draft.startTime,
		endTime: draft.endTime,
		days,
		headcount,
		hourlyRateUsd: Math.round(draft.hourlyRateUsd * 100) / 100,
		businessPubkey: pubkeyHex(businessPubkey),
		status: 'open',
		createdAt
	};
}
