export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'BitTasker FAQ - Bitcoin Task Marketplace Questions',
		description:
			'Find answers to frequently asked questions about BitTasker, including how to use our Bitcoin task marketplace, secure payment contracts, fees, and payment process.',
		keywords:
			'BitTasker FAQ, Bitcoin task marketplace questions, Lightning Network FAQ, Bitcoin secure payment contracts, task marketplace help, cryptocurrency gig economy, Bitcoin payment questions',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'BitTasker FAQ - Your Questions Answered',
		ogDescription:
			"Get answers to common questions about BitTasker's Bitcoin task marketplace, including how our secure payment contract system works, fees, and payment process.",
		twitterTitle: 'BitTasker FAQ - Common Questions Answered',
		twitterDescription:
			"Find answers to frequently asked questions about using BitTasker's Bitcoin-powered task marketplace and secure payment contract system.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: [
				{
					'@type': 'Question',
					name: 'What is BitTasker?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'BitTasker is a trusted community platform that connects people who need to outsource tasks and find local services with people who are looking to earn money and ready to work.'
					}
				},
				{
					'@type': 'Question',
					name: "How does BitTasker's secure payment contract system work?",
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Our Bitcoin secure payment contract system uses RGB protocol on Bitcoin to hold payments until tasks are completed satisfactorily, protecting both task posters and workers.'
					}
				},
				{
					'@type': 'Question',
					name: 'What fees does BitTasker charge?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'BitTasker charges the same fee for every asset, including Bitcoin, rBTC, and USDT. Each side pays 2.5%, 2.0%, or 1.5% based on activity in the past 30 days. A repeat partnership is 1% per side.'
					}
				},
				{
					'@type': 'Question',
					name: 'How do I get paid on BitTasker?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Payments are made instantly via Bitcoin Lightning Network once tasks are completed and approved. You can also convert to fiat currency if needed.'
					}
				}
			]
		}
	};
}
