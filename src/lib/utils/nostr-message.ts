import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import { nip19 } from 'nostr-tools';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { bytesToHex } from '@noble/hashes/utils';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { profileCache } from '$lib/utils/profile-cache';
import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
import { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';
import type { NostrProfileImage, NostrReview, NostrSkill, SkillCertification, TimeSlot, ProfileTranslations } from '$lib/types/profile';

// --- Relay Configuration ---
const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

/**
 * Get the centralized pool instance from appStore
 * This ensures we use a single pool across the entire application
 */
function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}
	return pool;
}

// --- Batch Profile Fetching ---
async function fetchProfilesBatch(
	pubkeys: string[]
): Promise<Map<string, { name?: string; picture?: string }>> {
	if (pubkeys.length === 0) return new Map();

	const pool = getPool();
	const filter: Filter = {
		kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES],
		authors: pubkeys,
		limit: pubkeys.length * 3
	};

	const events = await pool.querySync(DEFAULT_RELAYS, filter);

	const profileMap = new Map<string, { name?: string; picture?: string }>();

	// Sort events by created_at (newest first) to get the latest profile info
	const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

	for (const event of sortedEvents) {
		// Skip if we already have a profile for this pubkey (since we sorted by newest first)
		const existingProfile = profileMap.get(event.pubkey);

		if (event.kind === KINDS.PROFILE_METADATA && event.content) {
			try {
				const content = JSON.parse(event.content);
				const profileData = {
					name: content.display_name || content.displayName || content.name,
					picture: existingProfile?.picture || content.picture || content.avatar || content.image
				};
				profileMap.set(event.pubkey, profileData);
				await profileCache.cacheProfile(event.pubkey, profileData);
			} catch (e) {
				console.error('Failed to parse profile metadata:', e);
			}
		} else if (event.kind === KINDS.PROFILE_IMAGES && !existingProfile?.picture) {
			const dTag = event.tags.find((t) => t[0] === 'd');
			if (dTag && dTag[1] === 'profile-images') {
				try {
					const images = JSON.parse(event.content);
					if (Array.isArray(images) && images.length > 0) {
						const currentProfile = profileMap.get(event.pubkey) || {};
						const updatedProfile = { ...currentProfile, picture: images[0].url };
						profileMap.set(event.pubkey, updatedProfile);
						await profileCache.cacheProfile(event.pubkey, updatedProfile);
					}
				} catch (e) {
					console.error('Failed to parse profile images:', e);
				}
			}
		} else if (event.kind === KINDS.FILE_METADATA && !existingProfile?.picture) {
			const urlTag = event.tags.find((t) => t[0] === 'url');
			const altTag = event.tags.find((t) => t[0] === 'alt');
			const mTag = event.tags.find((t) => t[0] === 'm');

			if (urlTag && urlTag[1]) {
				const alt = altTag && altTag[1] ? altTag[1].toLowerCase() : '';
				const mime = mTag && mTag[1] ? mTag[1].toLowerCase() : '';

				if (
					alt.includes('profile') ||
					alt.includes('avatar') ||
					mime.startsWith('image/') ||
					urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
				) {
					const currentProfile = profileMap.get(event.pubkey) || {};
					const updatedProfile = { ...currentProfile, picture: urlTag[1] };
					profileMap.set(event.pubkey, updatedProfile);
					await profileCache.cacheProfile(event.pubkey, updatedProfile);
				}
			}
		}
	}

	return profileMap;
}

// --- Internal helpers ---
async function encryptDM(
	plaintext: string,
	recipientNpub: string,
	senderNsec: string
): Promise<string> {
	// Generate 32-byte nonce
	const nonce = crypto.getRandomValues(new Uint8Array(32));

	// Get conversation key
	const conversationKey = await nip44.getConversationKey(senderNsec, recipientNpub);

	// Encrypt with NIP-44
	return nip44.encrypt(plaintext, conversationKey, nonce);
}

