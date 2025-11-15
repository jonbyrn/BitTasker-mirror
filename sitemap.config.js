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
		'/escrow',
		'/faq',
		'/how-it-works',
		'/press',
		'/privacy',
		'/security',
		'/taskee-fees',
		'/tasker-principles',
		'/terms',
		// Auth pages
		'/auth/login',
		'/auth/signup',
		'/auth/recover',
		'/verify-email'
	],
	ignore: [
		// Exclude protected routes
		'/dashboard/**',
		// Exclude auth onboarding
		'/auth/onboarding',
		// Exclude dynamic routes that require parameters
		'/auth/recover/[npub]'
	],
	sort: 'alpha',
	createFilter: (route) => {
		// Only include routes that don't require authentication
		if (route.startsWith('/dashboard/') || route.startsWith('/(protected)/')) {
			return false;
		}
		return true;
	}
});

export default sitemap; 