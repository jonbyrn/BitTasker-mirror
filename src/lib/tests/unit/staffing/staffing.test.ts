import { describe, expect, it, vi } from 'vitest';
import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { dayCountLabel, staffCopy, staffErrorFrom } from '$lib/staffing/copy';
import { roleLabel } from '$lib/staffing/roles';
import { STAFF_ROLE_CHOICES } from '$lib/staffing/types';
import { newerByTag, parseJobEvent, parseSeatEvent } from '$lib/staffing/events';
import {
	escrowUsd,
	expectedHours,
	hoursWorked,
	releaseUnits,
	shiftSpan
} from '$lib/staffing/hours';
import { pubkeyHex, staffContractId } from '$lib/staffing/ids';
import {
	acceptShift,
	applyToShift,
	approveHours,
	btcPartialRelease,
	buildJob,
	cancelJob,
	canPick,
	canRelease,
	checkIn,
	checkOut,
	disputeSeat,
	markFavourite,
	pickWorker,
	rateBusiness,
	rateWorker,
	rebookDraft,
	shiftMatches,
	StaffRuleError
} from '$lib/staffing/rules';
import type { StaffJob, StaffSeat } from '$lib/staffing/types';
import KINDS from '$lib/utils/constants/kinds';

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
		endDate: '2026-11-02',
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
		).toThrow('title');
		expect(() =>
			buildJob(
				{
					title: 'Saturday shop',
					role: '',
					requirements: 'Bring closed shoes',
					location: 'San Salvador',
					date: '2026-10-21',
					endDate: '2026-10-21',
					startTime: '09:00',
					endTime: '17:00',
					days: 1,
					headcount: 1,
					hourlyRateUsd: 3.5,
					invitedPubkey: ''
				},
				BUSINESS,
				'job-role',
				10
			)
		).toThrow('role');
		expect(() =>
			buildJob(
				{
					title: 'Saturday shop',
					role: 'shop_assistant',
					requirements: '   ',
					location: 'San Salvador',
					date: '2026-10-21',
					endDate: '2026-10-21',
					startTime: '09:00',
					endTime: '17:00',
					days: 1,
					headcount: 1,
					hourlyRateUsd: 3.5,
					invitedPubkey: ''
				},
				BUSINESS,
				'job-req',
				10
			)
		).toThrow('requirements');
		const shop = buildJob(
			{
				title: 'Saturday shop',
				role: 'shop_assistant',
				requirements: 'Bring closed shoes',
				location: 'San Salvador',
				date: '2026-10-21',
				endDate: '',
				startTime: '09:00',
				endTime: '17:00',
				days: 1,
				headcount: 1,
				hourlyRateUsd: 3.5,
				invitedPubkey: ''
			},
			BUSINESS,
			'job-shop',
			10
		);
		expect(shop.role).toBe('shop_assistant');
		expect(shop.hourlyRateUsd).toBe(3.5);
		expect(shop.days).toBe(1);
		expect(dayCountLabel('en', shop.days)).toBe('');
		expect(dayCountLabel('es', shop.days)).toBe('');
		expect(dayCountLabel('en', 2)).toBe('2 days');
		expect(dayCountLabel('es', 3)).toBe('3 días');
		expect(cancelJob(shop, BUSINESS).status).toBe('cancelled');
		expect(() => cancelJob(shop, 'c'.repeat(64))).toThrow('closed');
		expect(STAFF_ROLE_CHOICES).toContain('waiter');
		expect(STAFF_ROLE_CHOICES).toContain('pupusera');
		expect(STAFF_ROLE_CHOICES).not.toContain('shop_assistant');
		expect(roleLabel('admin', 'es')).toBe('Administración');
		expect(roleLabel('shop_assistant', 'en')).toBe('Shop assistant');
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
		expect(posted?.endDate).toBe('2026-11-02');
		expect(posted?.latitude).toBeUndefined();
		const pinned = parseJobEvent({
			id: 'j2',
			pubkey: BUSINESS,
			created_at: 6,
			kind: 31150,
			tags: [['d', 'job-9']],
			content: JSON.stringify({
				v: 1,
				job: job({ latitude: 13.4926, longitude: -89.3836 })
			}),
			sig: ''
		});
		expect(pinned?.latitude).toBe(13.4926);
		expect(pinned?.longitude).toBe(-89.3836);
		const legacy = parseSeatEvent({
			...newer,
			content: JSON.stringify({
				v: 1,
				seat: { ...seat({ status: 'picked' }), asset: undefined, escrowSats: undefined }
			})
		});
		expect(legacy?.asset).toBe('usdt');
		expect(legacy?.escrowSats).toBe(0);
		const bitcoin = parseSeatEvent({
			...newer,
			content: JSON.stringify({
				v: 1,
				seat: seat({ status: 'funded', asset: 'btc', escrowSats: 1500, escrowUsd: 1 })
			})
		});
		expect(bitcoin?.asset).toBe('btc');
		expect(bitcoin?.escrowSats).toBe(1500);
	});
});

