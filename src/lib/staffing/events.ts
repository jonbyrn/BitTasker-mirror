import type { Event } from 'nostr-tools';
import { endDateFor, inclusiveDays, isIsoDate } from './hours';
import { pubkeyHex } from './ids';
import { isStaffRole } from './roles';
import type { JobStatus, PayAsset, SeatStatus, StaffJob, StaffSeat } from './types';
import { SEAT_STATUSES } from './types';

const JOB_STATUSES = new Set<JobStatus>(['open', 'filled', 'cancelled']);
const SEAT_STATUS_SET = new Set<string>(SEAT_STATUSES);

function text(value: unknown, max: number): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, max);
}

function numberOr(value: unknown, fallback: number): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function dTag(event: Event): string {
	return event.tags.find((tag) => tag[0] === 'd')?.[1]?.trim() ?? '';
}

export function jobBody(job: StaffJob): string {
	return JSON.stringify({ v: 1, job });
}

export function seatBody(seat: StaffSeat): string {
	return JSON.stringify({ v: 1, seat });
}

export function parseJobEvent(event: Event): StaffJob | null {
	const id = dTag(event);
	const author = pubkeyHex(event.pubkey);
	if (!id || !author) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || !('job' in parsed)) return null;
	const job = (parsed as { job?: unknown }).job;
	if (!job || typeof job !== 'object') return null;
	const record = job as Partial<StaffJob>;
	if (!isStaffRole(String(record.role ?? ''))) return null;
	const status = JOB_STATUSES.has(record.status as JobStatus)
		? (record.status as JobStatus)
		: 'open';
	const date = text(record.date, 10);
	const startTime = text(record.startTime, 5);
	const endTime = text(record.endTime, 5);
	const title = text(record.title, 120);
	const requirements = text(record.requirements, 2000);
	const location = text(record.location, 200);
	if (!title || !requirements || !location || !isIsoDate(date) || !startTime || !endTime)
		return null;
	const storedDays = Math.max(1, Math.min(31, Math.floor(numberOr(record.days, 1))));
	let endDate = text(record.endDate, 10);
	let days = storedDays;
	if (!isIsoDate(endDate) || endDate < date) {
		try {
			endDate = endDateFor(date, storedDays);
		} catch {
			endDate = date;
			days = 1;
		}
	} else {
		try {
			days = inclusiveDays(date, endDate);
		} catch {
			days = storedDays;
		}
	}
	return {
		id,
		title,
		role: record.role as StaffJob['role'],
		requirements,
		location,
		date,
		endDate,
		startTime,
		endTime,
		days,
		headcount: Math.max(1, Math.floor(numberOr(record.headcount, 1))),
		hourlyRateUsd: Math.round(numberOr(record.hourlyRateUsd, 0) * 100) / 100,
		businessPubkey: author,
		status,
		createdAt: event.created_at ?? 0
	};
}

export function parseSeatEvent(event: Event): StaffSeat | null {
	const id = dTag(event);
	const author = pubkeyHex(event.pubkey);
	if (!id || !author) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || !('seat' in parsed)) return null;
	const seat = (parsed as { seat?: unknown }).seat;
	if (!seat || typeof seat !== 'object') return null;
	const record = seat as Partial<StaffSeat>;
	const worker = pubkeyHex(String(record.workerPubkey ?? ''));
	const business = pubkeyHex(String(record.businessPubkey ?? ''));
	if (!worker || !business) return null;
	if (author !== worker && author !== business) return null;
	if (!SEAT_STATUS_SET.has(String(record.status ?? ''))) return null;
	const jobId = text(record.jobId, 80);
	if (!jobId) return null;
	const asset: PayAsset = record.asset === 'btc' ? 'btc' : 'usdt';
	return {
		id,
		jobId,
		workerPubkey: worker,
		workerName: text(record.workerName, 80) || 'Worker',
		businessPubkey: business,
		status: record.status as SeatStatus,
		checkInAt: text(record.checkInAt, 40),
		checkOutAt: text(record.checkOutAt, 40),
		hoursWorked: Math.max(0, numberOr(record.hoursWorked, 0)),
		approvedHours: Math.max(0, numberOr(record.approvedHours, 0)),
		escrowUsd: Math.max(0, numberOr(record.escrowUsd, 0)),
		escrowSats: Math.max(0, Math.floor(numberOr(record.escrowSats, 0))),
		asset,
		releaseUsd: Math.max(0, numberOr(record.releaseUsd, 0)),
		contractId: text(record.contractId, 80),
		contractStatus: text(record.contractStatus, 40),
		disputeNote: text(record.disputeNote, 500),
		businessRating: Math.min(5, Math.max(0, Math.floor(numberOr(record.businessRating, 0)))),
		workerRating: Math.min(5, Math.max(0, Math.floor(numberOr(record.workerRating, 0)))),
		businessNote: text(record.businessNote, 300),
		workerNote: text(record.workerNote, 300),
		favourite: record.favourite === true,
		createdAt: event.created_at ?? 0
	};
}

export function newerByTag(events: readonly Event[]): Event[] {
	const byId = new Map<string, Event>();
	for (const event of events) {
		const id = dTag(event);
		if (!id) continue;
		const previous = byId.get(id);
		if (!previous || (event.created_at ?? 0) >= (previous.created_at ?? 0)) byId.set(id, event);
	}
	return [...byId.values()];
}
