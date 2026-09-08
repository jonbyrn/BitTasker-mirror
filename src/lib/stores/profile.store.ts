import type { NostrEvent } from 'nostr-tools';
import type { NostrProfileImage, NostrSkill, NostrReview, Profile } from '$lib/types/profile';
import type { Service } from '$lib/types/service.d';
import { writable } from 'svelte/store';
import { subscribeToProfileUpdates, closeNostrPool } from '$lib/nostr/profile';
import { loadCurrentProfileServices } from '$lib/utils/profile/services-loader';
import KINDS from '$lib/utils/constants/kinds';
import { getReviewsByReviewer, getReviewsForUser } from '$lib/utils/reviews/queries';
import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
import { getNpub } from '$lib/utils/nostrKeys';

// Define the profile state type
type ProfileState = {
	isLoading: boolean;
	error: string | null;
	servicesLoading: boolean;
	servicesError: string | null;
	data: Profile | null;
	services: Service[];
	stats: {
		tasksCompleted: number;
		contractsCompleted: number;
		activeServices: number;
		rating: number;
		responseRate: number;
		onTimeRate: number;
	};
};

// Create the initial state
const initialState: ProfileState = {
	isLoading: true,
	error: null,
	servicesLoading: true,
	servicesError: null,
	data: {
		name: '',
		about: '',
		picture: '',
		pictures: [],
		website: '',
		professionalTitle: '',
		skills: [],
		portfolio: [],
		availability: {
			timeSlots: [],
			timezone: '',
			noticeHours: 24,
			maxBookingsPerDay: 5,
			breakBetweenBookings: 60
		},
		reviews: []
	},
	services: [],
	stats: {
		tasksCompleted: 0,
		contractsCompleted: 0,
		activeServices: 0,
		rating: 0,
		responseRate: 0,
		onTimeRate: 0
	}
};

