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

	/** Event deletion (NIP-09) */
	EVENT_DELETION: 5,

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

	/** User relay list (NIP-65) - replaceable */
	NIP_65_RELAY_LIST: 10002,

	/** User-to-user chat messages (NIP-04/NIP-44) */
	DIRECT_MESSAGES: 4,

	/** Service listings (NIP-99) - active services */
	SERVICE_ACTIVE: 30402,

	/** Service listings (NIP-99) - draft services */
	SERVICE_DRAFT: 30403,

	/** Service quote request - regular encrypted event */
	SERVICE_QUOTE_REQUEST: 6420,

	/** Service proposal - regular encrypted event */
	SERVICE_PROPOSAL: 6421,

	/** Service proposal status - regular encrypted event */
	SERVICE_PROPOSAL_STATUS: 6422,

	/** User mute list (NIP-51) — replaceable, stores muted pubkeys and event ids */
	MUTE_LIST: 10000,

	/** Content/user report (NIP-56) — regular event broadcast to relays */
	REPORT: 1984,

	/** Hide a specific channel message (NIP-28) */
	HIDE_MESSAGE: 43,

	/** Mute a user in channel context (NIP-28) */
	MUTE_CHANNEL_USER: 44,

	/** Video event (NIP-96) — used for profile video introductions */
	VIDEO: 21,

	/**
	 * BitTasker Credit (sandbox beta). Parameterized replaceable.
	 * Documented in docs/credit-events.md. Not used on mainnet.
	 */
	CREDIT_ADVANCE_REQUEST: 31140,
	CREDIT_ADVANCE_OFFER: 31141,
	CREDIT_ADVANCE_ACCEPT: 31142,
	CREDIT_ADVANCE_SETTLED: 31143,
	/** One receipt per party. A contract counts only when both exist. */
	CREDIT_JOB_RECEIPT: 31144,

	/** Temporary staffing. Parameterized replaceable. Sandbox feature flag. */
	STAFF_JOB: 31150,
	STAFF_SEAT: 31151,

	/**
	 * Buy & Sell goods. Parameterized replaceable. Sandbox feature flag.
	 * NIP-99 tags (title, summary, price, location, image) are included.
	 * Kind 30402 stays the service listing kind, so goods use 31160.
	 */
	GOODS_LISTING: 31160,
	GOODS_ORDER: 31161,

	/** Review System (Attestation-Based Verified Reviews) */
	REVIEW: 6430, // Review content (signed by reviewer, published by client)
	ATTESTATION: 6431, // Attestation proof (signed by BitTasker issuer, published by backend)
	REVIEW_REPLY: 6432, // Reply to a review (signed by reviewee, published by client)
	REPLY_ATTESTATION: 6433 // Reply attestation proof (signed by BitTasker issuer)
};
export default KINDS;
