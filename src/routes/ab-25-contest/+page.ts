export async function load({ url }: { url: URL }) {
	return {
		title: 'Adopting Bitcoin 2025 Contest - Win 1 Million Sats | BitTasker',
		description:
			'Join the BitTasker contest at Adopting Bitcoin 2025! Complete the most tasks and win 1 Million Sats. Follow us on X and Nostr to qualify.',
		keywords:
			'BitTasker, Adopting Bitcoin, contest, 1 million sats, Bitcoin tasks, Bitcoin marketplace, AB25',
		canonical: url.href,
		image: 'https://bittasker.com/images/logos/bittasker-logomark.svg',
		ogTitle: 'Adopting Bitcoin 2025 Contest - Win 1 Million Sats',
		ogDescription:
			'Complete the most tasks on BitTasker by the end of Adopting Bitcoin and win 1 Million Sats! Get the app and start playing now.',
		twitterTitle: 'Adopting Bitcoin 2025 Contest - Win 1 Million Sats',
		twitterDescription:
			'Join the BitTasker contest at Adopting Bitcoin 2025! Complete tasks and win 1 Million Sats delivered to your non-custodial wallet.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Adopting Bitcoin 2025 Contest',
			description: 'BitTasker contest at Adopting Bitcoin 2025 - Win 1 Million Sats',
			url: url.href
		}
	};
}
