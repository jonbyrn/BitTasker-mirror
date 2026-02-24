import type { PageLoad } from './$types';
import type { Service } from '$lib/types/service.d';
import { findServiceByUniqueId } from '$lib/nostr/service';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	const serviceId = params.serviceId;
	const service: Service | null = await findServiceByUniqueId(serviceId);
	const canonicalId = service?.uniqueId ?? serviceId;

	const canonicalUrl = `${baseUrl}/services/${canonicalId}`;

	const defaultSeo = {
		title: 'Service Details - BitTasker',
		description:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		keywords: 'bitcoin services, freelance, gig economy, service marketplace, bitcoin payments',
		canonical: canonicalUrl,
		ogTitle: 'Service Details - BitTasker',
		ogDescription:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		ogImage: `${baseUrl}/images/og-task-default.jpg`,
		twitterTitle: 'Service Details - BitTasker',
		twitterDescription:
			'View service details on BitTasker, the Bitcoin-powered task and service marketplace.',
		twitterImage: `${baseUrl}/images/og-task-default.jpg`,
		jsonLd: null
	};

	if (service) {
		const title = service.title || 'Untitled Service';
		const desc =
			service.description?.replace(/\s+/g, ' ').slice(0, 157) +
				(service.description?.length > 157 ? '...' : '') || 'No description available';
		const firstImage = service.portfolio?.find(
			(a) => a.url && !/\.(mp4|webm|ogg|mov)$/i.test(a.url)
		);
		const image = firstImage?.url || `${baseUrl}/images/og-task-default.jpg`;

		defaultSeo.title = `${title} - BitTasker`;
		defaultSeo.description = desc;
		defaultSeo.ogTitle = title;
		defaultSeo.ogDescription = desc;
		defaultSeo.ogImage = image;
		defaultSeo.twitterTitle = title;
		defaultSeo.twitterDescription = desc;
		defaultSeo.twitterImage = image;
		defaultSeo.jsonLd = null;

		return {
			service,
			serviceId: canonicalId,
			seo: defaultSeo
		};
	}
};
