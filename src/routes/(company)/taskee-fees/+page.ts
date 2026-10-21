export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Fees when I want work - BitTasker',
		description:
			'See what you keep when you want work. The fee gets smaller as you finish more jobs.',
		keywords: 'BitTasker fees, worker fees, job earnings, transparent pricing',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Fees when I want work - BitTasker',
		ogDescription:
			'See what you keep when you want work. The fee gets smaller as you finish more jobs.',
		twitterTitle: 'BitTasker fees when I want work',
		twitterDescription:
			'See what you keep when you want work. The fee gets smaller as you finish more jobs.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Fees when I want work - BitTasker',
			description:
				'What you keep when you want work. The fee gets smaller as you finish more jobs.',
			url: `${baseUrl}${url.pathname}`,

			mainEntity: {
				'@type': 'PriceSpecification',
				name: 'BitTasker fees when I want work',
				description:
					'What you keep when you want work. The fee gets smaller as you finish more jobs.',
				priceCurrency: 'USD',
				priceRange: '1.5% - 2.5%',
				offers: [
					{
						'@type': 'Offer',
						name: 'Nakamoto Newbie',
						description: 'For workers who finish 0-3 jobs in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.5,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Satoshi Stacker',
						description: 'For workers who finish 4-10 jobs in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.0,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Hash Master',
						description: 'For workers who finish 11 or more jobs in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 1.5,
							priceCurrency: 'PERCENT'
						}
					}
				]
			}
		}
	};
}
