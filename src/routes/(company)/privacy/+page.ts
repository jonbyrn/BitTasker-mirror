
import type { PageLoad } from './$types';


export const load: PageLoad = async () => {
	const seo = {
		title: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		description: 'Learn about BitTasker\'s privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.',
		keywords: 'BitTasker privacy policy, data protection, user privacy, Bitcoin marketplace privacy, personal information security, GDPR compliance, data handling practices',
		canonical: 'https://bittasker.com/privacy',
		ogTitle: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		ogDescription: 'Learn about BitTasker\'s privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.',
		twitterTitle: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		twitterDescription: 'Learn about BitTasker\'s privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.',
		image: BITTASKER_LOGO,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Privacy Policy - BitTasker',
			'description': 'Learn about BitTasker\'s privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.',
			'url': 'https://bittasker.com/privacy',
			'isPartOf': BITTASKER_WEBSITE_JSONLD,
			'about': BITTASKER_ORG_JSONLD,
			'mainEntity': {
				'@type': 'WebPageElement',
				'name': 'Privacy Policy',
				'description': 'Official privacy policy governing the collection, use, and protection of user data',
				'author': {
					'@type': 'Organization',
					'name': 'BitTasker'
				},
				'publisher': {
					'@type': 'Organization',
					'name': 'BitTasker',
					'logo': {
						'@type': 'ImageObject',
						'url': 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg'
					}
				},
				'datePublished': '2024-01-15',
				'dateModified': '2025-07-13'
			},
			'breadcrumb': {
				'@type': 'BreadcrumbList',
				'itemListElement': [
					{
						'@type': 'ListItem',
						'position': 1,
						'name': 'Home',
						'item': 'https://bittasker.com'
					},
					{
						'@type': 'ListItem',
						'position': 2,
						'name': 'Privacy Policy',
						'item': 'https://bittasker.com/privacy'
					}
				]
			}
		}
	};

	return {
		seo
	};
};