describe('temporary staff copy', () => {
	it('uses short English and Spanish labels', () => {
		expect(staffCopy('en').title).toBe('Shifts');
		expect(staffCopy('es').title).toBe('Turnos');
		expect(staffCopy('en').off).toBe('Temp staff is not turned on.');
		expect(staffCopy('es').off).toBe('El personal temporal no está activado.');
		expect(staffCopy('es').fund).toBe('Apartar el pago');
		expect(staffCopy('en').openTab).toBe('Open shifts');
		expect(staffCopy('es').mineTab).toBe('Mis turnos');
		expect(staffCopy('en').noFee).toBe('No agency fee.');
		expect(staffCopy('es').noFee).toBe('Sin comisión de agencia.');
		expect(staffCopy('en').noKyc).toMatch(/no agency fee/i);
		expect(staffCopy('es').noKyc).toMatch(/comisión de agencia/);
		expect(staffErrorFrom('en', new Error('USDT escrow requires an rgb: invoice'))).toBe(
			staffCopy('en').errors.invoice
		);
		expect(staffErrorFrom('es', new Error('btc-partial'))).toBe(
			staffCopy('es').errors['btc-partial']
		);
	});
});

describe('one dollar shift with two accounts', () => {
	it('accepts, clocks, and pays one dollar with no agency fee', () => {
		const posted = buildJob(
			{
				title: 'Front desk',
				role: 'admin',
				requirements: 'Arrive on time',
				location: 'Austin, TX',
				date: '2026-11-01',
				endDate: '2026-11-01',
				startTime: '09:00',
				endTime: '10:00',
				days: 1,
				headcount: 1,
				hourlyRateUsd: 1,
				invitedPubkey: ''
			},
			BUSINESS,
			'job-dollar',
			10
		);
		expect(posted.days).toBe(1);
		expect(shiftSpan(posted)).toBe('2026-11-01 · 09:00–10:00');
		expect(posted.hourlyRateUsd).toBe(1);
		const hold = escrowUsd(
			posted.hourlyRateUsd,
			expectedHours(posted.startTime, posted.endTime, posted.days)
		);
		expect(hold).toBe(1);
		expect(() => acceptShift(posted, [], BUSINESS, 'Owner')).toThrow('own-job');
		const claimed = acceptShift(posted, [], WORKER, 'Sam');
		expect(claimed.status).toBe('picked');
		expect(() => acceptShift(posted, [claimed], OTHER, 'Ada')).toThrow('full');
		const funded = checkIn(
			{ ...claimed, status: 'funded', escrowUsd: hold, asset: 'usdt', escrowSats: 0 },
			'2026-11-01T09:00:00.000Z'
		);
		const done = checkOut(funded, '2026-11-01T10:00:00.000Z');
		expect(done.hoursWorked).toBe(1);
		const approved = approveHours(done, 1, posted.hourlyRateUsd);
		expect(approved.releaseUsd).toBe(1);
		expect(releaseUnits({ asset: 'usdt', releaseUsd: 1, escrowUsd: 1, escrowSats: 0 })).toBe(
			1_000_000
		);
		expect(releaseUnits({ asset: 'usdt', releaseUsd: 1, escrowUsd: 1, escrowSats: 0 })).not.toBe(
			Math.round(1_000_000 * 1.075)
		);
		expect(releaseUnits({ asset: 'btc', releaseUsd: 1, escrowUsd: 1, escrowSats: 1500 })).toBe(
			1500
		);
		const shorter = approveHours(done, 0.5, posted.hourlyRateUsd);
		expect(shorter.releaseUsd).toBe(0.5);
		expect(releaseUnits({ asset: 'usdt', releaseUsd: 0.5, escrowUsd: 1, escrowSats: 0 })).toBe(
			500_000
		);
		expect(btcPartialRelease({ ...shorter, asset: 'btc', escrowUsd: 1, escrowSats: 1500 })).toBe(
			true
		);
		const workerDispute = disputeSeat(approved, 'The hours were already approved');
		const businessDispute = disputeSeat(funded, 'Did not show');
		expect(workerDispute.status).toBe('disputed');
		expect(businessDispute.status).toBe('disputed');
		expect(canRelease(workerDispute)).toBe(false);
		expect(rateWorker(approved, 5, 'On time').workerRating).toBe(5);
		expect(rateBusiness(approved, 4, 'Clear brief').businessRating).toBe(4);
		const favourite = markFavourite(approved, true);
		expect(rebookDraft(posted, favourite).hourlyRateUsd).toBe(1);
		expect(rebookDraft(posted, favourite).invitedPubkey).toBe(WORKER);
	});

	it('keeps staff events on the listing relay with task and service kinds', () => {
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', 'wss://relay2.bittasker.com');
		expect(listingRelayUrls()).toEqual(['wss://relay2.bittasker.com']);
		expect(KINDS.STAFF_JOB).toBe(31150);
		expect(KINDS.STAFF_SEAT).toBe(31151);
		expect(KINDS.TASK_CREATION).toBeGreaterThanOrEqual(30000);
		expect(KINDS.SERVICE_ACTIVE).toBeGreaterThanOrEqual(30000);
		expect(KINDS.STAFF_JOB).toBeLessThan(40000);
		vi.unstubAllEnvs();
	});
});
