export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Secure Payment Contracts - Protected Payments | BitTasker',
		description: 'Learn about BitTasker\'s secure payment contracts powered by RGB on Bitcoin. Protected payments between clients and freelancers with built-in safeguards, automatic fee handling, and transparent on-chain transactions.',
		keywords: 'secure payment contracts, Bitcoin RGB, Bitcoin payments, secure task payments, blockchain secure payments, protected payments, Bitcoin task payments',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Secure Payment Contracts - Protected Payments',
		ogDescription: 'BitTasker\'s secure payment contracts protect both clients and freelancers using RGB on Bitcoin. Built-in safeguards, automatic payments, and transparent on-chain transactions.',
		twitterTitle: 'Secure Payment Contracts - Protected Payments on BitTasker',
		twitterDescription: 'Learn how BitTasker\'s secure payment contracts use RGB on Bitcoin to protect payments between clients and freelancers with automatic safeguards.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'How BitTasker\'s Secure Payment Contracts Work',
			description: 'Learn how BitTasker\'s secure payment contracts protect both clients and freelancers using RGB on Bitcoin with built-in safeguards.',
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'HowTo',
				name: 'Understanding the BitTasker Secure Payment Contract System',
				description: 'A guide to how BitTasker secures payments through its RGB on Bitcoin system.',
				step: [
					{
						'@type': 'HowToStep',
						name: 'Create Your Contract',
						text: 'Client creates a contract with the freelancer, funds it with Bitcoin, and sets when work should start and finish. Funds are held securely until the task is done.'
					},
					{
						'@type': 'HowToStep',
						name: 'Complete Your Task',
						text: 'Freelancer marks task complete after the start time. Client has 7 days to review and accept, or payment goes to the freelancer automatically.'
					},
					{
						'@type': 'HowToStep',
						name: 'Resolve Disputes',
						text: 'If there\'s a dispute, either party can propose a resolution. After 14 days without resolution, the client can claim a full refund.'
					},
					{
						'@type': 'HowToStep',
						name: 'Automatic Payment',
						text: 'Once the client accepts or the 7-day period expires, payment is automatically released to the freelancer with platform fees deducted automatically.'
					}
				]
			}
		}
	};
}
