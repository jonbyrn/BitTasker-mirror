
import type { PageLoad } from './$types';


export const load: PageLoad = async () => {
	const seo = {
		title: 'Taskee Principles - BitTasker | Worker Guidelines',
		description: 'Learn about BitTasker\'s taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.',
		keywords: 'BitTasker taskee principles, worker guidelines, platform values, taskee success, Bitcoin task worker, freelancer principles, gig economy values, worker conduct',
		canonical: 'https://bittasker.com/tasker-principles',
		ogTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		ogDescription: 'Learn about BitTasker\'s taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.',
		twitterTitle: 'Taskee Principles - BitTasker | Worker Guidelines & Platform Values',
		twitterDescription: 'Learn about BitTasker\'s taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Taskee Principles - BitTasker',
			'description': 'Learn about BitTasker\'s taskee principles, worker guidelines, and platform values. Understand how to be a successful taskee on our Bitcoin task marketplace.',
			'url': 'https://bittasker.com/tasker-principles',
			'mainEntity': {
				'@type': 'Article',
				'headline': 'Taskee Principles - BitTasker Worker Guidelines',
				'description': 'Core principles and guidelines for successful taskees on the BitTasker platform',
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
						'name': 'Taskee Principles',
						'item': 'https://bittasker.com/tasker-principles'
					}
				]
			}
		}
	};

	return {
		seo
	};
};
