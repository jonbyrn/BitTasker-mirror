import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';

const SITE_URL = 'https://bittasker.com';

export async function load({ url }) {
	return {
		title: 'BitTasker - The Decentralized Workforce',
		description:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker - the Bitcoin-powered task marketplace.',
		keywords:
			'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow, freelancers, gig economy, Bitcoin payments',
		canonical: url.href,
		ogTitle: 'BitTasker - The Decentralized Workforce',
		ogDescription:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Built on Nostr. Join the decentralized workforce on BitTasker.',
		ogImage: `${SITE_URL}/images/_logos_tmp/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Join the decentralized workforce on BitTasker.',
		twitterImage: `${SITE_URL}/images/_logos_tmp/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(url.href)
	};
}
