
import type { PageLoad } from './$types';


export const load: PageLoad = async () => {
	const seo = {
		title: 'Security & Safety - BitTasker | Bitcoin Platform Security',
		description: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		keywords: 'BitTasker security, Bitcoin security, platform safety, transaction security, multisig wallet security, cryptocurrency safety, user protection, secure payments',
		canonical: 'https://bittasker.com/security',
		ogTitle: 'Security & Safety - BitTasker | Bitcoin Security & Platform Safety',
		ogDescription: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		twitterTitle: 'Security & Safety - BitTasker | Bitcoin Security & Platform Safety',
		twitterDescription: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Security & Safety - BitTasker',
			'description': 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
			'url': 'https://bittasker.com/security',

			'mainEntity': {
				'@type': 'Article',
				'headline': 'Security & Safety - BitTasker Platform Protection',
				'description': 'Comprehensive security measures and best practices for Bitcoin transactions and user safety',
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
				'dateModified': '2024-01-15'
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
						'name': 'Security',
						'item': 'https://bittasker.com/security'
					}
				]
			}
		}
	};

	return {
		seo
	};
};
