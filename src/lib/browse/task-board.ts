import type { Task } from '$lib/types/task.d';

/** El Salvador first, then the rest of Latin America. */
const LATAM: { code: string; rank: number; names: string[] }[] = [
	{ code: 'SV', rank: 0, names: ['el salvador', 'san salvador'] },
	{ code: 'GT', rank: 1, names: ['guatemala'] },
	{ code: 'HN', rank: 2, names: ['honduras'] },
	{ code: 'NI', rank: 3, names: ['nicaragua'] },
	{ code: 'CR', rank: 4, names: ['costa rica'] },
	{ code: 'PA', rank: 5, names: ['panama'] },
	{ code: 'MX', rank: 6, names: ['mexico', 'méxico'] },
	{ code: 'BZ', rank: 7, names: ['belize', 'belice'] },
	{ code: 'CO', rank: 8, names: ['colombia'] },
	{ code: 'VE', rank: 9, names: ['venezuela'] },
	{ code: 'EC', rank: 10, names: ['ecuador'] },
	{ code: 'PE', rank: 11, names: ['peru', 'perú'] },
	{ code: 'BO', rank: 12, names: ['bolivia'] },
	{ code: 'PY', rank: 13, names: ['paraguay'] },
	{ code: 'CL', rank: 14, names: ['chile'] },
	{ code: 'AR', rank: 15, names: ['argentina'] },
	{ code: 'UY', rank: 16, names: ['uruguay'] },
	{ code: 'BR', rank: 17, names: ['brazil', 'brasil'] },
	{
		code: 'DO',
		rank: 18,
		names: ['dominican republic', 'republica dominicana', 'república dominicana']
	}
];

const ELSEWHERE = [
	'egypt',
	'egipto',
	'united states',
	'united kingdom',
	'estados unidos',
	'españa',
	'spain',
	'france',
	'francia',
	'germany',
	'alemania',
	'canada',
	'canadá',
	'australia',
	'india',
	'nigeria',
	'philippines',
	'filipinas',
	'china',
	'japan',
	'japon'
];

/** San Salvador. Distance sort uses this when the browser has no position. */
export const HOME_ORIGIN = { latitude: 13.6929, longitude: -89.2182 };

function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function placeText(task: Task): string {
	const places = [task.pickupLocation, task.dropOffLocation];
	return places
		.flatMap((place) => [
			place?.addressComponents?.country,
			place?.displayName,
			place?.formattedAddress
		])
		.filter((part): part is string => Boolean(part && part.trim()))
		.join(' ');
}

export function taskCountryCode(task: Task): string | null {
	const blob = fold(placeText(task));
	if (!blob) return null;
	for (const country of LATAM) {
		if (country.names.some((name) => blob.includes(fold(name)))) return country.code;
	}
	return null;
}

/** Euros and named places outside Latin America stay off the El Salvador board. */
export function mentionsForeignListing(parts: Array<string | null | undefined>): boolean {
	const text = fold(parts.filter((part) => part && part.trim()).join(' '));
	if (!text) return false;
	if (/\beuros?\b/.test(text) || text.includes('€')) return true;
	return ELSEWHERE.some((name) => text.includes(fold(name)));
}

export function isHomeRegionTask(task: Task): boolean {
	if (mentionsForeignListing([task.title, task.description])) return false;
	if (taskCountryCode(task)) return true;
	const blob = fold(placeText(task));
	if (!blob) return true;
	if (ELSEWHERE.some((name) => blob.includes(fold(name)))) return false;
	return false;
}

export function isZeroPricedTask(task: Task): boolean {
	const amount = task.budget?.amount;
	return typeof amount === 'number' && amount <= 0;
}

function sameText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Keep the newest copy when one person posted the same title and description twice. */
export function dedupeIdenticalTasks(tasks: Task[]): Task[] {
	const kept = new Map<string, Task>();
	for (const task of tasks) {
		const key = `${task.npub}|${sameText(task.title)}|${sameText(task.description)}`;
		const existing = kept.get(key);
		if (!existing || (task.createdAt ?? 0) >= (existing.createdAt ?? 0)) kept.set(key, task);
	}
	return [...kept.values()];
}

function coordinates(task: Task): { latitude: number; longitude: number } | null {
	const place = task.pickupLocation ?? task.dropOffLocation;
	const latitude = place?.latitude;
	const longitude = place?.longitude;
	if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude === 0 && longitude === 0) return null;
	return { latitude, longitude };
}

function distanceKm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number }
): number {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const earth = 6371;
	const dLat = radians(to.latitude - from.latitude);
	const dLon = radians(to.longitude - from.longitude);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
	return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function countryRank(task: Task): number {
	const code = taskCountryCode(task);
	return LATAM.find((country) => country.code === code)?.rank ?? 100;
}

export function prepareBrowseTasks(
	tasks: Task[],
	options: { allCountries: boolean; origin?: { latitude: number; longitude: number } }
): Task[] {
	const origin = options.origin ?? HOME_ORIGIN;
	const visible = dedupeIdenticalTasks(tasks.filter((task) => !isZeroPricedTask(task))).filter(
		(task) => options.allCountries || isHomeRegionTask(task)
	);
	return visible.sort((left, right) => {
		const leftDistance = coordinates(left);
		const rightDistance = coordinates(right);
		if (leftDistance && rightDistance) {
			const gap = distanceKm(origin, leftDistance) - distanceKm(origin, rightDistance);
			if (gap !== 0) return gap;
		} else if (leftDistance) return -1;
		else if (rightDistance) return 1;
		const rank = countryRank(left) - countryRank(right);
		if (rank !== 0) return rank;
		return (right.createdAt ?? 0) - (left.createdAt ?? 0);
	});
}
