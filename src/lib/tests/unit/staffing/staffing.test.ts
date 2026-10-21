import { describe, expect, it } from 'vitest';
import { staffCopy } from '$lib/staffing/copy';
import { newerByTag, parseJobEvent, parseSeatEvent } from '$lib/staffing/events';
import { escrowUsd, expectedHours, hoursWorked } from '$lib/staffing/hours';
import { pubkeyHex, staffContractId } from '$lib/staffing/ids';
import {
	applyToShift,
	approveHours,
	buildJob,
	canPick,
	canRelease,
	checkIn,
	checkOut,
	disputeSeat,
	pickWorker,
	rateBusiness,
	rateWorker,
	rebookDraft,
	shiftMatches,
	StaffRuleError
} from '$lib/staffing/rules';
import type { StaffJob, StaffSeat } from '$lib/staffing/types';

const BUSINESS = 'a'.repeat(64);
const WORKER = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);

function job(overrides: Partial<StaffJob> = {}): StaffJob {
	return {
		id: 'job-1',
		title: 'Saturday floor staff',
		role: 'hospitality',
		requirements: 'Black shoes',
		location: 'Austin, TX',
		date: '2026-11-02',
		startTime: '09:00',
		endTime: '17:00',
		days: 1,
		headcount: 2,
		hourlyRateUsd: 25,
		businessPubkey: BUSINESS,
		status: 'open',
		createdAt: 1,
		...overrides
	};
}

function seat(overrides: Partial<StaffSeat> = {}): StaffSeat {
	return {
		id: `job-1:${WORKER.slice(0, 16)}`,
		jobId: 'job-1',
		workerPubkey: WORKER,
		workerName: 'Sam',
		businessPubkey: BUSINESS,
		status: 'applied',
		checkInAt: '',
		checkOutAt: '',
		hoursWorked: 0,
		approvedHours: 0,
		escrowUsd: 0,
		releaseUsd: 0,
		contractId: '',
		contractStatus: '',
		disputeNote: '',
		businessRating: 0,
		workerRating: 0,
		businessNote: '',
		workerNote: '',
		favourite: false,
		createdAt: 1,
		...overrides
	};
}

describe('temporary staff hours and escrow', () => {
	it('funds the expected hours and pays the approved hours', () => {
		expect(expectedHours('09:00', '17:00', 1)).toBe(8);
		expect(expectedHours('09:00', '17:00', 2)).toBe(16);
		expect(escrowUsd(25, 8)).toBe(200);
		expect(escrowUsd(25, 7.5)).toBe(187.5);
		expect(hoursWorked('2026-11-02T09:00:00.000Z', '2026-11-02T17:30:00.000Z')).toBe(8.5);
	});

	it('rejects a shift that ends before it starts', () => {
		expect(() => expectedHours('17:00', '09:00', 1)).toThrow('end-time');
	});

	it('keeps the staff contract id away from task completion', () => {
		const id = staffContractId('job-1', WORKER);
		expect(id.startsWith('staff-job-1-')).toBe(true);
		expect(id).not.toMatch(/^contract-[0-9a-f]{64}-[0-9a-f]{64}$/i);
		expect(pubkeyHex(`npub1`)).toBe('');
	});
});