async function decryptDM(
	ciphertext: string,
	senderNpub: string,
	recipientNsec: string
): Promise<string> {
	// Get conversation key
	const conversationKey = await nip44.getConversationKey(recipientNsec, senderNpub);

	// Decrypt with NIP-44
	return nip44.decrypt(ciphertext, conversationKey);
}

export async function parseDMEvent(
	event: NostrEvent,
	nsec: string,
	npub: string
): Promise<{ plaintext: string; senderPubkey: string }> {
	if (event.kind !== KINDS.DIRECT_MESSAGES) throw new Error('Not a DM event');

	const senderNpub = event.pubkey;

	let plaintext: string;

	if (senderNpub === npub) {
		// We are the sender, so we need to decrypt using the recipient's pubkey
		const recipientTag = event.tags.find((tag) => tag[0] === 'p');
		if (!recipientTag || !recipientTag[1]) {
			throw new Error('No recipient found in message tags');
		}
		const recipientNpub = recipientTag[1];
		plaintext = await decryptDM(event.content, recipientNpub, nsec);
	} else {
		// We are the recipient, decrypt using the sender's pubkey
		plaintext = await decryptDM(event.content, senderNpub, nsec);
	}

	return { plaintext, senderPubkey: senderNpub };
}

/**
 * Subscribe to profile updates for a specific pubkey
 * Returns an unsubscribe function
 */
export function subscribeToProfileUpdates(
	pubkey: string,
	callback: (profile: { name?: string; picture?: string }) => void,
	relays: string[] = DEFAULT_RELAYS
): () => void {
	let sub: SubCloser | null = null;

	const setupSubscription = async () => {
		const pool = getPool();

		try {
			// Convert pubkey to hex format if it's in npub format
			const pubkeyHex = pubkey.startsWith('npub') ? (nip19.decode(pubkey).data as string) : pubkey;

			const filter: Filter = {
				kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES], // Profile metadata, file metadata, and profile images
				authors: [pubkeyHex]
			};
			let profile: { name?: string; picture?: string } = {};

			sub = pool.subscribe(relays, filter, {
				onevent: async (event: NostrEvent) => {
					// Create a new profile object for each update to ensure reactivity
					const updatedProfile: { name?: string; picture?: string } = { ...profile };

					if (event.kind === KINDS.PROFILE_METADATA && event.content) {
						try {
							const content = JSON.parse(event.content);
							// Map displayName to name if name is not available
							updatedProfile.name = content.name || content.displayName;
							updatedProfile.picture = content.picture || content.avatar || content.image;
						} catch (e) {
							console.error('❌ Failed to parse profile metadata in subscription:', e);
						}
					} else if (event.kind === KINDS.PROFILE_IMAGES) {
						// Handle kind 30063 (profile images) - same as fetchProfileMetadata
						const dTag = event.tags.find((t) => t[0] === 'd');

						if (dTag && dTag[1] === 'profile-images') {
							try {
								const images = JSON.parse(event.content);

								if (Array.isArray(images) && images.length > 0) {
									// Use the first image as the primary profile picture
									updatedProfile.picture = images[0].url;
								}
							} catch (e) {
								console.error('❌ Failed to parse profile images in subscription:', e);
							}
						}
					} else if (event.kind === KINDS.FILE_METADATA) {
						const urlTag = event.tags.find((t) => t[0] === 'url');
						const altTag = event.tags.find((t) => t[0] === 'alt');
						const mTag = event.tags.find((t) => t[0] === 'm');

						if (urlTag && urlTag[1]) {
							const alt = altTag && altTag[1] ? altTag[1].toLowerCase() : '';
							const mime = mTag && mTag[1] ? mTag[1].toLowerCase() : '';

							if (
								alt.includes('profile') ||
								alt.includes('avatar') ||
								mime.startsWith('image/') ||
								urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
							) {
								updatedProfile.picture = urlTag[1];
							}
						}
					}

					// Update the profile reference
					profile = updatedProfile;

					// Update cache
					await profileCache.cacheProfile(pubkeyHex, profile);

					// Notify callback with debug info
					callback(profile);
				}
			});
		} catch (error) {
			console.error('❌ Failed to setup profile subscription:', error);
		}
	};

	// Start subscription
	setupSubscription().catch(console.error);

	// Return cleanup function
	return () => {
		if (sub) {
			sub.close();
		}
	};
}

