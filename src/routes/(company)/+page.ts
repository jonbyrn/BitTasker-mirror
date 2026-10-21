import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export function load() {
	return {
		title: 'Find work. Find help. Get things done. | BitTasker',
		description: 'Earn or pay in dollars or Bitcoin.',
		keywords: 'BitTasker, find help, find work, dollars, Bitcoin, tasks, services',
		canonical: `${baseUrl}/`,
		ogTitle: 'Find work. Find help. Get things done. | BitTasker',
		ogDescription: 'Earn or pay in dollars or Bitcoin.',
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'Find work. Find help. Get things done. | BitTasker',
		twitterDescription: 'Earn or pay in dollars or Bitcoin.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(`${baseUrl}/`)
	};
}
