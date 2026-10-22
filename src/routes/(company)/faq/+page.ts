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
						text: 'BitTasker is a non-custodial, KYC-free marketplace built on Nostr. It covers Tasks, Services, Buy & Sell, and Temporary Staff. People pay with Bitcoin and USDT. RGB escrow is peer-to-peer.'
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
						text: 'Bitcoin and USDT use the same fee. Each side pays 2.5%, 2.0%, or 1.5%. The same rates apply to Tasks, Services, Buy & Sell, and Temporary Staff. A repeat partnership is 1% per side.'
					}
				},
				{
					'@type': 'Question',
					name: 'How do I get paid on BitTasker?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'The hirer locks the amount in non-custodial escrow. After the work is approved, they pay the invoice. BitTasker does not take custody of the funds.'
					}
				}
			]
		}
	};
}