export async function fetchProfileMetadata(npub: string): Promise<{ name?: string; picture?: string; createdAt?: string }> {
	try {
		// First check cache (using original format for cache key)
		const cachedProfile = await profileCache.getProfile(npub);
		if (cachedProfile) {
			return cachedProfile;
		}

		// Convert npub to hex if needed (Nostr filters require hex pubkeys)
		let hexPubkey = npub;
		if (npub.startsWith('npub')) {
			try {
				const decoded = nip19.decode(npub);
				if (decoded.type === 'npub') {
					hexPubkey = decoded.data as string;
				}
			} catch (e) {
				console.error('Failed to decode npub:', e);
				// If decoding fails, try using as-is (might already be hex)
			}
		}

		// If not in cache, fetch from relays
		const pool = getPool();
		const filter: Filter = {
			kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES, KINDS.NIP_65_RELAY_LIST],
			authors: [hexPubkey],
			limit: 20
		};

		const events = await pool.querySync(DEFAULT_RELAYS, filter);

		let name: string | undefined = undefined;
		let picture: string | undefined = undefined;
		let createdAt: string | undefined = undefined;

		// Sort events by created_at (newest first) to get the latest profile info
		const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

		for (const event of sortedEvents) {
			if (event.kind === KINDS.PROFILE_METADATA && event.content) {
				try {
					const content = JSON.parse(event.content);

					// Map displayName to name if name is not available
					name = content?.display_name || content?.displayName || content?.name;

					if (event.created_at) {
						createdAt = formatStandardDateShort(new Date(event.created_at * 1000));
					}

					if (content.picture && !picture) {
						picture = content.picture;
					}

					// Also check for other common picture fields
					if (!picture && content.avatar) {
						picture = content.avatar;
					}

					if (!picture && content.image) {
						picture = content.image;
					}
				} catch (e) {
					console.error('❌ Failed to parse profile metadata:', e);
				}
			} else if (!picture && event.kind === KINDS.FILE_METADATA) {
				const urlTag = event.tags.find((t) => t[0] === 'url');
				const altTag = event.tags.find((t) => t[0] === 'alt');
				const mTag = event.tags.find((t) => t[0] === 'm'); // MIME type

				if (urlTag && urlTag[1]) {
					// Check if this is likely a profile picture
					const alt = altTag && altTag[1] ? altTag[1].toLowerCase() : '';
					const mime = mTag && mTag[1] ? mTag[1].toLowerCase() : '';

					if (
						alt.includes('profile') ||
						alt.includes('avatar') ||
						mime.startsWith('image/') ||
						urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
					) {
						picture = urlTag[1];
					}
				}
			} else if (!picture && event.kind === KINDS.PROFILE_IMAGES) {
				// Handle kind 30063 (profile images) - same technique as profile page
				const dTag = event.tags.find((t) => t[0] === 'd');

				// Check if this is the profile-images event (same as profile page)
				if (dTag && dTag[1] === 'profile-images' && !picture) {
					try {
						const images = JSON.parse(event.content);

						if (Array.isArray(images) && images.length > 0) {
							// Use the first image as the primary profile picture (same as profile page)
							picture = images[0].url;
						}
					} catch (e) {
						console.error('❌ Failed to parse profile images content:', e);
					}
				}
			}
		}

		const profile = { name, picture, createdAt };

		// Cache the result (even if empty, to avoid repeated failed requests)
		await profileCache.cacheProfile(npub, profile);

		return profile;
	} catch (error) {
		console.error('💥 Failed to fetch profile metadata for', npub, ':', error);
		// Cache empty result to avoid repeated failed requests
		await profileCache.cacheProfile(npub, {});
		return {};
	}
}

/**
 * Fetch comprehensive profile data for other users (similar to profileStore but for external users)
 */
