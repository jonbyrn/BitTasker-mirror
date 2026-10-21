import type { StaffJob, StaffSeat } from '$lib/staffing/types';

export type BrowseMode = '' | 'local' | 'remote';

export interface BrowseFilters {
	query: string;
	categoryId: string;
	maxPrice: number;
	location: string;
	mode: BrowseMode;
	date: string;
}

export interface BrowseRow {
	title: string;
	text: string;
	categoryId: string;
	price: number;
	priceSuffix?: string;
	location: string;
	mode: BrowseMode;
	date: string;
}

export interface WorkerCard {
	pubkey: string;
	name: string;
	roles: string[];
	rating: number;
	jobs: number;
}

const AVAILABLE = new Set([
	'applied',
	'picked',
	'funded',
	'checked_in',
	'checked_out',
	'approved',
	'released'
]);

export function foldBrowse(value: string): string {
	return String(value || '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim();
}

export function matchesBrowse(row: BrowseRow, filters: BrowseFilters): boolean {
	if (filters.categoryId && row.categoryId !== filters.categoryId) return false;
	if (filters.mode && row.mode !== filters.mode) return false;
	if (filters.date && row.date < filters.date) return false;
	if (filters.maxPrice > 0 && row.price > filters.maxPrice) return false;
	if (filters.location && !foldBrowse(row.location).includes(foldBrowse(filters.location)))
		return false;
	const query = foldBrowse(filters.query);
	if (!query) return true;
	const haystack = foldBrowse(`${row.title} ${row.text} ${row.location}`);
	return haystack.includes(query);
}

export function availableWorkers(
	jobs: readonly StaffJob[],
	seats: readonly StaffSeat[]
): WorkerCard[] {
	const rolesByJob = new Map(jobs.map((job) => [job.id, job.role]));
	const grouped = new Map<
		string,
		{ name: string; roles: Set<string>; ratings: number[]; jobs: number }
	>();
	for (const seat of seats) {
		if (!AVAILABLE.has(seat.status)) continue;
		const current = grouped.get(seat.workerPubkey) ?? {
			name: seat.workerName || 'Worker',
			roles: new Set<string>(),
			ratings: [],
			jobs: 0
		};
		current.name = seat.workerName || current.name;
		const role = rolesByJob.get(seat.jobId);
		if (role) current.roles.add(role);
		if (seat.workerRating > 0) current.ratings.push(seat.workerRating);
		current.jobs += 1;
		grouped.set(seat.workerPubkey, current);
	}
	return [...grouped.entries()]
		.map(([pubkey, worker]) => ({
			pubkey,
			name: worker.name,
			roles: [...worker.roles],
			rating:
				worker.ratings.length > 0
					? Math.round(
							(worker.ratings.reduce((sum, value) => sum + value, 0) / worker.ratings.length) * 10
						) / 10
					: 0,
			jobs: worker.jobs
		}))
		.sort((left, right) => right.jobs - left.jobs || left.name.localeCompare(right.name));
}

export function workerMatches(
	worker: WorkerCard,
	filters: Pick<BrowseFilters, 'query' | 'categoryId'>
): boolean {
	if (filters.categoryId && !worker.roles.includes(filters.categoryId)) return false;
	const query = foldBrowse(filters.query);
	if (!query) return true;
	return foldBrowse(`${worker.name} ${worker.roles.join(' ')}`).includes(query);
}
