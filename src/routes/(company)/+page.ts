import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';
import type { HomepageData } from '$lib/services/homepageFetch';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export async function load() {
	let homepageData: HomepageData = { tasks: [], services: [] };
	// The public site is a static shell, so this load runs in the browser.
	try {
		const { fetchHomepageData } = await import('$lib/services/homepageFetch');
		homepageData = await fetchHomepageData(8);
	} catch {
		// Non-critical
	}

	return {
		title: 'Find work. Find help. Get things done. | BitTasker',
		description: 'Earn or pay in dollars or Bitcoin.',
		keywords: 'BitTasker, find help, find work, dollars, Bitcoin, tasks, services, gig economy',
		canonical: `${baseUrl}/`,
		ogTitle: 'Find work. Find help. Get things done. | BitTasker',
		ogDescription: 'Earn or pay in dollars or Bitcoin.',
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'Find work. Find help. Get things done. | BitTasker',
		twitterDescription: 'Earn or pay in dollars or Bitcoin.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(`${baseUrl}/`),
		homepageData
	};
}
