export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Fees when I need help - BitTasker',
		description:
			'See what you pay when you need help. The fee gets smaller as you finish more jobs.',
		keywords: 'BitTasker fees, posting fees, job costs, transparent pricing',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Fees when I need help - BitTasker',
		ogDescription:
			'See what you pay when you need help. The fee gets smaller as you finish more jobs.',
		twitterTitle: 'BitTasker fees when I need help',
		twitterDescription:
			'See what you pay when you need help. The fee gets smaller as you finish more jobs.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Fees when I need help - BitTasker',
			description: 'What you pay when you need help. The fee gets smaller as you finish more jobs.',
			url: `${baseUrl}${url.pathname}`,

			mainEntity: {
				'@type': 'PriceSpecification',
				name: 'BitTasker fees when I need help',
				description:
					'What you pay when you need help. The fee gets smaller as you finish more jobs.',
				priceCurrency: 'USD',
				priceRange: '1.5% - 2.5%',
				offers: [
					{
						'@type': 'Offer',
						name: 'Nakamoto Newbie',
						description: 'For customers who finish 0-3 jobs in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.5,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Satoshi Stacker',
						description: 'For customers who finish 4-10 jobs in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.0,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Hash Master',
						description: 'For customers who finish 11 or more jobs in the last 30 days',
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