describe('temporary staff rules', () => {
	it('lets a worker apply and blocks the poster and a full shift', () => {
		const posted = job();
		const applied = applyToShift(posted, [], WORKER, 'Sam');
		expect(applied.status).toBe('applied');
		expect(() => applyToShift(posted, [], BUSINESS, 'Owner')).toThrow(StaffRuleError);
		const picked = pickWorker(posted, [applied], applied.id);
		const second = applyToShift(posted, [picked], OTHER, 'Ada');
		const full = pickWorker(posted, [picked, second], second.id);
		expect(canPick(posted, [picked, full])).toBe(false);
		expect(() => applyToShift(posted, [picked, full], 'd'.repeat(64), 'No')).toThrow('full');
	});

	it('checks in only after funding and calculates the release', () => {
		const hired = seat({ status: 'picked' });
		expect(() => checkIn(hired, '2026-11-02T09:00:00.000Z')).toThrow('not-funded');
		const funded = checkIn(
			{ ...hired, status: 'funded', escrowUsd: 200 },
			'2026-11-02T09:00:00.000Z'
		);
		const done = checkOut(funded, '2026-11-02T17:00:00.000Z');
		expect(done.hoursWorked).toBe(8);
		const approved = approveHours(done, 6, 25);
		expect(approved.releaseUsd).toBe(150);
		expect(canRelease(approved)).toBe(true);
		expect(() => approveHours(done, 9, 25)).toThrow('hours');
		const disputed = disputeSeat(approved, 'Hours do not match the floor');
		expect(disputed.status).toBe('disputed');
		expect(canRelease(disputed)).toBe(false);
	});

	it('rates both ways and rebooks a favourite', () => {
		const done = seat({ status: 'checked_out', hoursWorked: 8, favourite: true });
		expect(rateWorker(done, 5, 'On time').workerRating).toBe(5);
		expect(rateBusiness(done, 4, 'Clear brief').businessRating).toBe(4);
		expect(() => rateWorker(done, 6, '')).toThrow('rating');
		const draft = rebookDraft(job(), done);
		expect(draft.invitedPubkey).toBe(WORKER);
		expect(draft.role).toBe('hospitality');
		expect(draft.headcount).toBe(1);
	});

	it('filters by role, date, rate, and location', () => {
		const posted = job();
		expect(
			shiftMatches(posted, {
				role: 'hospitality',
				date: '2026-11-01',
				maxRate: 30,
				location: 'austin'
			})
		).toBe(true);
		expect(shiftMatches(posted, { role: 'retail', date: '', maxRate: 0, location: '' })).toBe(
			false
		);
		expect(shiftMatches(posted, { role: '', date: '2026-12-01', maxRate: 0, location: '' })).toBe(
			false
		);
		expect(shiftMatches(posted, { role: '', date: '', maxRate: 20, location: '' })).toBe(false);
		expect(shiftMatches(posted, { role: '', date: '', maxRate: 0, location: 'dallas' })).toBe(
			false
		);
	});

	it('builds a shift from the form fields', () => {
		const posted = buildJob(
			{
				title: 'Floor staff',
				role: 'retail',
				requirements: 'Standing for the shift',
				location: 'Dallas',
				date: '2026-11-03',
				startTime: '10:00',
				endTime: '18:00',
				days: 1,
				headcount: 3,
				hourlyRateUsd: 22,
				invitedPubkey: ''
			},
			BUSINESS,
			'job-2',
			10
		);
		expect(posted.headcount).toBe(3);
		expect(posted.hourlyRateUsd).toBe(22);
		expect(() =>
			buildJob(
				{
					title: '',
					role: 'retail',
					requirements: '',
					location: '',
					date: 'nope',
					startTime: '10:00',
					endTime: '18:00',
					days: 1,
					headcount: 1,
					hourlyRateUsd: 22,
					invitedPubkey: ''
				},
				BUSINESS,
				'job-3',
				10
			)
		).toThrow('fields');
	});
});

describe('temporary staff events', () => {
	it('keeps the newer seat and ignores a stranger', () => {
		const body = JSON.stringify({ v: 1, seat: seat({ status: 'picked' }) });
		const older = {
			id: 'e1',
			pubkey: BUSINESS,
			created_at: 10,
			kind: 31151,
			tags: [['d', 'seat-1']],
			content: body,
			sig: ''
		};
		const newer = { ...older, id: 'e2', created_at: 20 };
		const stranger = { ...newer, id: 'e3', pubkey: OTHER, created_at: 30 };
		expect(newerByTag([older, newer])).toHaveLength(1);
		expect(parseSeatEvent(newer)?.status).toBe('picked');
		expect(parseSeatEvent(stranger)).toBeNull();
		const posted = parseJobEvent({
			id: 'j1',
			pubkey: BUSINESS,
			created_at: 5,
			kind: 31150,
			tags: [['d', 'job-9']],
			content: JSON.stringify({ v: 1, job: job({ id: 'ignored' }) }),
			sig: ''
		});
		expect(posted?.id).toBe('job-9');
		expect(posted?.businessPubkey).toBe(BUSINESS);
	});
});

describe('temporary staff copy', () => {
	it('uses short English and Spanish labels', () => {
		expect(staffCopy('en').title).toBe('Shifts');
		expect(staffCopy('es').title).toBe('Turnos');
		expect(staffCopy('en').off).toBe('Temp staff is not turned on.');
		expect(staffCopy('es').off).toBe('El personal temporal no está activado.');
		expect(staffCopy('es').fund).toBe('Apartar el pago');
	});
});
