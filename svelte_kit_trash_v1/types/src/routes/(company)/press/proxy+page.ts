// @ts-nocheck

import type { PageLoad } from './$types';


export const load = async ({ url }: Parameters<PageLoad>[0]) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Press & Media - BitTasker | Company News & Media Coverage',
		description: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		keywords: 'BitTasker press, media coverage, company news, Bitcoin marketplace news, press releases, media kit, partnership announcements, startup news',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Press & Media - BitTasker | Company News & Media Coverage',
		ogDescription: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		twitterTitle: 'Press & Media - BitTasker | Company News & Media Coverage',
		twitterDescription: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Press & Media - BitTasker',
			'description': 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits, company updates, and partnership announcements.',
			'url': `${baseUrl}${url.pathname}`,

			'mainEntity': {
				'@type': 'NewsArticle',
				'headline': 'BitTasker Press & Media Information',
				'description': 'Official press information and media resources for BitTasker',
				'datePublished': '2024-01-15',
				'dateModified': '2024-01-15'
			}
		}
	};
};
