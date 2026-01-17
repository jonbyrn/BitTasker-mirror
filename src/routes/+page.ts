import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';

export async function load({ url }) {
	return {
		title: 'BitTasker - The Decentralized Workforce',
		description: 'Hire skilled professionals for any task. Pay with Bitcoin or dollars. Built on Nostr. Join the decentralized workforce on BitTasker.',
		keywords: 'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow, freelancers, gig economy, Bitcoin payments',
		canonical: url.href,
		ogTitle: 'BitTasker - The Decentralized Workforce',
		ogDescription: 'Hire skilled professionals for any task. Pay with Bitcoin or dollars. Join the decentralized workforce on BitTasker.',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription: 'Hire skilled professionals for any task. Pay with Bitcoin or dollars. Join the decentralized workforce.',
		jsonLd: generateHomepageWebsiteJsonLd(url.href)
	};
}

