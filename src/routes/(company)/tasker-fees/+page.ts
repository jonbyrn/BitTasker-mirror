export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Tasker Fees & Pricing - BitTasker | Bitcoin Task Costs',
		description:
			"Discover BitTasker's transparent tasker fee structure with tiered pricing that rewards loyalty. Learn about our competitive rates for posting Bitcoin tasks.",
		keywords:
			'BitTasker tasker fees, task posting fees, Bitcoin marketplace pricing, transparent pricing, task platform costs, cryptocurrency task fees, tiered pricing structure',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Tasker Fees & Pricing - BitTasker',
		ogDescription:
			"Learn about BitTasker's transparent tasker fee structure with tiered pricing that rewards active users. Competitive rates for posting tasks.",
		twitterTitle: 'BitTasker Tasker Fees - Transparent Pricing',
		twitterDescription:
			"Discover BitTasker's competitive tasker fees with loyalty-based tiered pricing. Post tasks on our Bitcoin marketplace.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Tasker Fees & Pricing - BitTasker',
			description:
				'Transparent fee structure for task posters on BitTasker with tiered pricing based on activity level',
			url: `${baseUrl}${url.pathname}`,

			mainEntity: {
				'@type': 'PriceSpecification',
				name: 'BitTasker Tasker Fees',
				description:
					'Transparent fee structure for task posters on BitTasker with tiered pricing based on activity level',
				priceCurrency: 'USD',
				priceRange: '1.5% - 2.5%',
				offers: [
					{
						'@type': 'Offer',
						name: 'Nakamoto Newbie',
						description: 'For taskers posting 0-3 tasks in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.5,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Satoshi Stacker',
						description: 'For taskers posting 4-10 tasks in the last 30 days',
						priceSpecification: {
							'@type': 'PriceSpecification',
							price: 2.0,
							priceCurrency: 'PERCENT'
						}
					},
					{
						'@type': 'Offer',
						name: 'Hash Master',
						description: 'For taskers posting 11+ tasks in the last 30 days',
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
