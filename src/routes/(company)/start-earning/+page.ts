import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Start earning - BitTasker',
		description:
			'Start earning on BitTasker across Tasks, Services, Buy & Sell, and Temporary Staff. Bitcoin and USDT use the same fee.',
		keywords: 'BitTasker, start earning, tasks, temporary staff, buy and sell',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Start earning - BitTasker',
		ogDescription:
			'Create an account, browse tasks, or look at temporary staff. Bitcoin and USDT use the same fee.',
		twitterTitle: 'Start earning - BitTasker',
		twitterDescription:
			'Create an account, browse tasks, or look at temporary staff on BitTasker.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Start earning - BitTasker',
			description:
				'Start earning on BitTasker across Tasks, Services, Buy & Sell, and Temporary Staff.',
			url: `${baseUrl}${url.pathname}`
		}
	};
};
