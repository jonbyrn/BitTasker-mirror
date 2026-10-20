export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Taskee Fees & Earnings - BitTasker | Bitcoin Workers',
		description:
			"Learn about BitTasker's taskee fee structure and maximize your Bitcoin earnings. Transparent pricing with loyalty rewards for active workers.",
		keywords:
			'BitTasker taskee fees, Bitcoin earning fees, task worker pricing, cryptocurrency earnings, Bitcoin marketplace fees, decentralized work fees, Lightning Network earnings',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Taskee Fees & Earnings - BitTasker',
		ogDescription:
			'Maximize your Bitcoin earnings on BitTasker with our transparent taskee fee structure. Loyalty rewards for active workers.',
		twitterTitle: 'BitTasker Taskee Fees - Maximize Your Bitcoin Earnings',
		twitterDescription:
			"Learn about BitTasker's competitive taskee fees and start earning Bitcoin through our decentralized task marketplace.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Taskee Fees & Earnings - BitTasker',
			description:
				'Transparent fee structure for task workers on BitTasker with tiered pricing based on activity level',
			url: `${baseUrl}${url.pathname}`,

			mainEntity: {
				'@type': 'PriceSpecification',
				name: 'BitTasker Taskee Fees',
				description:
					'Transparent fee structure for task workers on BitTasker with tiered pricing based on activity level',
				priceCurrency: 'USD',
				priceRange: '1.5% - 2.5%',
				offers: [
					{
						'@type': 'Offer',
						name: 'Nakamoto Newbie',
						description: 'For taskees completing 0-3 tasks in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.5,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Satoshi Stacker',
						description: 'For taskees completing 4-10 tasks in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.0,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Hash Master',
						description: 'For taskees completing 11+ tasks in the last 30 days',
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
