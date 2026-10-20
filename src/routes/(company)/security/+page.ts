
import type { PageLoad } from './$types';


export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Security & Safety - BitTasker | Bitcoin Platform Security',
		description: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		keywords: 'BitTasker security, Bitcoin security, platform safety, transaction security, escrow, cryptocurrency safety, user protection, secure payments',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Security & Safety - BitTasker | Bitcoin Security & Platform Safety',
		ogDescription: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		twitterTitle: 'Security & Safety - BitTasker | Bitcoin Security & Platform Safety',
		twitterDescription: 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Security & Safety - BitTasker',
			'description': 'Learn about BitTasker\'s security measures, Bitcoin safety practices, and platform protection features. Discover how we keep your transactions and data secure.',
			'url': `${baseUrl}${url.pathname}`,

			'mainEntity': {
				'@type': 'Article',
				'headline': 'Security & Safety - BitTasker Platform Protection',
				'description': 'Comprehensive security measures and best practices for Bitcoin transactions and user safety',
				'datePublished': '2024-01-15',
				'dateModified': '2024-01-15'
			}
		}
	};
};
