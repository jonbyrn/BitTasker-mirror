
import { BITTASKER_LOGO } from '$lib/utils/constants/seo.constants';

export async function load({ url }) {
	const seo = {
		title: 'Contact BitTasker - Support & Partnership Inquiries',
		description: 'Get in touch with BitTasker for support, partnership opportunities, or general inquiries. Contact our team for help with our Bitcoin task marketplace.',
		keywords: 'contact BitTasker, customer support, partnership inquiries, Bitcoin marketplace support, task platform help, cryptocurrency support',
		canonical: url.href,
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		ogTitle: 'Contact BitTasker - Support & Partnership Inquiries',
		ogDescription: 'Need help with BitTasker? Contact our support team for assistance with our Bitcoin task marketplace platform.',
		twitterTitle: 'Contact BitTasker Support Team',
		twitterDescription: 'Get help with BitTasker\'s Bitcoin task marketplace. Contact our support team for assistance.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'ContactPage',
			mainEntity: {
				contactPoint: {
					'@type': 'ContactPoint',
					email: 'hello@bittasker.com',
					contactType: 'customer service',
					availableLanguage: ['English', 'Spanish']
				}
			}
		}
	};

	return {
		seo
	};
}
