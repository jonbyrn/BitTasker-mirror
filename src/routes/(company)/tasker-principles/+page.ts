import type { PageLoad } from './$types';

/**
 * Load function for the tasker principles page.
 * Returns the SEO metadata for the page.
 */
export const load: PageLoad = async ({ url }) => {
	const seo = {
		title: 'Taskee Principles - BitTasker | Worker Guidelines',
		description: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		keywords: 'BitTasker taskee principles, worker guidelines, platform values, taskee success, Bitcoin task worker, freelancer principles, gig economy values, worker conduct',
		canonical: url.href,
		ogTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		ogDescription: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		twitterTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		twitterDescription: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Taskee Principles - BitTasker',
			description: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
			url: url.href,
			mainEntity: {
				'@type': 'Article',
				headline: 'Taskee Principles - BitTasker Worker Guidelines',
				description: 'Core principles and guidelines for successful taskees on the BitTasker platform',
				datePublished: '2024-01-15',
				dateModified: '2024-01-15'
			}
		}
	};

	return {
		seo
	};
};