import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';

export type ProfileMetadataVerifyOptions = {
	requiredDisplayName?: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
};

export type ProfileSetupMode = 'signup_enrichment' | 'nsec_first_publish';

export type AuthProfileSnapshot = {
	metadata: NostrProfile | null;
	picture: NostrProfileImage | null;
	skills: Skill[];
	imageEventId: string | null;
};
