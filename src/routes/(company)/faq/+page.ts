


export async function load({ url }) {
	const seo = {
		title: 'BitTasker FAQ - Bitcoin Task Marketplace Questions',
		description: 'Find answers to frequently asked questions about BitTasker, including how to use our Bitcoin task marketplace, escrow system, fees, and payment process.',
		keywords: 'BitTasker FAQ, Bitcoin task marketplace questions, Lightning Network FAQ, Bitcoin escrow questions, task marketplace help, cryptocurrency gig economy, Bitcoin payment questions',
		canonical: url.href,
		ogTitle: 'BitTasker FAQ - Your Questions Answered',
		ogDescription: 'Get answers to common questions about BitTasker\'s Bitcoin task marketplace, including how our escrow system works, fees, and payment process.',
		twitterTitle: 'BitTasker FAQ - Common Questions Answered',
		twitterDescription: 'Find answers to frequently asked questions about using BitTasker\'s Bitcoin-powered task marketplace and escrow system.',
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
					name: 'How does BitTasker\'s Bitcoin escrow work?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Our Bitcoin escrow system holds payments in a secure multi-signature wallet until tasks are completed satisfactorily, protecting both task posters and workers.'
					}
				},
				{
					'@type': 'Question',
					name: 'What fees does BitTasker charge?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'BitTasker uses a tiered fee structure that rewards loyalty. Fees range from 7.5% to 12.5% depending on your activity level in the past 30 days.'
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

	return {
		seo
	};
}
