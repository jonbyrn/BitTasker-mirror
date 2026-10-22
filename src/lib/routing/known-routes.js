/** First URL segments that belong to the app. Anything else is a missing page. */
const ROOTS = new Set([
	'about',
	'ab-25-contest',
	'auth',
	'bids',
	'browse',
	'careers',
	'categories',
	'community-guidelines',
	'contact',
	'create-service',
	'create-task',
	'credit',
	'debug-nostr',
	'debug-smart-contract',
	'debug-wallet',
	'delete-account',
	'e2e',
	'earning',
	'faq',
	'feedback',
	'goods',
	'hiring',
	'how-it-works',
	'learn',
	'login',
	'messages',
	'my-jobs',
	'notifications',
	'npub',
	'press',
	'privacy',
	'profile',
	'reviews',
	'search',
	'secure-payments',
	'security',
	'services',
	'settings',
	'shifts',
	'start-earning',
	'task',
	'taskee-fees',
	'tasker-fees',
	'tasker-principles',
	'tasks',
	'terms',
	'verify-email',
	'wallet',
	'welcome',
	'404'
]);

const ASSET_EXT =
	/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|txt|xml|pdf|map|wasm|mjs|json)$/i;

/** @param {string} pathname */
export function isKnownAppPath(pathname) {
	const path = String(pathname || '').split('?')[0].split('#')[0];
	if (path === '/' || path === '') return true;
	const [segment] = path.replace(/^\/+/, '').split('/');
	return ROOTS.has(segment);
}

/**
 * Status for the SPA shell when no static file exists.
 * Null means the missing file is a real asset and should stay a bare 404.
 * Unknown pages still receive the shell so the client can call error(404), but the HTTP status stays 404.
 * @param {string} pathname
 * @returns {200 | 404 | null}
 */
export function spaShellStatus(pathname) {
	const path = String(pathname || '').split('?')[0].split('#')[0];
	if (ASSET_EXT.test(path)) return null;
	return isKnownAppPath(path) ? 200 : 404;
}
