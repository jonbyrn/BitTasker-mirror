import type { Location } from '$lib/types/task';
import type { NostrEvent } from 'nostr-tools';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

export async function publishLocation(location: Location): Promise<NostrEvent> {
	const event = await getSignedEvent({
		kind: KINDS.PROFILE_LOCATION,
		tags: [
			['d', 'location'],
			['client', 'bittasker']
		],
		content: JSON.stringify(location)
	});
	const results = await publishToMultipleRelays(event);
	if (!results.some((result) => result.success)) throw new Error('Location publish failed');
	return event;
}

export async function getLatestLocation(): Promise<Location | null> {
	return null;
}
