import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	const seo = {
		title: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		description: 'Read BitTasker\'s terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.',
		keywords: 'BitTasker terms of service, user agreement, legal terms, Bitcoin marketplace terms, platform agreement, user rights, service conditions, legal compliance',
		canonical: 'https://bittasker.com/terms',
		ogTitle: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		ogDescription: 'Read BitTasker\'s terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.',
		twitterTitle: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		twitterDescription: 'Read BitTasker\'s terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.',
		image: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Terms of Service - BitTasker',
			'description': 'Read BitTasker\'s terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.',
			'url': 'https://bittasker.com/terms',
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
				'@type': 'WebPageElement',
				'name': 'Terms of Service',
				'description': 'Legal terms and conditions governing the use of the BitTasker platform',
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
						'name': 'Terms of Service',
						'item': 'https://bittasker.com/terms'
					}
				]
			}
		}
	};

	return {
		seo
	};
};
