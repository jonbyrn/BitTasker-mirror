export type {
	ProfileMetadataVerifyOptions,
	ProfileSetupMode,
	AuthProfileSnapshot
} from '$lib/nostr/profile/types';

export {
	profileRelays,
	normalizeProfileLookupKey,
	type ProfileLookupKey
} from '$lib/nostr/profile/profile-keys';

export {
	resolveDisplayNameFromProfileMetadataContent,
	buildProfileMetadataWire,
	parseProfileMetadataContent,
	mergeProfileMetadata,
	sanitizeProfileDisplayName,
	PROFILE_METADATA_WIRE_ENRICHMENT_KEYS
} from '$lib/nostr/profile/metadata-wire';

export {
	fetchProfileMetadata,
	fetchProfilesBatch,
	getCachedProfile,
	parseProfileEvents,
	fetchContractProfile,
	type ProfileSummary,
	type ContractProfile
} from '$lib/nostr/profile/display-profile';

export {
	fetchComprehensiveProfile,
	type ComprehensiveProfile
} from '$lib/nostr/profile/comprehensive-profile';

export {
	publishProfileMetadata,
	verifyProfileMetadataOnRelays
} from '$lib/nostr/profile/metadata-publish';

export {
	loadAuthProfileSnapshot,
	getProfileEvent,
	fetchKind0Profile
} from '$lib/nostr/profile/snapshot';

export {
	createSubscriptionKey,
	subscribeToProfileUpdates,
	subscribeUserProfile,
	closeNostrPool
} from '$lib/nostr/profile/subscribe';

export {
	generateProfileTranslations,
	generateSkillTranslations,
	generateCertificationTranslations,
	generatePortfolioTranslations
} from '$lib/nostr/profile/translations';

export {
	publishMultipleImages,
	publishSkillsUpdate,
	uploadCertification,
	publishPortfolioItem,
	deletePortfolioItem,
	publishAvailabilityUpdate
} from '$lib/nostr/profile/kinds-publish';

export {
	deleteNostrEvent,
	getEventById,
	fetchKind0Event,
	fetchProfileName,
	NdkSignerNotConfiguredError
} from '$lib/nostr/profile/ndk';
