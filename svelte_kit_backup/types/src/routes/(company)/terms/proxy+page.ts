// @ts-nocheck
import type { PageLoad } from './$types';

export const load = async ({ url }: Parameters<PageLoad>[0]) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		description:
			"Read BitTasker's terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.",
		keywords:
			'BitTasker terms of service, user agreement, legal terms, Bitcoin marketplace terms, platform agreement, user rights, service conditions, legal compliance',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		ogDescription:
			"Read BitTasker's terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.",
		twitterTitle: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		twitterDescription:
			"Read BitTasker's terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Terms of Service - BitTasker',
			description:
				"Read BitTasker's terms of service, user agreement, and legal terms. Understand your rights and responsibilities when using our Bitcoin task marketplace platform.",
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'WebPageElement',
				name: 'Terms of Service',
				description: 'Legal terms and conditions governing the use of the BitTasker platform',
				datePublished: '2024-01-15',
				dateModified: '2026-03-13'
			}
		}
	};
};
