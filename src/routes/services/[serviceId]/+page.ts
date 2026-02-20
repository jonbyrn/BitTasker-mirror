import type { PageLoad } from './$types';
import type { Service } from '$lib/types/service.d';
import { redirect } from '@sveltejs/kit';
import {
	findServiceByUniqueId,
	findServiceByNaddr,
	findServiceByEventId
} from '$lib/nostr/service';

const SITE_URL = 'https://bittasker.com';

export const prerender = false;

function isNaddr(str: string): boolean {
	return str.startsWith('nservice1') || str.startsWith('naddr1');
}

function isEventId(str: string): boolean {
	return /^[0-9a-fA-F]{64}$/.test(str);
}

export const load: PageLoad = async ({ params }) => {
	const serviceId = params.serviceId;
	let service: Service | null = null;
	let canonicalId = serviceId;
	let shouldRedirect = false;

	if (isNaddr(serviceId)) {
		service = await findServiceByNaddr(serviceId);
		if (service?.uniqueId) {
			canonicalId = service.uniqueId;
			shouldRedirect = true;
		}
	} else if (isEventId(serviceId)) {
		service = await findServiceByEventId(serviceId);
		if (service?.uniqueId) {
			canonicalId = service.uniqueId;
			shouldRedirect = true;
		}
	} else {
		service = await findServiceByUniqueId(serviceId);
		canonicalId = service?.uniqueId ?? serviceId;
	}

	if (shouldRedirect && canonicalId && canonicalId !== serviceId) {
		redirect(301, `/services/${canonicalId}`);
	}

	const canonicalUrl = `${SITE_URL}/services/${canonicalId}`;

	const defaultSeo = {
		title: 'Service Details - BitTasker',
		description:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		keywords: 'bitcoin services, freelance, gig economy, service marketplace, bitcoin payments',
		canonical: canonicalUrl,
		ogTitle: 'Service Details - BitTasker',
		ogDescription:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		ogImage: `${SITE_URL}/images/og-task-default.jpg`,
		twitterTitle: 'Service Details - BitTasker',
		twitterDescription:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		twitterImage: `${SITE_URL}/images/og-task-default.jpg`,
		jsonLd: null
	};

	if (service) {
		const title = service.title || 'Untitled Service';
		const desc =
			service.description?.replace(/\s+/g, ' ').slice(0, 157) + (service.description?.length > 157 ? '...' : '') ||
			'No description available';
		const firstImage = service.portfolio?.find(
			(a) => a.url && !/\.(mp4|webm|ogg|mov)$/i.test(a.url)
		);
		const image = firstImage?.url || `${SITE_URL}/images/og-task-default.jpg`;

		defaultSeo.title = `${title} - BitTasker`;
		defaultSeo.description = desc;
		defaultSeo.ogTitle = title;
		defaultSeo.ogDescription = desc;
		defaultSeo.ogImage = image;
		defaultSeo.twitterTitle = title;
		defaultSeo.twitterDescription = desc;
		defaultSeo.twitterImage = image;
		defaultSeo.jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'Service',
			name: title,
			description: service.description,
			url: canonicalUrl,
			provider: service.creator
				? {
						'@type': 'Person',
						name: service.creator.username
					}
				: undefined
		};
	}

	return {
		service,
		serviceId: canonicalId,
		seo: defaultSeo
	};
};
