export async function load({ url }) {
	const seo = {
		title: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		description: 'Learn about BitTasker\'s mission to empower global earning through Bitcoin and decentralized technology. Discover our censorship-resistant task marketplace.',
		keywords: 'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow',
		canonical: url.href,
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		ogTitle: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		ogDescription: 'BitTasker empowers everyday people to earn, trade, and thrive without borders, banks, or barriers. Learn about our mission to build a decentralized future of work.',
		twitterTitle: 'About BitTasker - Powering Human Freedom One Task at a Time',
		twitterDescription: 'Learn how BitTasker is building a decentralized Bitcoin task marketplace that empowers financial freedom and removes barriers to global earning.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'BitTasker',
			description: 'BitTasker exists to empower everyday people to earn, trade, and thrive—without borders, banks, or barriers. We are building a platform where skills become currency, and Bitcoin becomes the bridge between sovereign individuals.',
			url: 'https://bittasker.com',
			logo: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
			sameAs: [
				'https://twitter.com/BitTaskerdotcom',
				'https://www.linkedin.com/company/bittasker',
				'https://www.facebook.com/BitTaskerdotcom/'
			],
			founder: {
				'@type': 'Person',
				name: 'BitTasker Team'
			},
			foundingDate: '2024',
			industry: 'Technology',
			numberOfEmployees: '1-10',
			slogan: 'Powering Human Freedom One Task at a Time'
		}
	};

	return {
		seo
	};
}
