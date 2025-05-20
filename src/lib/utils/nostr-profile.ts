import type { NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';

// Initialize Nostr pool
const pool = new SimplePool();

/**
 * Fetches a user's profile metadata from Nostr
 * @param pubkey User's public key
 * @returns The profile metadata event or null if not found
 */
export async function getNostrProfileMetadata(pubkey: string): Promise<NostrEvent | null> {
	try {
		const events = await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [0],
			authors: [pubkey]
		}]);

		return events[0] || null;
	} catch (err) {
		console.error('Failed to fetch Nostr profile:', err);
		return null;
	}
}

/**
 * Fetches a user's skills from Nostr
 * @param pubkey User's public key
 * @returns Array of skill events
 */
export async function getNostrSkills(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [30000],
			authors: [pubkey],
			'#t': ['skill']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr skills:', err);
		return [];
	}
}

/**
 * Fetches a user's portfolio items from Nostr
 * @param pubkey User's public key
 * @returns Array of portfolio events
 */
export async function getNostrPortfolio(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [30001],
			authors: [pubkey],
			'#t': ['portfolio']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr portfolio:', err);
		return [];
	}
}

/**
 * Fetches a user's profile images from Nostr
 * @param pubkey User's public key
 * @returns Array of image events
 */
export async function getNostrProfileImages(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['profile']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr profile images:', err);
		return [];
	}
}

/**
 * Fetches a user's portfolio images from Nostr
 * @param pubkey User's public key
 * @returns Array of image events
 */
export async function getNostrPortfolioImages(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['portfolio']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr portfolio images:', err);
		return [];
	}
}

/**
 * Fetches a user's certifications from Nostr
 * @param pubkey User's public key
 * @returns Array of certification events
 */
export async function getNostrCertifications(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['certification']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr certifications:', err);
		return [];
	}
}

/**
 * Fetches all profile-related events for a user from Nostr
 * @param pubkey User's public key
 * @returns Object containing all profile-related events
 */
export async function getNostrProfileData(pubkey: string) {
	try {
		const [metadata, skills, portfolio, profileImages, portfolioImages, certifications] = await Promise.all([
			getNostrProfileMetadata(pubkey),
			getNostrSkills(pubkey),
			getNostrPortfolio(pubkey),
			getNostrProfileImages(pubkey),
			getNostrPortfolioImages(pubkey),
			getNostrCertifications(pubkey)
		]);

		return {
			metadata,
			skills,
			portfolio,
			profileImages,
			portfolioImages,
			certifications
		};
	} catch (err) {
		console.error('Failed to fetch Nostr profile data:', err);
		return {
			metadata: null,
			skills: [],
			portfolio: [],
			profileImages: [],
			portfolioImages: [],
			certifications: []
		};
	}
}

// Cleanup function to close pool
export function cleanupNostrPool() {
	pool.close([PUBLIC_NOSTR_RELAY_URL]);
} 