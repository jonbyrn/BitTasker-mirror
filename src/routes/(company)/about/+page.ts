export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
	const description =
		'BitTasker is a non-custodial, KYC-free marketplace built on Nostr. Bitcoin and USDT payments use RGB escrow. The company is Bit Tasker, Ltda. de C.V. (El Salvador).';

	return {
		title: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		description,
		keywords:
			'BitTasker, Nostr, Bitcoin, USDT, RGB escrow, non-custodial, KYC-free, Bit Tasker Ltda de C.V., El Salvador',
		canonical: `${baseUrl}${url.pathname}`,
		image: 'https://bittasker.com/images/logos/bittasker-logomark.svg',
		ogTitle: 'About BitTasker',
		ogDescription: description,
		twitterTitle: 'About BitTasker',
		twitterDescription: description,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'About BitTasker',
			description,
			url: `${baseUrl}${url.pathname}`
		}
	};
}
