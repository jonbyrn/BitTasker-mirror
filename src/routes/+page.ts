import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { generateHomepageWebsiteJsonLd } from '$lib/utils/constants/seo.constants';
import { getPendingDeepLink, consumeDeepLink } from '$lib/utils/deep-link';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export async function load({ url }) {
	if (browser) {
		// If the app was opened via a deep link, navigate there instead of the default redirect
		const deepLink = getPendingDeepLink();
		if (deepLink) {
			await consumeDeepLink();
			redirect(303, deepLink);
		}

		const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		if (token) {
			redirect(303, '/dashboard');
		}
	}

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
		ogImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		ogLocale: 'en_US',
		twitterTitle: 'BitTasker - The Decentralized Workforce',
		twitterDescription:
			'Hire skilled professionals for any task. Pay with Bitcoin, Lightning, or dollars. Join the decentralized workforce on BitTasker.',
		twitterImage: `${baseUrl}/images/logos/bittasker-logomark-og.webp`,
		jsonLd: generateHomepageWebsiteJsonLd(url.href)
	};
}
