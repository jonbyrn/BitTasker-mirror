/**
 * Nostr Event Kinds used in BitTasker
 *
 * Event Kind Ranges:
 * - 0-999: Regular events (stored permanently by relays)
 * - 10000-19999: Replaceable events (newer event replaces older with same kind/author)
 * - 20000-29999: Ephemeral events (not stored by relays)
 * - 30000-39999: Parameterized replaceable events (replaceable by 'd' tag)
 */
const KINDS = {
	/** Basic profile metadata (NIP-01) - name, about, picture, etc. */
	PROFILE_METADATA: 0,

	/** User skills list - parameterized replaceable */
	PROFILE_SKILLS: 30000,

	/** Portfolio items - parameterized replaceable, each with unique 'd' tag */
	PROFILE_PORTFOLIO: 30001,

	/** Availability schedule - parameterized replaceable */
	PROFILE_AVAILABILITY: 30002,

	/** Standard services offered - parameterized replaceable */
	PROFILE_STANDARD_SERVICES: 30003,

	/** User reviews - parameterized replaceable */
	PROFILE_REVIEWS: 30004,

	/** User location data - parameterized replaceable */
	PROFILE_LOCATION: 30005,

	/** File metadata (NIP-94) - for certifications, attachments, etc. */
	FILE_METADATA: 1063,

	/** Profile images collection - parameterized replaceable */
	PROFILE_IMAGES: 30063,

	/** Task creation and updates - parameterized replaceable by task ID */
	TASK_CREATION: 31000,

	/** Saved task searches (NIP-51) - parameterized replaceable */
	SAVED_SEARCHES: 31001,

	/** Recurring task definitions - parameterized replaceable */
	RECURRING_TASK: 31002,

	/** User preferences (NIP-33) - parameterized replaceable */
	USER_PREFERENCES: 31003,

	/** Task recommendations (NIP-51) - parameterized replaceable */
	RECOMMENDATIONS: 31004,

	/** Individual saved search (NIP-33) - parameterized replaceable */
	SAVED_SEARCH: 31005,

	/** Bid submissions - parameterized replaceable by bid ID */
	BIDS: 30007,
	BID_STATUS: 30008,

	/** Contract creation/updates - parameterized replaceable by escrow ID */
	CONTRACT: 30006,

	/** Contract status updates - regular event (not replaceable) */
	CONTRACT_STATUS: 31006,

	// Review System (client-side only, NIP-33 replaceable by d=escrowId)
	REVIEW_EVENT_KIND: 1985,
	REVIEW_VERIFIED: 1985, // Alias for REVIEW_EVENT_KIND
	REVIEW_LEGACY: 31007, // Legacy kind (read-only compatibility)
	REVIEW_REPORTED: 31011, // Reported review for moderation
	REVIEW_REPLY: 31012, // Reply to a review

	/** User relay list (NIP-65) - replaceable */
	NIP_65_RELAY_LIST: 10002,

	/** Boltz swap management - parameterized replaceable */
	PENDING_SWAPS: 30078,

	/** User-to-user chat messages (NIP-04/NIP-44) */
	DIRECT_MESSAGES: 4
};

export default KINDS;
