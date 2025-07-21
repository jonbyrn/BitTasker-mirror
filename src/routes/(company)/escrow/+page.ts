import { BITTASKER_LOGO } from '$lib/utils/constants/seo.constants';

export async function load({ url }) {
	const seo = {
		title: 'Bitcoin Escrow Service - Secure Task Payments | BitTasker',
		description: 'Learn about BitTasker\'s secure Bitcoin escrow system that protects both taskers and taskees. Powered by multi-signature wallets and Bitcoin\'s security.',
		keywords: 'Bitcoin escrow, secure Bitcoin payments, Lightning Network escrow, multisig wallet, Bitcoin task escrow, cryptocurrency escrow service, secure task payments, Bitcoin smart contracts, Liquid Network escrow',
		canonical: url.href,
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		ogTitle: 'Bitcoin Escrow Service - Secure Task Payments',
		ogDescription: 'BitTasker\'s advanced Bitcoin escrow system protects both parties in task transactions using multi-signature wallets and automated smart contracts.',
		twitterTitle: 'Bitcoin Escrow - Secure Task Payments on BitTasker',
		twitterDescription: 'Learn how BitTasker\'s Bitcoin escrow system uses multi-signature wallets and smart contracts to secure task payments on the Liquid Network.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'Service',
			name: 'Bitcoin Escrow Service',
			serviceType: 'Bitcoin Escrow',
			description: 'Secure Bitcoin escrow service for task-based transactions using multi-signature wallets and smart contracts.',
			areaServed: 'Worldwide',
			hasOfferCatalog: {
				'@type': 'OfferCatalog',
				name: 'Bitcoin Escrow Features',
				itemListElement: [
					{
						'@type': 'Offer',
						itemOffered: {
							'@type': 'Service',
							name: '2-of-2 Multi-Signature Wallet',
							description: 'Secure escrow using cryptographic multi-signature technology'
						}
					},
					{
						'@type': 'Offer',
						itemOffered: {
							'@type': 'Service',
							name: 'Automated Smart Contracts',
							description: 'Pre-signed transactions with automatic execution'
						}
					},
					{
						'@type': 'Offer',
						itemOffered: {
							'@type': 'Service',
							name: 'Liquid Network Integration',
							description: 'Fast, confidential Bitcoin sidechain transactions'
						}
					}
				]
			}
		}
	};

	return {
		seo
	};
}
