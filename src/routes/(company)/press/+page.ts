import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	const seo = {
		title: 'Press & Media - BitTasker | Company News & Media Coverage',
		description: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		keywords: 'BitTasker press, media coverage, company news, Bitcoin marketplace news, press releases, media kit, partnership announcements, startup news',
		canonical: 'https://bittasker.com/press',
		ogTitle: 'Press & Media - BitTasker | Company News & Media Coverage',
		ogDescription: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		twitterTitle: 'Press & Media - BitTasker | Company News & Media Coverage',
		twitterDescription: 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits and company updates.',
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Press & Media - BitTasker',
			'description': 'Latest news, press releases, and media coverage about BitTasker, the decentralized Bitcoin task marketplace. Get media kits, company updates, and partnership announcements.',
			'url': 'https://bittasker.com/press',
			'isPartOf': {
				'@type': 'WebSite',
				'name': 'BitTasker',
				'url': 'https://bittasker.com'
			},
			'about': {
				'@type': 'Organization',
				'name': 'BitTasker',
				'description': 'Decentralized Bitcoin task marketplace connecting taskers and taskees globally',
				'url': 'https://bittasker.com',
				'sameAs': [
					'https://twitter.com/BitTaskerdotcom',
					'https://www.linkedin.com/company/bittasker',
					'https://www.facebook.com/BitTaskerdotcom/'
				]
			},
			'mainEntity': {
				'@type': 'NewsArticle',
				'headline': 'BitTasker Press & Media Information',
				'description': 'Official press information and media resources for BitTasker',
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
			'contactPoint': {
				'@type': 'ContactPoint',
				'contactType': 'Press Inquiries',
				'email': 'press@bittasker.com',
				'availableLanguage': 'English'
			}
		}
	};

	return {
		seo
	};
};