export async function fetchComprehensiveProfile(pubkey: string): Promise<{
	name?: string;
	about?: string;
	picture?: string;
	pictures?: Array<{ url: string; type: string; alt: string; key?: string; isPrimary?: boolean }>;
	website?: string;
	professionalTitle?: string;
	translations?: ProfileTranslations;
	skills?: Array<string | {
		name: string;
		level: number;
		verificationStatus?: string;
		endorsements?: number;
		certifications?: SkillCertification[];
	}>;
	portfolio?: Array<{
		id: string;
		title: string;
		description: string;
		images: NostrProfileImage[];
		completionDate: string;
		skills: string[];
		link?: string;
	}>;
	availability?: {
		timeSlots: TimeSlot[];
		timezone: string;
		noticeHours: number;
		maxBookingsPerDay: number;
		breakBetweenBookings: number;
	};
	reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
	certifications?: Array<{
		name: string;
		issuer: string;
		date: string;
		verified: boolean;
		fileUrl: string;
	}>;
	createdAt?: string;
}> {
	try {
		// Ensure pubkey is in hex format (not npub)
		let hexPubkey = pubkey;
		if (pubkey.startsWith('npub')) {
			try {
				const decoded = nip19.decode(pubkey);
				if (decoded.type === 'npub') {
					hexPubkey = decoded.data as string;
				}
			} catch (e) {
				console.error('Failed to decode npub:', e);
				throw new Error('Invalid npub format');
			}
		}

		// Fetch all profile-related events
		const pool = getPool();
		const filter: Filter = {
			kinds: [
				KINDS.PROFILE_METADATA, // Metadata
				KINDS.FILE_METADATA, // Certifications
				KINDS.PROFILE_IMAGES, // Profile images
				KINDS.NIP_65_RELAY_LIST, // Relay list
				KINDS.PROFILE_SKILLS, // Skills (30000)
				KINDS.PROFILE_PORTFOLIO, // Portfolio (30001)
				KINDS.PROFILE_AVAILABILITY, // Availability (30002)
				KINDS.PROFILE_REVIEWS // Reviews (30004)
			],
			authors: [hexPubkey],
			limit: 50
		};

		const events = await pool.querySync(DEFAULT_RELAYS, filter);

		// Initialize profile data
		const profileData: any = {
			name: '',
			display_name: '',
			about: '',
			picture: '',
			pictures: [],
			website: '',
			professionalTitle: '',
			location: '',
			skills: [],
			portfolio: [],
			availability: {
				timeSlots: [],
				timezone: '',
				noticeHours: 24,
				maxBookingsPerDay: 5,
				breakBetweenBookings: 60
			},
			reviews: [],
			certifications: []
		};

		// Sort events by created_at (newest first)
		const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

		for (const event of sortedEvents) {
			try {
				const content = JSON.parse(event.content);

				switch (event.kind) {
					case KINDS.PROFILE_METADATA: // Metadata
						if (content.display_name || content.name) {
							profileData.name = content.display_name || content.name;
						}
						if (content.about) {
							profileData.about = content.about;
						}
						if (content.website) {
							profileData.website = content.website;
						}
						if (content.professionalTitle) {
							profileData.professionalTitle = content.professionalTitle;
						}
						if (content.translations) {
							profileData.translations = content.translations;
						}
						// PROFILE_METADATA has priority over PROFILE_IMAGES
						if (content.picture) {
							profileData.picture = content.picture;
						}
						if (content.location) {
							// Location can be a string (city, country or city, state) or an object
							if (typeof content.location === 'string') {
								profileData.location = content.location;
							} else if (content.location.city && content.location.country) {
								profileData.location = `${content.location.city}, ${content.location.country}`;
							} else if (content.location.city && content.location.state) {
								profileData.location = `${content.location.city}, ${content.location.state}`;
							}
						}
						if (event.created_at) {
							profileData.createdAt = formatStandardDateShort(new Date(event.created_at * 1000));
						}
						break;

					case KINDS.PROFILE_IMAGES: { // Profile images
						const dTag = event.tags.find((t) => t[0] === 'd');
						if (dTag && dTag[1] === 'profile-images') {
							if (Array.isArray(content)) {
								profileData.pictures = content.map((img: NostrProfileImage) => ({
									url: img.url,
									type: img.type || 'image/jpeg',
									alt: img.alt || '',
									key: img.key,
									isPrimary: img.isPrimary || false
								}));
								// Only use first image as primary picture if PROFILE_METADATA didn't provide one (PROFILE_METADATA has priority)
								if (content.length > 0 && !profileData.picture) {
									profileData.picture = content[0].url;
								}
							}
						}
						break;
					}

					case KINDS.PROFILE_SKILLS: // Skills (30000)
						if (Array.isArray(content)) {
							profileData.skills = content.map((skill: NostrSkill & { translations?: any; id?: string }) => {
								// Handle both string format and object format
								if (typeof skill === 'string') {
									return skill;
								} else {
									return {
										name: skill.name,
										level: skill.level,
										verificationStatus: skill.verificationStatus,
										endorsements: skill.endorsements,
										certifications: skill.certifications || [],
										translations: skill.translations,
										id: skill.id
									};
								}
							});
						}
						break;

					case KINDS.PROFILE_PORTFOLIO: // Portfolio (30001)
						profileData.portfolio.push({
							id: event.id,
							title: content.title,
							description: content.description,
							images: content.images,
							completionDate: content.completionDate,
							skills: content.skills,
							link: content.link,
							translations: content.translations
						});
						break;

					case KINDS.PROFILE_AVAILABILITY: // Availability (30002)
						profileData.availability = {
							timeSlots: content.timeSlots || [],
							timezone: content.timezone || '',
							noticeHours: content.noticeHours || 24,
							maxBookingsPerDay: content.maxBookingsPerDay || 5,
							breakBetweenBookings: content.breakBetweenBookings || 60
						};
						break;

					case KINDS.PROFILE_REVIEWS: // Reviews (30004)
						if (Array.isArray(content)) {
							profileData.reviews = content.map((review: NostrReview) => ({
								id: review.id,
								from: review.from,
								rating: review.rating,
								text: review.text,
								date: review.date
							}));
						}
						break;

					case KINDS.FILE_METADATA: // Certifications
						profileData.certifications.push({
							name: content.name,
							issuer: content.issuer,
							date: content.date,
							verified: content.verified,
							fileUrl: content.fileUrl
						});
						break;
				}
			} catch (e) {
				console.error('Failed to parse event content:', e);
			}
		}

		return profileData;
	} catch (error) {
		console.error('💥 Failed to fetch comprehensive profile for', pubkey, ':', error);
		// Return a more informative error structure
		throw error;
	}
}

