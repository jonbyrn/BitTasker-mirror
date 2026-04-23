export async function load({ url }: { url: URL }) {
	return {
		title: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		description:
			"Learn about BitTasker's mission to empower global earning through Bitcoin and decentralized technology. Discover our censorship-resistant task marketplace.",
		keywords:
			'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow',
		canonical: url.href,
		image: 'https://bittasker.com/images/logos/bittasker-logomark.svg',
		ogTitle: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		ogDescription:
			'BitTasker empowers everyday people to earn, trade, and thrive without borders, banks, or barriers. Learn about our mission to build a decentralized future of work.',
		twitterTitle: 'About BitTasker - Powering Human Freedom One Task at a Time',
		twitterDescription:
			'Learn how BitTasker is building a decentralized Bitcoin task marketplace that empowers financial freedom and removes barriers to global earning.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'About BitTasker',
			description:
				"Learn about BitTasker's mission to empower global earning through Bitcoin and decentralized technology.",
			url: url.href
		}
	};
}
