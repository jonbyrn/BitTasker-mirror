import type { Task } from '$lib/types/task.d';
import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { resolveListingPoint, taskToListingPlace } from '$lib/utils/maps/listing-markers';
import { dedupeListingsByEvent, listingEventKey } from '$lib/utils/listings/publicListings';

/** A place name that is only "remote" does not get a pin. A city still does. */
export function isRemotePlace(location: string | null | undefined): boolean {
	const text = (location ?? '').trim().toLowerCase();
	if (!text) return true;
	return (
		text === 'remote' ||
		text === 'remoto' ||
		text === 'a distancia' ||
		text === 'approximate location'
	);
}

/**
 * Map pin input for a shift. The location string on the event is enough.
 * Remote shifts stay off the map. A named place is geocoded like a task.
 */
export function shiftMapTask(
	id: string,
	title: string,
	location: string,
	coordinates?: { latitude?: number | null; longitude?: number | null }
): Task {
	const remote = isRemotePlace(location);
	const latitude = coordinates?.latitude;
	const longitude = coordinates?.longitude;
	const stored =
		typeof latitude === 'number' &&
		typeof longitude === 'number' &&
		Number.isFinite(latitude) &&
		Number.isFinite(longitude);
	return {
		id,
		title,
		taskType: remote ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
		pickupLocation: remote
			? null
			: {
					displayName: location,
					formattedAddress: location,
					...(stored ? { latitude, longitude } : {})
				},
		dropOffLocation: null
	} as Task;
}

export function shiftHasPin(id: string, title: string, location: string): boolean {
	return resolveListingPoint(taskToListingPlace(shiftMapTask(id, title, location))) !== null;
}

/** Stable {#each} key shared by the card and the pin. */
export function visibleListingKey(listing: { id?: string | null }): string {
	return listingEventKey(listing) || (listing.id ? `id:${listing.id}` : '');
}

export function dedupeVisible<T extends { id?: string | null }>(items: readonly T[]): T[] {
	return dedupeListingsByEvent(items);
}
