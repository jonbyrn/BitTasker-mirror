import type { NostrEvent } from 'nostr-tools';
import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
import KINDS from '$lib/utils/constants/kinds';
import type {
	NostrProfileImage,
	NostrProfileLanguage,
	NostrReview,
	NostrSkill,
	TimeSlot,
	ProfileTranslations
} from '$lib/types/profile';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import { resolveDisplayNameFromProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';

export type ComprehensiveProfile = {
	name?: string;
	about?: string;
	picture?: string;
	pictures?: NostrProfileImage[];
	website?: string;
	professionalTitle?: string;
	location?: string;
	languages?: NostrProfileLanguage[];
	translations?: ProfileTranslations;
	skills?: Array<string | NostrSkill>;
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
	videoIntro?: {
		uid: string;
		url: string;
		thumbnailUrl: string;
		duration: number;
		size: number;
	};
};

type ComprehensiveProfileData = {
	name: string;
	about: string;
	picture: string;
	pictures: NostrProfileImage[];
	website: string;
	professionalTitle: string;
	location: string;
	languages: NostrProfileLanguage[];
	translations?: ProfileTranslations;
	skills: NonNullable<ComprehensiveProfile['skills']>;
	portfolio: NonNullable<ComprehensiveProfile['portfolio']>;
	availability: NonNullable<ComprehensiveProfile['availability']>;
	reviews: NonNullable<ComprehensiveProfile['reviews']>;
	certifications: NonNullable<ComprehensiveProfile['certifications']>;
	createdAt?: string;
	videoIntro?: ComprehensiveProfile['videoIntro'];
};

function comprehensiveRelays(): string[] {
	const relays = profileRelays();
	if (relays.length > 0) {
		return relays;
	}
	return [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean) as string[];
}

async function fetchComprehensiveProfileEvents(hexPubkey: string): Promise<NostrEvent[]> {
	const relays = comprehensiveRelays();
	if (!hexPubkey || relays.length === 0) {
		return [];
	}

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const ndkEvents = await ndk.fetchEvents(
		{
			kinds: [
				KINDS.PROFILE_METADATA,
				KINDS.FILE_METADATA,
				KINDS.PROFILE_IMAGES,
				KINDS.NIP_65_RELAY_LIST,
				KINDS.PROFILE_SKILLS,
				KINDS.PROFILE_PORTFOLIO,
				KINDS.PROFILE_AVAILABILITY,
				KINDS.PROFILE_REVIEWS,
				KINDS.VIDEO
			],
			authors: [hexPubkey],
			limit: 50
		},
		{ closeOnEose: true, relaySet }
	);

	const events: NostrEvent[] = [];
	for (const ev of ndkEvents) {
		events.push((await ev.toNostrEvent()) as NostrEvent);
	}
	return events;
}

function parseComprehensiveProfileEvents(events: NostrEvent[]): ComprehensiveProfileData {
	const profileData: ComprehensiveProfileData = {
		name: '',
		about: '',
		picture: '',
		pictures: [],
		website: '',
		professionalTitle: '',
		location: '',
		languages: [],
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
		certifications: [],
		videoIntro: undefined
	};

	const sortedEvents = [...events].sort((a, b) => b.created_at - a.created_at);

	for (const event of sortedEvents) {
		try {
			const content = JSON.parse(event.content) as Record<string, unknown>;

			switch (event.kind) {
				case KINDS.PROFILE_METADATA: {
					const displayName = resolveDisplayNameFromProfileMetadataContent(content);
					if (displayName) {
						profileData.name = displayName;
					}
					if (typeof content.about === 'string') {
						profileData.about = content.about;
					}
					if (typeof content.website === 'string') {
						profileData.website = content.website;
					}
					if (typeof content.professionalTitle === 'string') {
						profileData.professionalTitle = content.professionalTitle;
					}
					if (content.translations) {
						profileData.translations = content.translations as ProfileTranslations;
					}
					if (typeof content.picture === 'string') {
						profileData.picture = content.picture;
					}
					const location = content.location;
					if (typeof location === 'string') {
						profileData.location = location;
					} else if (location && typeof location === 'object') {
						const loc = location as { city?: string; country?: string; state?: string };
						if (loc.city && loc.country) {
							profileData.location = `${loc.city}, ${loc.country}`;
						} else if (loc.city && loc.state) {
							profileData.location = `${loc.city}, ${loc.state}`;
						}
					}
					if (event.created_at) {
						profileData.createdAt = formatStandardDateShort(new Date(event.created_at * 1000));
					}
					if (Array.isArray(content.languages)) {
						profileData.languages = content.languages.map(
							(lang: { code?: string; proficiency?: string } | string) => {
								if (typeof lang === 'string') {
									return { code: lang, proficiency: 'fluent' };
								}
								return {
									code: lang.code || '',
									proficiency: lang.proficiency || 'fluent'
								};
							}
						);
					}
					break;
				}

				case KINDS.PROFILE_IMAGES: {
					const dTag = event.tags.find((t) => t[0] === 'd');
					if (dTag?.[1] === 'profile-images' && Array.isArray(content)) {
						profileData.pictures = content.map((img: NostrProfileImage) => ({
							url: img.url,
							type: img.type || 'image/jpeg',
							alt: img.alt || '',
							key: img.key,
							isPrimary: img.isPrimary || false
						}));
						if (content.length > 0 && !profileData.picture) {
							profileData.picture = content[0].url;
						}
					}
					break;
				}

				case KINDS.PROFILE_SKILLS:
					if (Array.isArray(content)) {
						profileData.skills = content.map((skill: unknown) => {
							if (typeof skill === 'string') {
								return skill;
							}
							if (!skill || typeof skill !== 'object') {
								return '';
							}
							const entry = skill as NostrSkill & {
								translations?: Record<string, unknown>;
								id?: string;
							};
							return {
								name: entry.name,
								level: entry.level,
								verificationStatus: entry.verificationStatus,
								endorsements: entry.endorsements,
								certifications: entry.certifications ?? []
							};
						});
					}
					break;

				case KINDS.PROFILE_PORTFOLIO:
					profileData.portfolio.push({
						id: event.id,
						title: String(content.title ?? ''),
						description: String(content.description ?? ''),
						images: (content.images as NostrProfileImage[]) ?? [],
						completionDate: String(content.completionDate ?? ''),
						skills: (content.skills as string[]) ?? [],
						link: typeof content.link === 'string' ? content.link : undefined
					});
					break;

				case KINDS.PROFILE_AVAILABILITY:
					profileData.availability = {
						timeSlots: (content.timeSlots as TimeSlot[]) || [],
						timezone: String(content.timezone ?? ''),
						noticeHours: Number(content.noticeHours ?? 24),
						maxBookingsPerDay: Number(content.maxBookingsPerDay ?? 5),
						breakBetweenBookings: Number(content.breakBetweenBookings ?? 60)
					};
					break;

				case KINDS.PROFILE_REVIEWS:
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

				case KINDS.FILE_METADATA:
					profileData.certifications.push({
						name: String(content.name ?? ''),
						issuer: String(content.issuer ?? ''),
						date: String(content.date ?? ''),
						verified: Boolean(content.verified),
						fileUrl: String(content.fileUrl ?? '')
					});
					break;

				case KINDS.VIDEO: {
					const hasProfileVideoTag = event.tags.some(
						(t) => t[0] === 't' && t[1] === 'profile-video'
					);
					if (hasProfileVideoTag) {
						const videoUid = event.tags.find((t) => t[0] === 'x')?.[1] || '';
						const videoUrl = event.tags.find((t) => t[0] === 'url')?.[1] || '';
						const thumbnailUrl = event.tags.find((t) => t[0] === 'thumb')?.[1] || '';
						const duration = Number(event.tags.find((t) => t[0] === 'duration')?.[1]) || 0;
						const size = Number(event.tags.find((t) => t[0] === 'size')?.[1]) || 0;
						if (videoUid && videoUrl) {
							profileData.videoIntro = {
								uid: videoUid,
								url: videoUrl,
								thumbnailUrl,
								duration,
								size
							};
						}
					}
					break;
				}
			}
		} catch (e) {
			console.error('Failed to parse comprehensive profile event:', e);
		}
	}

	return profileData;
}

/**
 * Full public profile fetch for npub pages and service discovery (NDK).
 */
export async function fetchComprehensiveProfile(pubkey: string): Promise<ComprehensiveProfile> {
	const { hexPubkey } = normalizeProfileLookupKey(pubkey);
	if (!hexPubkey) {
		throw new Error('Invalid pubkey format');
	}

	const events = await fetchComprehensiveProfileEvents(hexPubkey);
	return parseComprehensiveProfileEvents(events);
}
