import { skillCategories } from '$lib/data/onboardingData';

/** Flat skill names for the multiselect, including Copywriting. */
export function skillCatalogOptions(): string[] {
	const names = skillCategories.flatMap((category) => category.skills);
	if (!names.includes('Copywriting')) names.push('Copywriting');
	return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
