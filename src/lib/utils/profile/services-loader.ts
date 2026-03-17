import type { Service } from '$lib/types/service.d';
import { findProfileServicesByAuthor } from '$lib/nostr/findProfileServices';
import { getNpub } from '$lib/utils/nostrKeys';

export interface CurrentProfileServicesResult {
	services: Service[];
	error: string | null;
}

export async function loadCurrentProfileServices(): Promise<CurrentProfileServicesResult> {
	const currentUserPubkey = await getNpub();
	if (!currentUserPubkey) {
		return {
			services: [],
			error: null
		};
	}

	try {
		return {
			services: await findProfileServicesByAuthor(currentUserPubkey, { limit: 12 }),
			error: null
		};
	} catch (error) {
		console.error('Failed to load profile services:', error);
		return {
			services: [],
			error: 'Failed to load profile services'
		};
	}
}
