import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

/**
 * Normalizes a skill string to a translation key slug (e.g. "animal handling" -> "animal_handling").
 */
export function skillToSlug(skill: string): string {
	if (!skill || typeof skill !== 'string') return '';
	return skill
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}

/**
 * Returns the translated label for a skill if a translation key exists, otherwise the original skill.
 * Use when displaying skills in the UI so they follow the current locale (e.g. Spanish).
 * Skills are user-typed; we only translate when we have a matching key in locales.
 */
export function translateSkill(skill: string): string {
	if (!skill || typeof skill !== 'string') return skill;
	const slug = skillToSlug(skill);
	if (!slug) return skill;
	const translated = get(t)(`skills.${slug}`);
	if (translated === `skills.${slug}` || !translated) return skill;
	return translated;
}
