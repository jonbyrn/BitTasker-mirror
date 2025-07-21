

export async function load({ url }) {
	const seo = {
		title: 'Bitcoin Escrow Service - Secure Task Payments | BitTasker',
		description: 'Learn about BitTasker\'s secure Bitcoin escrow system that protects both taskers and taskees. Powered by multi-signature wallets and Bitcoin\'s security.',
		keywords: 'Bitcoin escrow, secure Bitcoin payments, Lightning Network escrow, multisig wallet, Bitcoin task escrow, cryptocurrency escrow service, secure task payments, Bitcoin smart contracts, Liquid Network escrow',
		canonical: url.href,
		ogTitle: 'Bitcoin Escrow Service - Secure Task Payments',
		ogDescription: 'BitTasker\'s advanced Bitcoin escrow system protects both parties in task transactions using multi-signature wallets and automated smart contracts.',
		twitterTitle: 'Bitcoin Escrow - Secure Task Payments on BitTasker',
		twitterDescription: 'Learn how BitTasker\'s Bitcoin escrow system uses multi-signature wallets and smart contracts to secure task payments on the Liquid Network.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'How BitTasker\'s Bitcoin Escrow Works',
			description: 'Learn how BitTasker\'s secure Bitcoin escrow system protects both taskers and taskees using multi-signature wallets and Bitcoin\'s security.',
			url: url.href,
			mainEntity: {
				'@type': 'HowTo',
				name: 'Understanding the BitTasker Escrow System',
				description: 'A guide to how BitTasker secures payments through its on-platform escrow feature.',
				step: [
					{
						'@type': 'HowToStep',
						name: 'Funding the Escrow',
						text: 'When a task is awarded, the tasker funds a 2-of-2 multi-signature escrow wallet, ensuring payment is secured before work begins.'
					},
					{
						'@type': 'HowToStep',
						name: 'Completing the Task',
						text: 'The taskee completes the work as agreed. The platform facilitates communication and progress tracking.'
					},
					{
						'@type': 'HowToStep',
						name: 'Releasing Funds',
						text: 'Once the tasker approves the completed work, the funds are automatically released from the escrow to the taskee\'s wallet via pre-signed transactions.'
					}
				]
			}
		}
	};

	return {
		seo
	};
}
