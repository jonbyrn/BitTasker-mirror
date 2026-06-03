import type { Availability, NostrProfileImage, PortfolioItem, Skill } from '$lib/types/profile.d';
import uploadService from '$lib/api/services/upload.service';
import KINDS from '$lib/utils/constants/kinds';
import { profileRelays } from '$lib/nostr/profile/profile-keys';
import { publishDeletionEventNdk, publishSignedNdkEvent } from '$lib/nostr/profile/ndk';
import {
	generatePortfolioTranslations,
	generateSkillTranslations
} from '$lib/nostr/profile/translations';

export async function publishMultipleImages(
	images: NostrProfileImage[],
	_eventId: string | null,
	identifier: string,
	relays = profileRelays()
): Promise<string[]> {
	await publishSignedNdkEvent(
		KINDS.PROFILE_IMAGES,
		JSON.stringify(images),
		[['d', identifier]],
		relays
	);
	return [];
}

export async function publishAvailabilityUpdate(availability: Availability): Promise<void> {
	await publishSignedNdkEvent(
		KINDS.PROFILE_AVAILABILITY,
		JSON.stringify(availability),
		[['d', 'availability']],
		profileRelays()
	);
}

export async function publishSkillsUpdate(
	skills: Skill[],
	relays = profileRelays()
): Promise<void> {
	let currentLocale: string | undefined;
	try {
		const { get } = await import('svelte/store');
		const { locale } = await import('svelte-i18n');
		currentLocale = get(locale) || undefined;
	} catch {
		// svelte-i18n not loaded
	}

	const skillsWithTranslations = await Promise.all(
		skills.map(async (skill) => {
			if (!skill.translations && skill.name.trim()) {
				const translations = await generateSkillTranslations(skill.name, currentLocale);
				return {
					...skill,
					...(translations && { translations })
				};
			}
			return skill;
		})
	);

	await publishSignedNdkEvent(
		KINDS.PROFILE_SKILLS,
		JSON.stringify(skillsWithTranslations),
		[['d', 'skills']],
		relays
	);
}

export async function uploadCertification(
	certification: {
		skillId: string;
		name: string;
		issuer: string;
		date: string;
		file: File;
	},
	relays = profileRelays()
): Promise<string> {
	const uploadResult = await uploadService.uploadSingleFile(certification.file, {
		folder: 'certifications'
	});

	const signedCertEvent = await publishSignedNdkEvent(
		KINDS.FILE_METADATA,
		JSON.stringify({
			name: certification.name,
			issuer: certification.issuer,
			date: certification.date,
			fileUrl: uploadResult.url,
			verified: false
		}),
		[
			['d', 'certification'],
			['x', uploadResult.key],
			['m', certification.file.type],
			['alt', certification.file.name],
			['skill', certification.skillId]
		],
		relays
	);

	return signedCertEvent.id;
}

export async function publishPortfolioItem(
	item: PortfolioItem,
	tags: string[][],
	relays = profileRelays()
): Promise<void> {
	let currentLocale: string | undefined;
	try {
		const { get } = await import('svelte/store');
		const { locale } = await import('svelte-i18n');
		currentLocale = get(locale) || undefined;
	} catch {
		// svelte-i18n not loaded
	}

	let itemWithTranslations = item;
	if (!item.translations && item.title.trim() && item.description.trim()) {
		const translations = await generatePortfolioTranslations(
			{
				title: item.title,
				description: item.description
			},
			currentLocale
		);
		if (translations) {
			itemWithTranslations = {
				...item,
				translations
			};
		}
	}

	await publishSignedNdkEvent(
		KINDS.PROFILE_PORTFOLIO,
		JSON.stringify(itemWithTranslations),
		tags,
		relays
	);
}

export async function deletePortfolioItem(id: string, relays = profileRelays()): Promise<void> {
	await publishDeletionEventNdk(id, KINDS.PROFILE_PORTFOLIO.toString(), relays);
}
