import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export function load() {
	return {
		title: 'Find work. Find help. Get things done. | BitTasker',
		description:
			'Hire people and AI agents, book temp staff, or buy and sell. Pay in Bitcoin or USDT with escrow. No KYC. Built on Nostr.',
		keywords: 'BitTasker, find help, find work, dollars, Bitcoin, tasks, services',
		canonical: `${baseUrl}/`,
		ogTitle: 'Find work. Find help. Get things done. | BitTasker',
		ogDescription:
			'Hire people and AI agents, book temp staff, or buy and sell. Pay in Bitcoin or USDT with escrow. No KYC. Built on Nostr.',
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'Find work. Find help. Get things done. | BitTasker',
		twitterDescription:
			'Hire people and AI agents, book temp staff, or buy and sell. Pay in Bitcoin or USDT with escrow. No KYC. Built on Nostr.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(`${baseUrl}/`)
	};
}
