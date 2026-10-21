/**
 * Settings must not pass a raw axios message through `$t`.
 * "Network Error" is not a translation key.
 */
export function settingsKeyErrorMessage(raw: string, translate: (key: string) => string): string {
	const message = (raw ?? '').trim();
	if (!message || message === 'Network Error' || /^network error$/i.test(message)) {
		const translated = translate('settings.error.network');
		return translated && translated !== 'settings.error.network'
			? translated
			: 'Could not reach the network. Your session is still signed in.';
	}
	const translated = translate(message);
	if (translated && translated !== message) return translated;
	return message;
}
