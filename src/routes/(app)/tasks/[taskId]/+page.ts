import type { PageLoad } from './$types';
import { parseTaskAddressPointer } from '$lib/nostr/findTaskEvent';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export const prerender = false;

/**
 * The task view loads the event itself. Waiting here kept the page on
 * "Loading..." until every relay answered.
 */
export const load: PageLoad = ({ params }) => {
	const addressPointer = parseTaskAddressPointer(params.taskId);
	const taskId = addressPointer?.dTag ?? params.taskId;
	const canonical = `${baseUrl}/tasks/${taskId}`;
	const description =
		'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.';

	return {
		seo: {
			title: 'Task Details - BitTasker',
			description,
			keywords: 'bitcoin tasks, freelance work, gig economy, task marketplace, bitcoin payments',
			canonical,
			ogTitle: 'Task Details - BitTasker',
			ogDescription: description,
			ogImage: `${baseUrl}/images/og-task-default.jpg`,
			twitterTitle: 'Task Details - BitTasker',
			twitterDescription: description,
			twitterImage: `${baseUrl}/images/og-task-default.jpg`,
			jsonLd: null,
			task: null
		},
		taskId
	};
};
