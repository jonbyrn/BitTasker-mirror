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
		title: 'BitTasker - The Decentralized Workforce',
		description:
			'Find help or find work. Pay with dollars or Bitcoin. The payment stays locked until you approve the work.',
		keywords: 'BitTasker, find help, find work, dollars, Bitcoin, tasks, services, gig economy',
		canonical: `${baseUrl}/`,
		ogTitle: 'BitTasker - The Decentralized Workforce',
		ogDescription:
			'Find help or find work. Pay with dollars or Bitcoin. The payment stays locked until you approve the work.',
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription:
			'Find help or find work. Pay with dollars or Bitcoin. The payment stays locked until you approve the work.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(`${baseUrl}/`),
		homepageData
	};
}
