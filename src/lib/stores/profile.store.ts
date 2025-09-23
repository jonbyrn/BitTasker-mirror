/* eslint-disable @typescript-eslint/no-explicit-any */
import { SimplePool, type NostrEvent } from 'nostr-tools';
import type { Profile } from '$lib/types/profile';
import { writable } from 'svelte/store';
import { subscribeToProfileUpdates, closeNostrPool } from '$lib/nostr/profile';
import KINDS from '$lib/utils/constants/kinds';

// Define the profile state type
type ProfileState = {
    isLoading: boolean;
    error: string | null;
    data: Profile | null;
    stats: {
        tasksCompleted: number;
        rating: number;
        responseRate: number;
        onTimeRate: number;
    };
};

// Create the initial state
const initialState: ProfileState = {
    isLoading: true,
    error: null,
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
    stats: {
        tasksCompleted: 0,
        rating: 0,
        responseRate: 0,
        onTimeRate: 0
    }
};

// Create the store
function createProfileStore() {
    const { subscribe, set, update } = writable<ProfileState>(initialState);
    let cleanup: (() => void) | null = null;

    return {
        pool: new SimplePool(),
        
        subscribe,

        // Initialize the store with data from nostr
        async init() {
            try {
                // Set loading state
                update(state => ({ ...state, isLoading: true, error: null }));

                // Subscribe to profile updates
                cleanup = await subscribeToProfileUpdates(
                    (event: NostrEvent) => {
                        update(state => {
                            if (!state.data) return state;

                            try {
                                const content = JSON.parse(event.content);

                                // Handle different event kinds
                                switch (event.kind) {
                                    case 0: // Metadata
                                        return {
                                            ...state,
                                            data: {
                                                ...state.data,
                                                name: content.display_name || content.name || '',
                                                about: content.about,
                                                website: content.website,
                                                professionalTitle: content.professionalTitle,
                                                picture: content.picture || ''
                                            }
                                        };
                                    case 30063: // Images
                                        return {
                                            ...state,
                                            data: {
                                                ...state.data,
                                                pictures: content.map((img: any) => ({
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
                                                skills: content.map((skill: any) => ({
                                                    name: skill.name,
                                                    level: skill.level,
                                                    verificationStatus: skill.verificationStatus,
                                                    endorsements: skill.endorsements,
                                                    certifications: skill.certifications || []
                                                }))
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
                                                        skills: content.skills
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
                                                reviews: content.map((review: any) => ({
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
                        30002: { d: 'availability' }, // Kind 30002 for availability
                    }
                );

                // Update store with initial state
                set({
                    ...initialState,
                    isLoading: false,
                    error: null
                });
            } catch (error) {
                console.error('Failed to initialize profile store:', error);
                set({
                    ...initialState,
                    isLoading: false,
                    error: 'Failed to load profile data'
                });
            }
        },

        // Cleanup subscriptions
        destroy() {
            if (cleanup) {
                cleanup();
                cleanup = null;
            }
            closeNostrPool();
        }
    };
}

// Export the store instance
export const profileStore = createProfileStore(); 