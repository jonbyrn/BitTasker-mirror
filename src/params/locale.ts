import type { ParamMatcher } from '@sveltejs/kit';

const SUPPORTED_LOCALES = ['en', 'es'] as const;

/** Matches the optional locale prefix in URLs: /learn/ (en) or /aprende/ (es) */
export const match: ParamMatcher = (param) => {
	return SUPPORTED_LOCALES.includes(param as (typeof SUPPORTED_LOCALES)[number]);
};
