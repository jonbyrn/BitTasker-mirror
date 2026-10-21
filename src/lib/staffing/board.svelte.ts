import { saveJob, saveSeat, loadStaffBoard } from './relay';
import type { StaffJob, StaffSeat } from './types';

export const staffBoard = $state({
	jobs: [] as StaffJob[],
	seats: [] as StaffSeat[],
	loaded: false,
	error: ''
});

function stamp<T extends { createdAt: number }>(item: T): T {
	return { ...item, createdAt: Math.floor(Date.now() / 1000) };
}

function mergeById<T extends { id: string; createdAt: number }>(current: T[], incoming: T[]): T[] {
	const byId: Record<string, T> = {};
	for (const item of [...current, ...incoming]) {
		const previous = byId[item.id];
		if (!previous || item.createdAt >= previous.createdAt) byId[item.id] = item;
	}
	return Object.values(byId).sort((left, right) => right.createdAt - left.createdAt);
}

export async function refreshStaffBoard(): Promise<void> {
	try {
		const loaded = await loadStaffBoard();
		staffBoard.jobs = mergeById(staffBoard.jobs, loaded.jobs);
		staffBoard.seats = mergeById(staffBoard.seats, loaded.seats);
		staffBoard.error = '';
	} catch {
		staffBoard.error = 'publish';
	} finally {
		staffBoard.loaded = true;
	}
}

export async function publishJob(job: StaffJob): Promise<StaffJob> {
	const next = stamp(job);
	await saveJob(next);
	staffBoard.jobs = mergeById(staffBoard.jobs, [next]);
	return next;
}

export async function publishSeat(seat: StaffSeat): Promise<StaffSeat> {
	const next = stamp(seat);
	await saveSeat(next);
	staffBoard.seats = mergeById(staffBoard.seats, [next]);
	return next;
}
