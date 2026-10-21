import { describe, expect, it } from 'vitest';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import {
	EFFECTIVE_TASK_STATUS_EXPIRED,
	canBidOnTask,
	deadlineExpiresAt,
	getEffectiveStatus,
	isTaskExpired
} from '$lib/utils/helpers/taskExpiry';

function localDate(year: number, month: number, day: number, hours = 12, minutes = 0): Date {
	return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function dateOnly(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('taskExpiry', () => {
	const past = '2026-07-12';
	const pastInstant = localDate(2026, 7, 13, 0, 0);
	const onDeadlineDay = localDate(2026, 7, 12, 23, 30);
	const future = '2099-12-31';

	it('treats a past date-only deadline as expired when the status is open', () => {
		const task = { status: TaskStatusEnum.OPEN, deadline: past };
		expect(isTaskExpired(task, pastInstant)).toBe(true);
		expect(getEffectiveStatus(task, pastInstant)).toBe(EFFECTIVE_TASK_STATUS_EXPIRED);
		expect(canBidOnTask(task, pastInstant)).toBe(false);
	});

	it('keeps a future deadline open', () => {
		const task = { status: TaskStatusEnum.OPEN, deadline: future };
		const now = localDate(2026, 10, 21, 15, 0);
		expect(isTaskExpired(task, now)).toBe(false);
		expect(getEffectiveStatus(task, now)).toBe(TaskStatusEnum.OPEN);
		expect(canBidOnTask(task, now)).toBe(true);
	});

	it('stays open through the end of the deadline day in local time', () => {
		const task = { status: TaskStatusEnum.OPEN, deadline: past };
		expect(isTaskExpired(task, onDeadlineDay)).toBe(false);
		expect(isTaskExpired(task, new Date(2026, 6, 12, 23, 59, 59, 999))).toBe(false);
		expect(isTaskExpired(task, pastInstant)).toBe(true);
	});

	it('treats a UTC end-of-day stamp as that calendar day, not the UTC instant', () => {
		const task = { status: TaskStatusEnum.OPEN, deadline: '2026-07-12T23:59:59.999Z' };
		expect(isTaskExpired(task, onDeadlineDay)).toBe(false);
		expect(isTaskExpired(task, pastInstant)).toBe(true);
	});

	it('treats UTC midnight as the same calendar day', () => {
		const task = { status: TaskStatusEnum.OPEN, deadline: '2026-07-12T00:00:00.000Z' };
		expect(deadlineExpiresAt(task.deadline)).toBe(new Date(2026, 6, 12, 23, 59, 59, 999).getTime());
		expect(isTaskExpired(task, onDeadlineDay)).toBe(false);
	});

	it('expires a deadline that includes a real time at that instant', () => {
		const deadline = localDate(2026, 7, 12, 15, 30).toISOString();
		const task = { status: TaskStatusEnum.OPEN, deadline };
		expect(isTaskExpired(task, localDate(2026, 7, 12, 15, 0))).toBe(false);
		expect(isTaskExpired(task, localDate(2026, 7, 12, 16, 0))).toBe(true);
	});

	it('never expires a missing deadline', () => {
		const now = pastInstant;
		for (const deadline of [null, undefined, '', '   ']) {
			const task = { status: TaskStatusEnum.OPEN, deadline };
			expect(isTaskExpired(task, now)).toBe(false);
			expect(canBidOnTask(task, now)).toBe(true);
		}
	});

	it('never expires an invalid deadline', () => {
		const now = pastInstant;
		for (const deadline of ['not-a-date', '2026-02-31', '2026-13-40', 'Jul 12']) {
			expect(isTaskExpired({ status: TaskStatusEnum.OPEN, deadline }, now)).toBe(false);
			expect(deadlineExpiresAt(deadline)).toBeNull();
		}
	});

	it('leaves assigned, in progress, completed, and cancelled tasks unchanged', () => {
		const statuses = [
			TaskStatusEnum.BID_ACCEPTED,
			TaskStatusEnum.ESCROW_FUNDED,
			TaskStatusEnum.IN_PROGRESS,
			TaskStatusEnum.COMPLETED,
			TaskStatusEnum.CANCELLED,
			TaskStatusEnum.DISPUTED
		];
		for (const status of statuses) {
			const task = { status, deadline: past };
			expect(isTaskExpired(task, pastInstant)).toBe(false);
			expect(getEffectiveStatus(task, pastInstant)).toBe(status);
			expect(canBidOnTask(task, pastInstant)).toBe(false);
		}
	});

	it('does not expire a task whose status is missing', () => {
		expect(isTaskExpired({ deadline: past }, pastInstant)).toBe(false);
		expect(getEffectiveStatus({ deadline: past }, pastInstant)).toBe('');
		expect(canBidOnTask(null, pastInstant)).toBe(false);
	});

	it('uses the local calendar day for today', () => {
		const now = new Date();
		const task = { status: TaskStatusEnum.OPEN, deadline: dateOnly(now) };
		expect(isTaskExpired(task, now)).toBe(false);
	});
});
