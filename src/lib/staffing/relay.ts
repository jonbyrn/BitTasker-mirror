import type { Event } from 'nostr-tools';
import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import KINDS from '$lib/utils/constants/kinds';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { sanitizeRelayUrls } from '$lib/utils/relayUrls';
import { jobBody, newerByTag, parseJobEvent, parseSeatEvent, seatBody } from './events';
import type { StaffJob, StaffSeat } from './types';

export function staffRelayUrls(): string[] {
	const listing = listingRelayUrls();
	if (listing.length > 0) return listing;
	return sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

async function readKind(kind: number): Promise<Event[]> {
	const relays = staffRelayUrls();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	try {
		return await queryRelayEvents(relays, { kinds: [kind], limit: 200 });
	} catch {
		return [];
	}
}

export async function loadStaffBoard(): Promise<{ jobs: StaffJob[]; seats: StaffSeat[] }> {
	const [jobEvents, seatEvents] = await Promise.all([
		readKind(KINDS.STAFF_JOB),
		readKind(KINDS.STAFF_SEAT)
	]);
	const jobs = newerByTag(jobEvents)
		.map(parseJobEvent)
		.filter((job): job is StaffJob => job !== null);
	const seats = newerByTag(seatEvents)
		.map(parseSeatEvent)
		.filter((seat): seat is StaffSeat => seat !== null);
	return { jobs, seats };
}

async function publishBody(
	kind: number,
	id: string,
	content: string,
	tags: string[][]
): Promise<void> {
	const relays = staffRelayUrls();
	if (relays.length === 0) throw new Error('publish');
	const event = await getSignedEvent({
		kind,
		content,
		tags: [['d', id], ...tags]
	});
	const results = await publishToMultipleRelays(event, relays);
	if (!results.some((result) => result.success)) throw new Error('publish');
}

export async function saveJob(job: StaffJob): Promise<void> {
	await publishBody(KINDS.STAFF_JOB, job.id, jobBody(job), [
		['t', 'temp-staff'],
		['role', job.role],
		['location', job.location]
	]);
}

export async function saveSeat(seat: StaffSeat): Promise<void> {
	await publishBody(KINDS.STAFF_SEAT, seat.id, seatBody(seat), [
		['e', seat.jobId],
		['p', seat.workerPubkey],
		['p', seat.businessPubkey]
	]);
}
