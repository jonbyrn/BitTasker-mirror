// @ts-nocheck
import type { PageLoad } from './$types';

/**
 * Load function for the tasker principles page.
 * Returns the SEO metadata for the page.
 */
export const load = async ({ url }: Parameters<PageLoad>[0]) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Taskee Principles - BitTasker | Worker Guidelines',
		description: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		keywords: 'BitTasker taskee principles, worker guidelines, platform values, taskee success, Bitcoin task worker, freelancer principles, gig economy values, worker conduct',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		ogDescription: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		twitterTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		twitterDescription: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Taskee Principles - BitTasker',
			description: "Learn about BitTasker's taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.",
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'Article',
				headline: 'Taskee Principles - BitTasker Worker Guidelines',
				description: 'Core principles and guidelines for successful taskees on the BitTasker platform',
				datePublished: '2024-01-15',
				dateModified: '2024-01-15'
			}
		}
	};
};