// Create the store
function createProfileStore() {
	const { subscribe, set, update } = writable<ProfileState>(initialState);
	let cleanup: (() => void) | null = null;

	async function loadProfileServices(): Promise<void> {
		update((state) => ({
			...state,
			servicesLoading: true,
			servicesError: null
		}));

		const result = await loadCurrentProfileServices();
		update((state) => ({
			...state,
			servicesLoading: false,
			servicesError: result.error,
			services: result.services,
			stats: {
				...state.stats,
				activeServices: result.services.length
			}
		}));
	}

	async function loadReviewStats(): Promise<void> {
		try {
			const currentUserPubkey = await getNpub();
			if (!currentUserPubkey) {
				return;
			}

			const [reviewsReceived, reviewsGiven] = await Promise.all([
				getReviewsForUser(currentUserPubkey, 100),
				getReviewsByReviewer(currentUserPubkey, 100)
			]);
			const uniqueContractIds = new Set<string>();
			for (const review of [...reviewsReceived, ...reviewsGiven]) {
				uniqueContractIds.add(review.contractId ?? review.attestationEventId);
			}

			const stats = calculateReviewStats(reviewsReceived);
			update((state) => ({
				...state,
				stats: {
					...state.stats,
					tasksCompleted: uniqueContractIds.size,
					contractsCompleted: uniqueContractIds.size,
					rating: reviewsReceived.length > 0 ? Math.round(stats.averageRating * 10) / 10 : 0
				}
			}));
		} catch (error) {
			console.error('Failed to load review stats:', error);
		}
	}

	return {
		subscribe,

		// Initialize the store with data from nostr
		async init() {
			try {
				// Set loading state
				update((state) => ({
					...state,
					isLoading: true,
					error: null,
					servicesLoading: true,
					servicesError: null
				}));

				// Subscribe to profile updates
				cleanup = await subscribeToProfileUpdates(
					(event: NostrEvent) => {
						update((state) => {
							if (!state.data) return state;

							try {
								const content = JSON.parse(event.content);

								// Handle different event kinds
								switch (event.kind) {
									case KINDS.PROFILE_METADATA: // Metadata
										return {
											...state,
											data: {
												...state.data,
												name: content.display_name || content.name || '',
												about: content.about,
												website: content.website,
												professionalTitle: content.professionalTitle,
												picture: content.picture || '',
												translations: content.translations
											}
										};
									case KINDS.PROFILE_IMAGES: // Images
										return {
											...state,
											data: {
												...state.data,
												pictures: content.map((img: NostrProfileImage) => ({
													url: img.url,
													type: img.type || 'image/jpeg',
													alt: img.alt || '',
													key: img.key,
													isPrimary: img.isPrimary || false
												}))
											}
										};
									case KINDS.PROFILE_SKILLS: // Skills (30000)
										return {
											...state,
											data: {
												...state.data,
												skills: content.map(
													(
														skill: NostrSkill & {
															translations?: Record<string, unknown>;
															id?: string;
														}
													) => ({
														name: skill.name,
														level: skill.level,
														verificationStatus: skill.verificationStatus,
														endorsements: skill.endorsements,
														certifications: skill.certifications || [],
														translations: skill.translations,
														id: skill.id
													})
												)
											}
										};
									case KINDS.PROFILE_PORTFOLIO: // Portfolio
										return {
											...state,
											data: {
												...state.data,
												portfolio: [
													...(state.data.portfolio || []),
													{
														id: event.id,
														title: content.title,
														description: content.description,
														images: content.images,
														completionDate: content.completionDate,
														skills: content.skills,
														link: content.link,
														translations: content.translations
													}
												]
											}
										};
									case KINDS.PROFILE_AVAILABILITY: // Availability
										return {
											...state,
											data: {
												...state.data,
												availability: {
													timeSlots: content.timeSlots || [],
													timezone: content.timezone || '',
													noticeHours: content.noticeHours || 24,
													maxBookingsPerDay: content.maxBookingsPerDay || 5,
													breakBetweenBookings: content.breakBetweenBookings || 60
												}
											}
										};
									case KINDS.PROFILE_REVIEWS: // Reviews
										return {
											...state,
											data: {
												...state.data,
												reviews: content.map((review: NostrReview) => ({
													id: review.id,
													from: review.from,
													rating: review.rating,
													text: review.text,
													date: review.date
												}))
											}
										};
									case KINDS.FILE_METADATA: // Certifications
										return {
											...state,
											data: {
												...state.data,
												certifications: [
													...(state.data.certifications || []),
													{
														name: content.name,
														issuer: content.issuer,
														date: content.date,
														verified: content.verified,
														fileUrl: content.fileUrl
													}
												]
											}
										};
									default:
										return state;
								}
							} catch (err) {
								console.error('Failed to parse event content:', err);
								return state;
							}
						});
					},
					{
						0: null, // Kind 0 for metadata
						30063: { d: 'profile-images' }, // Kind 30063 for images
						30000: { d: 'skills' }, // Kind 30000 for skills
						1063: { d: 'certification' }, // Kind 1063 for certifications
						30001: null, // Kind 30001 for portfolio
						30004: { d: 'reviews' }, // Kind 30004 for reviews
						30002: { d: 'availability' } // Kind 30002 for availability
					}
				);

				// Update store with initial state
				set({
					...initialState,
					isLoading: false,
					error: null,
					servicesLoading: true,
					servicesError: null
				});

				// Profile metadata remains usable while optional backend/relay enrichments fail.
				await Promise.allSettled([loadProfileServices(), loadReviewStats()]);
			} catch (error) {
				console.error('Failed to initialize profile store:', error);
				set({
					...initialState,
					isLoading: false,
					error: 'Failed to load profile data',
					servicesLoading: false,
					servicesError: null
				});
			}
		},

		async reloadServices() {
			await loadProfileServices();
		},

		// Cleanup subscriptions
		destroy() {
			if (cleanup) {
				cleanup();
				cleanup = null;
			}
			closeNostrPool();
		},

		/**
		 * Reset store to initial state
		 * Called on logout to prevent stale data
		 */
		reset() {
			// First cleanup any active subscriptions
			if (cleanup) {
				cleanup();
				cleanup = null;
			}
			closeNostrPool();
			// Reset to initial state
			set(initialState);
		}
	};
}

// Export the store instance
export const profileStore = createProfileStore();
