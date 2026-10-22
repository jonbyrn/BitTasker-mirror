/** English and Spanish are the complete interfaces. Portuguese, French, and Swahili are not offered. */
const SUPPORTED = ['en', 'es'] as const;

export type AppLocale = (typeof SUPPORTED)[number];

/**
 * Same order as production: a saved en/es choice, then the browser language,
 * then English. Time zone and country do not choose the language.
 */
export function chooseLocale(input: {
	stored?: string | null;
	navigatorLocale?: string | null;
	timeZone?: string | null;
	country?: string | null;
}): AppLocale {
	if (input.stored && isSupported(input.stored)) return input.stored;
	const language = input.navigatorLocale?.toLowerCase().split('-')[0];
	if (language && isSupported(language)) return language;
	return 'en';
}

function isSupported(value: string): value is AppLocale {
	return (SUPPORTED as readonly string[]).includes(value);
}
