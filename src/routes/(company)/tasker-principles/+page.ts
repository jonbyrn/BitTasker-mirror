import type { PageLoad } from './$types';

/**
 * Load function for the tasker principles page.
 * Returns the SEO metadata for the page.
 */
export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Tasker Principles - BitTasker',
		description:
			'Principles for people who do the work on BitTasker: clear scope, deliver what you bid, communicate, non-custodial escrow release on completion, and respectful conduct.',
		keywords:
			'BitTasker tasker principles, workers, clear scope, non-custodial escrow, Bitcoin task marketplace',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Tasker Principles - BitTasker',
		ogDescription:
			'Principles for workers on BitTasker: clear scope, deliver what you bid, communicate, and non-custodial escrow release on completion.',
		twitterTitle: 'Tasker Principles - BitTasker',
		twitterDescription:
			'Principles for workers on BitTasker: clear scope, deliver what you bid, communicate, and respectful conduct.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Tasker Principles - BitTasker',
			description:
				'Principles for people who do the work on BitTasker.',
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'Article',
				headline: 'Tasker Principles - BitTasker',
				description: 'Principles for workers on BitTasker',
				datePublished: '2024-01-15',
				dateModified: '2024-01-15'
			}
		}
	};
};
