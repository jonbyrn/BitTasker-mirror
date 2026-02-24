import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export async function load({ url }) {
	return {
		title: 'BitTasker - The Decentralized Workforce',
		description: 'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker - the Bitcoin-powered task marketplace.',
		keywords: 'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow, freelancers, gig economy, Bitcoin payments',
		canonical: url.href,
		ogTitle: 'BitTasker - The Decentralized Workforce',
		ogDescription: 'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker.',
		ogImage: `${baseUrl}/images/Logos/BitTasker-square-logo-jsonld-org.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription: 'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Join the decentralized workforce on BitTasker.',
		twitterImage: `${baseUrl}/images/Logos/BitTasker-square-logo-jsonld-org.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(url.href)
	};
}

