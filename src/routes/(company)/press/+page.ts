import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
	const description = 'Press inquiries: admin@bittasker.com';

	return {
		title: 'Press & Media - BitTasker | Company News & Media Coverage',
		description,
		keywords: 'BitTasker press, admin@bittasker.com',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Press - BitTasker',
		ogDescription: description,
		twitterTitle: 'Press - BitTasker',
		twitterDescription: description,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Press - BitTasker',
			description,
			url: `${baseUrl}${url.pathname}`
		}
	};
};
