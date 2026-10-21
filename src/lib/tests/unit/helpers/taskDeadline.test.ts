import { describe, expect, it } from 'vitest';
import {
	displayServiceStatus,
	displayTaskStatus,
	endFromTags,
	isServiceExpired,
	isShiftExpired,
	isTaskDeadlineExpired,
	timeLeftLabel
} from '$lib/utils/helpers/taskDeadline';

describe('isTaskDeadlineExpired', () => {
	const now = new Date('2026-10-21T18:00:00.000Z');

	it('stays open through the deadline day', () => {
		expect(isTaskDeadlineExpired('2026-10-21T00:00:00.000Z', now)).toBe(false);
	});

	it('expires the day after the deadline', () => {
		expect(isTaskDeadlineExpired('2026-10-20T23:00:00.000Z', now)).toBe(true);
	});

	it('stays open when there is no deadline', () => {
		expect(isTaskDeadlineExpired(null, now)).toBe(false);
	});

	it('reads unix seconds and milliseconds, and ignores a day-of-month', () => {
		const futureSeconds = String(Math.floor(now.getTime() / 1000) + 86400 * 10);
		const pastSeconds = '1700000000';
		expect(displayTaskStatus({ status: 'OPEN', deadline: futureSeconds }, now)).toBe('OPEN');
		expect(displayTaskStatus({ status: 'OPEN', deadline: pastSeconds }, now)).toBe('EXPIRED');
		expect(timeLeftLabel(futureSeconds, now)).not.toBe('Expired');
		expect(timeLeftLabel(Number(pastSeconds), now)).toBe('Expired');
		expect(displayTaskStatus({ status: 'OPEN', deadline: '14' }, now)).toBe('OPEN');
		expect(timeLeftLabel('14', now)).toBe('No deadline');
	});
});

describe('client-side expiry', () => {
	const now = new Date('2026-10-21T18:00:00.000Z');

	it('reads the deadline tag before other end tags', () => {
		expect(
			endFromTags([
				['expiration', '1700000000'],
				['deadline', '2026-10-20']
			])
		).toBe('2026-10-20T00:00:00.000Z');
	});

	it('shows EXPIRED for an open task past its deadline and leaves the stored status alone', () => {
		const task = { status: 'OPEN', deadline: '2026-10-20' };
		expect(displayTaskStatus(task, now)).toBe('EXPIRED');
		expect(task.status).toBe('OPEN');
		expect(displayTaskStatus({ status: 'OPEN', deadline: '2026-10-21' }, now)).toBe('OPEN');
		expect(displayTaskStatus({ status: 'IN_PROGRESS', deadline: '2026-10-01' }, now)).toBe(
			'IN_PROGRESS'
		);
		expect(
			displayTaskStatus({ status: 'OPEN', tags: [['deadline', '2026-10-20T00:00:00.000Z']] }, now)
		).toBe('EXPIRED');
	});

	it('expires an open shift and an active service only when an end date has passed', () => {
		expect(isShiftExpired({ status: 'open', endDate: '2026-10-20', date: '2026-10-18' }, now)).toBe(
			true
		);
		expect(isShiftExpired({ status: 'open', endDate: '2026-10-21', date: '2026-10-21' }, now)).toBe(
			false
		);
		expect(isShiftExpired({ status: 'filled', endDate: '2026-10-01' }, now)).toBe(false);
		expect(isServiceExpired({ status: 'active' }, now)).toBe(false);
		expect(isServiceExpired({ status: 'active', endsAt: '2026-10-20' }, now)).toBe(true);
		expect(displayServiceStatus({ status: 'active', endsAt: '2026-10-20' }, now)).toBe('expired');
		expect(displayServiceStatus({ status: 'active' }, now)).toBe('active');
	});
});
