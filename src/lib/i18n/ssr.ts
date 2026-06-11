function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>
): Record<string, unknown> {
	if (!source) return target;
	if (!target) return source;

	for (const key in source) {
		const sourceVal = source[key];
		const targetVal = target[key];

		if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
			if (!targetVal || typeof targetVal !== 'object') {
				target[key] = {};
			}
			deepMerge(target[key] as Record<string, unknown>, sourceVal as Record<string, unknown>);
		} else {
			target[key] = sourceVal;
		}
	}
	return target;
}

export type TranslationBundle = Record<string, unknown>;

export function mergeTranslations(
	...bundles: TranslationBundle[]
): TranslationBundle {
	let merged: TranslationBundle = {};
	for (const bundle of bundles) {
		merged = deepMerge(merged, bundle);
	}
	return merged;
}
