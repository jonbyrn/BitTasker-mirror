import type { NostrProfile } from '$lib/types/profile.d';

/**
 * Read-time display utility for profile translations.
 * Wraps the same logic used by ProfileInfoSection.svelte local functions.
 * Write-time translation generation is handled by $lib/nostr/profile/translations.ts.
 *
 * All functions return the ORIGINAL value when:
 * - sourceLanguage matches the visitor's locale (no translation needed)
 * - No translations exist on the object
 * - Translation lookup fails
 */

interface Translatable {
	sourceLanguage?: string;
	translations?: Record<string, Record<string, string>>;
}

export function getTranslatedProfileContent(
	profile: NostrProfile | null,
	field: 'professionalTitle' | 'about',
	locale: string,
	originalValue: string
): string {
	if (!profile?.translations) return originalValue;
	if (profile.translations.sourceLanguage === locale) return originalValue;
	const translation = profile.translations.translations?.[locale];
	if (translation && field in translation) {
		return (translation as Record<string, string>)[field] || originalValue;
	}
	return originalValue;
}

export function getTranslatedSkillName(
	skill:
		| string
		| {
				name?: string;
				translations?: Translatable;
		  },
	locale: string
): string {
	if (typeof skill === 'string') return skill;
	const originalName = skill.name ?? '';
	if (!skill.translations?.translations) return originalName;
	if (skill.translations.sourceLanguage === locale) return originalName;
	const translation = skill.translations.translations[locale];
	if (translation) {
		return translation.name || originalName;
	}
	return originalName;
}

export function getTranslatedPortfolioTitle(
	item: {
		title?: string;
		translations?: Translatable;
	},
	locale: string
): string {
	const originalTitle = item.title ?? '';
	if (!item.translations?.translations) return originalTitle;
	if (item.translations.sourceLanguage === locale) return originalTitle;
	const translation = item.translations.translations[locale];
	if (translation) {
		return translation.title || originalTitle;
	}
	return originalTitle;
}

export function getTranslatedPortfolioDescription(
	item: {
		description?: string;
		translations?: Translatable;
	},
	locale: string
): string {
	const originalDesc = item.description ?? '';
	if (!item.translations?.translations) return originalDesc;
	if (item.translations.sourceLanguage === locale) return originalDesc;
	const translation = item.translations.translations[locale];
	if (translation) {
		return translation.description || originalDesc;
	}
	return originalDesc;
}
