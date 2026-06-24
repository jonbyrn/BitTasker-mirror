import { createSitemap } from 'svelte-sitemap/src/index.js';

const sitemap = createSitemap('https://bittasker.com', {
	changeFreq: 'weekly',
	priority: 0.7,
	additionalPaths: [
		// Company pages
		'/about',
		'/careers',
		'/tasker-fees',
		'/community-guidelines',
		'/contact',
		'/secure-payments',
		'/faq',
		'/how-it-works',
		'/press',
		'/privacy',
		'/security',
		'/taskee-fees',
		'/tasker-principles',
		'/terms',
		// Learn hub
		'/learn',
		// Auth pages
		'/auth/login',
		'/auth/signup',
		'/auth/recover',
		'/verify-email'
	],
	ignore: [
		// Exclude protected routes
		'/hiring/**',
		'/earning/**',
		'/wallet',
		'/create-task',
		'/create-service',
		'/messages/**',
		'/profile/**',
		'/settings',
		'/notifications',
		'/reviews',
		'/bids',
		'/feedback',
		// Exclude auth onboarding
		'/auth/onboarding',
		// Exclude dynamic routes that require parameters
		'/auth/recover/[npub]'
	],
	sort: 'alpha',
	createFilter: (route) => {
		// Only include routes that don't require authentication
		if (route.startsWith('/(protected)/')) {
			return false;
		}
		return true;
	}
});

export default sitemap;
