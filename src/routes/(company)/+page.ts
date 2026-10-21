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
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker - the Bitcoin-powered task marketplace.',
		keywords:
			'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow, freelancers, gig economy, Bitcoin payments',
		canonical: `${baseUrl}/`,
		ogTitle: 'BitTasker - The Decentralized Workforce',
		ogDescription:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker.',
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Join the decentralized workforce on BitTasker.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(`${baseUrl}/`),
		homepageData
	};
}
