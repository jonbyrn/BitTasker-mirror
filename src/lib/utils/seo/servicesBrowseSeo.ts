import { BITTASKER_CANONICAL_BASE } from '$lib/utils/constants/seo.constants';

export interface ServicesBrowseSeoPayload {
	title: string;
	description: string;
	canonical: string;
	ogImage: string;
	jsonLd: Record<string, unknown>;
}

/** Builds the canonical browse-route SEO payload for `/services`, including OG/Twitter image parity and JSON-LD. */
export function getServicesBrowseSeo(baseUrl: string = BITTASKER_CANONICAL_BASE): ServicesBrowseSeoPayload {
	const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
	const canonical = `${normalizedBaseUrl}/services`;
	const ogImage = `${normalizedBaseUrl}/images/og-task-default.jpg`;
	const title = 'Services - BitTasker';
	const description = 'Browse and search for services on BitTasker.';

	return {
		title,
		description,
		canonical,
		ogImage,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: title,
			description,
			url: canonical,
			mainEntity: {
				'@type': 'ItemList',
				name: 'BitTasker Services'
			}
		}
	};
}
