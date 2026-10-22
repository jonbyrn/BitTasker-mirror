import type { PageLoad } from './$types';

/**
 * Load function for the tasker principles page.
 * Returns the SEO metadata for the page.
 */
export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Tasker Principles - BitTasker',
		description: "Learn about BitTasker's tasker principles. Understand how to post clear work, pay fairly, and treat taskees with respect.",
		keywords: 'BitTasker tasker principles, posting a task, fair payment, client guidelines, Bitcoin task marketplace',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Tasker Principles - BitTasker',
		ogDescription: "Learn about BitTasker's tasker principles. Understand how to post clear work, pay fairly, and treat taskees with respect.",
		twitterTitle: 'Tasker Principles - BitTasker',
		twitterDescription: "Learn about BitTasker's tasker principles. Understand how to post clear work, pay fairly, and treat taskees with respect.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Tasker Principles - BitTasker',
			description: "Learn about BitTasker's tasker principles. Understand how to post clear work, pay fairly, and treat taskees with respect.",
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'Article',
				headline: 'Tasker Principles - BitTasker',
				description: 'Core principles for people who post tasks on BitTasker',
				datePublished: '2024-01-15',
				dateModified: '2024-01-15'
			}
		}
	};
};