// --- High-level API ---

/**
 * Send a direct message to a public key
 */
export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	threadRootId?: string,
	additionalTags?: string[][]
): Promise<void> {
	try {
		const { nsec } = await getNostrKeyPair();
		const senderPrivkey = bytesToHex(nsec);

		// Convert recipient pubkey to hex if it's in npub format
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		const ciphertext = await encryptDM(message, recipientPubkeyHex, senderPrivkey);

		// Use TAG_PATTERNS for direct messages
		const tags: string[][] = [...TAG_PATTERNS.directMessage(recipientPubkeyHex)];

		// Add thread root tag if provided
		if (threadRootId) {
			tags.push(['e', threadRootId, '', 'root']);
		}

		// Add any additional custom tags
		if (additionalTags && additionalTags.length > 0) {
			tags.push(...additionalTags);
		}

		// Create event metadata for signing
		const eventMetadata: Partial<NostrEvent> = {
			kind: KINDS.DIRECT_MESSAGES,
			content: ciphertext,
			tags,
			created_at: Math.floor(Date.now() / 1000)
		};

		// Sign the event
		const signedEvent = await getSignedEvent(eventMetadata);

		const results = await publishToMultipleRelays(signedEvent);

		// Check if at least one relay succeeded
		const successfulRelays = results.filter((r) => r.success);
		if (successfulRelays.length === 0) {
			const errors = results.map((r) => `${r.relay}: ${r.error}`).join(', ');
			throw new Error(`Failed to publish to any relay: ${errors}`);
		}

		// Log any failed relays for monitoring
		const failedRelays = results.filter((r) => !r.success);
		if (failedRelays.length > 0) {
			console.warn('Some relays failed:', failedRelays);
		}
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to send message';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Listen for incoming DMs for the current user
 * Uses the centralized pool to subscribe to all relays simultaneously
 * Returns an unsubscribe function
 * 
 * Note: pool.subscribe only accepts ONE filter at a time, so we need TWO separate subscriptions:
 * Subscription 1: Messages TO the user (#p tag contains user's pubkey)
 * Subscription 2: Messages FROM the user (authors contains user's pubkey)
 * 
 * @arg npub - The public key of the user to listen for messages from
 * @arg nsec - The private key of the user to listen for messages from
 * @arg callback - The callback function to call when a message is received
 */
export function listenForIncomingMessages(
	npub: string, nsec: Uint8Array,
	callback: (msg: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void
): () => void {
	let isUnsubscribed = false;
	let subIncoming: SubCloser | null = null;
	let subOutgoing: SubCloser | null = null;

	const setupConnection = async () => {
		if (isUnsubscribed) return;

		try {
			const pool = getPool();
			const privkey = bytesToHex(nsec);

			const eventHandler = async (event: NostrEvent) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey, npub);
					callback({ plaintext, senderPubkey, event });
				} catch (err: unknown) {
					// Silently ignore decryption errors for messages not meant for us
					// or that we can't decrypt (e.g., corrupted data, wrong encryption)
					if (err instanceof Error && !err.message.includes('Invalid MAC')) {
						console.error('Failed to decrypt message:', err);
					}
				}
			};

			// Subscribe to messages TO the user (incoming)
			subIncoming = pool.subscribe(
				DEFAULT_RELAYS,
				{
					kinds: [KINDS.DIRECT_MESSAGES],
					...TAG_PATTERNS.directMessage(npub),
					since: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)  // Last 7 days
				},
				{
					onevent: eventHandler,
				}
			);

			// Subscribe to messages FROM the user (outgoing)
			subOutgoing = pool.subscribe(
				DEFAULT_RELAYS,
				{
					kinds: [KINDS.DIRECT_MESSAGES],
					authors: [npub],
					since: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)  // Last 7 days
				},
				{
					onevent: eventHandler,
				}
			);
		} catch (error) {
			console.error('Failed to setup message listener:', error);
			// Pool will handle reconnection automatically
		}
	};

	// Initial setup
	setupConnection();

	// Return unsubscribe function
	return () => {
		isUnsubscribed = true;

		if (subIncoming) {
			try {
				subIncoming.close();
			} catch (err) {
				console.error('Error closing incoming subscription:', err);
			}
			subIncoming = null;
		}

		if (subOutgoing) {
			try {
				subOutgoing.close();
			} catch (err) {
				console.error('Error closing outgoing subscription:', err);
			}
			subOutgoing = null;
		}
	};
}

