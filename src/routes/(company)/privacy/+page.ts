import type { PageLoad } from './$types';

/**
 * Load function for the privacy policy page.
 * Returns the SEO metadata for the page.
 */
export const load: PageLoad = async ({ url }) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		description: "Learn about BitTasker's privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.",
		keywords: 'BitTasker privacy policy, data protection, user privacy, GDPR, CCPA, personal data, Bitcoin privacy, secure data handling',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		ogDescription: "Learn about BitTasker's privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.",
		twitterTitle: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		twitterDescription: "Learn about BitTasker's privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Privacy Policy - BitTasker',
			description: "Learn about BitTasker's privacy policy, data protection practices, and how we handle your personal information on our Bitcoin task marketplace platform.",
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'WebPageElement',
				name: 'Privacy Policy',
				description: 'Official privacy policy governing the collection, use, and protection of user data',
				datePublished: '2024-01-15',
				dateModified: '2025-07-13'
			}
		}
	};
};
