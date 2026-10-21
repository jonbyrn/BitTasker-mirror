/** English and Spanish are the complete interfaces. Portuguese, French, and Swahili are not offered. */
const SUPPORTED = ['en', 'es'] as const;

export type AppLocale = (typeof SUPPORTED)[number];

export function chooseLocale(input: {
	stored?: string | null;
	navigatorLocale?: string | null;
	timeZone?: string | null;
	country?: string | null;
}): AppLocale {
	if (input.stored && isSupported(input.stored)) return input.stored;
	if (prefersSpanish(input)) return 'es';
	const language = input.navigatorLocale?.toLowerCase().split('-')[0];
	if (language && isSupported(language)) return language;
	return 'en';
}

function isSupported(value: string): value is AppLocale {
	return (SUPPORTED as readonly string[]).includes(value);
}

/** Spanish for an es language tag, an SV region, or El Salvador. */
function prefersSpanish(input: {
	navigatorLocale?: string | null;
	timeZone?: string | null;
	country?: string | null;
}): boolean {
	const locale = (input.navigatorLocale || '').toLowerCase();
	const parts = locale.split('-').filter(Boolean);
	if (parts[0] === 'es') return true;
	if (parts.length > 1 && parts[parts.length - 1] === 'sv') return true;
	if ((input.country || '').toUpperCase() === 'SV') return true;
	return input.timeZone === 'America/El_Salvador';
}