/**
 * Get paginated DM history with a specific user
 */
export async function getMessageHistory(
	withPubkey: string,
	options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
		const withPubkeyHex = withPubkey.startsWith('npub')
			? (nip19.decode(withPubkey).data as string)
			: withPubkey;

		const pool = getPool();

		const filter: Filter = {
			kinds: [4],
			authors: [withPubkeyHex, pubkeyHex],
			'#p': [withPubkeyHex, pubkeyHex],
			...TAG_FILTERS.byMessageType('direct-message'),
			limit: options?.limit || 25,
			...(options?.since ? { since: options.since } : {}),
			...(options?.until ? { until: options.until } : {})
		};

		const events = await pool.querySync(DEFAULT_RELAYS, filter);

		const decrypted = await Promise.all(
			events.map(async (event) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey, npub);
					return { plaintext, senderPubkey, event };
				} catch (error) {
					if (error instanceof Error && !error.message.includes('Invalid MAC')) {
						console.error('Failed to decrypt event:', error);
					}
					return null;
				}
			})
		);

		return decrypted.filter(Boolean) as {
			plaintext: string;
			senderPubkey: string;
			event: NostrEvent;
		}[];
	} catch (err: unknown) {
		console.error('💥 getMessageHistory error:', err);
		const errorMessage = (err as Error)?.message || 'Failed to fetch message history';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Get all messages in a thread (by root event id)
 */
export async function getThreadMessages(
	threadRootEventId: string,
	options?: { limit?: number; since?: number; until?: number }
): Promise<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		const pool = getPool();

		const filter: Filter = {
			kinds: [4],
			'#e': [threadRootEventId],
			limit: options?.limit || 50,
			...(options?.since ? { since: options.since } : {}),
			...(options?.until ? { until: options.until } : {})
		};

		const events = await pool.querySync(DEFAULT_RELAYS, filter);

		const decrypted = await Promise.all(
			events.map(async (event) => {
				try {
					const { plaintext, senderPubkey } = await parseDMEvent(event, privkey, npub);
					return { plaintext, senderPubkey, event };
				} catch {
					return null;
				}
			})
		);

		return decrypted.filter(Boolean) as {
			plaintext: string;
			senderPubkey: string;
			event: NostrEvent;
		}[];
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to fetch thread messages';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Get all unique people (pubkeys) you have messaged with, along with the most recent event and their profile (name, picture)
 */
export async function getMessagedPeople(): Promise<
	{ pubkey: string; lastEvent: NostrEvent; profile: { name?: string; picture?: string } }[]
> {
	try {
		const npub = await getNpub();
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const pool = getPool();

		// Fetch messages in parallel
		const [sentEvents, receivedEvents] = await Promise.all([
			pool.querySync(DEFAULT_RELAYS, {
				kinds: [4],
				authors: [pubkeyHex],
				...TAG_FILTERS.byMessageType('direct-message'),
				limit: 1000
			}),
			pool.querySync(DEFAULT_RELAYS, {
				kinds: [4],
				'#p': [pubkeyHex],
				...TAG_FILTERS.byMessageType('direct-message'),
				limit: 1000
			})
		]);

		// Build conversation map (NO DECRYPTION)
		const peopleMap = new Map<string, NostrEvent>();
		for (const event of [...sentEvents, ...receivedEvents]) {
			const otherPubkey =
				event.pubkey === pubkeyHex ? event.tags.find((t) => t[0] === 'p')?.[1] : event.pubkey;

			if (!otherPubkey || otherPubkey === pubkeyHex) continue;

			const existing = peopleMap.get(otherPubkey);
			if (!existing || event.created_at > existing.created_at) {
				peopleMap.set(otherPubkey, event);
			}
		}

		// Batch fetch ALL profiles in ONE query
		const allPubkeys = Array.from(peopleMap.keys());
		const profiles = await fetchProfilesBatch(allPubkeys);

		// Return with encrypted content (decrypt on demand)
		return Array.from(peopleMap.entries()).map(([pubkey, lastEvent]) => ({
			pubkey,
			lastEvent, // Keep encrypted
			profile: profiles.get(pubkey) || { name: pubkey.slice(0, 4) + '...' + pubkey.slice(-4) }
		}));
	} catch (err: unknown) {
		const errorMessage = (err as Error)?.message || 'Failed to fetch messaged people';
		appStore.showErrorToast(errorMessage);
		throw err;
	}
}

/**
 * Check if a message is a bid
 */
export function isBidMessage(message: { plaintext: string }): boolean {
	try {
		const parsedContent = JSON.parse(message.plaintext);
		return parsedContent.type === 'bid';
	} catch {
		return false;
	}
}

/**
 * Check if a message is a normal message (not a bid)
 */
export function isNormalMessage(message: { plaintext: string }): boolean {
	return !isBidMessage(message);
}
