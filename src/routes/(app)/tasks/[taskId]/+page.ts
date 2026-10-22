import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { recallTask } from '$lib/utils/tasks/task-detail-cache';
import nostrEventsService from '$lib/api/services/nostr/events';
import type { Task } from '$lib/types/task';
import { nip19 } from 'nostr-tools';
import { redirect } from '@sveltejs/kit';
import KINDS from '$lib/utils/constants/kinds';
import type { NostrEvent } from '$lib/types/nostr';

const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

export const prerender = false;

type TaskEventContent = Task & { uniqueId?: string };

type SeoData = {
	title: string;
	description: string;
	keywords: string;
	canonical: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string;
	jsonLd: ReturnType<typeof generateTaskJsonLd> | null;
	task: Task | null;
};

/**
 * Check if a string is a Nostr event ID (64-character hex string)
 */
function isEventId(str: string): boolean {
	return /^[0-9a-fA-F]{64}$/.test(str);
}

/**
 * Check if a string is an npub (bech32 encoded public key)
 */
function isNpub(str: string): boolean {
	return str.startsWith('npub1');
}

/**
 * Check if a string is a UUID (unique ID format)
 */
function isUuid(str: string): boolean {
	// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Convert npub to hex pubkey
 */
function npubToHex(npub: string): string {
	try {
		const decoded = nip19.decode(npub);
		if (decoded.type === 'npub') {
			return decoded.data as string;
		}
		throw new Error('Invalid npub format');
	} catch (error) {
		throw new Error(
			`Failed to decode npub: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Find task event by author (npub or hex pubkey)
 */
async function findTaskByAuthor(pubkey: string): Promise<{ data: NostrEvent } | null> {
	try {
		// Query events by author with task creation kind
		const response = await nostrEventsService.findEvents({
			kinds: [KINDS.TASK_CREATION],
			authors: [pubkey],
			limit: 1
		});

		if (response.data && response.data.length > 0) {
			// Return the most recent task
			return { data: response.data[0] };
		}
		return null;
	} catch (error) {
		console.error('Error finding task by author:', error);
		return null;
	}
}

/**
 * Find task event by d-tag (Addressable Event: kind:pubkey:d-tag).
 * Supports legacy task-{uuid} and readable d-tag (slug-timestamp-suffix).
 */
async function findTaskByDTag(dTagValue: string): Promise<{ data: NostrEvent } | null> {
	try {
		const filter = {
			kinds: [KINDS.TASK_CREATION],
			'#d': [dTagValue],
			limit: 1
		};
		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});
		if (response.data && response.data.length > 0) {
			const event = response.data[0];
			const dTag = event.tags?.find((tag: string[]) => tag[0] === 'd' && tag[1] === dTagValue);
			if (dTag) {
				return { data: event };
			}
		}
		return null;
	} catch (error) {
		console.error('Error finding task by d-tag:', error);
		return null;
	}
}

export const load: PageLoad = async ({ params }) => {
	const taskId = params.taskId;

	// Client navigation must not wait on relays. The page paints a skeleton,
	// or the task remembered from the list / hover prefetch, and then refreshes.
	if (browser) {
		const remembered = recallTask(taskId);
		const canonicalUrl = `${baseUrl}/tasks/${encodeURIComponent(taskId)}`;
		const title = remembered?.title
			? `${remembered.title} - BitTasker`
			: 'Task Details - BitTasker';
		const description =
			remembered?.description ||
			'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.';
		return {
			seo: {
				title,
				description,
				keywords: 'bitcoin tasks, freelance work, gig economy, task marketplace, bitcoin payments',
				canonical: canonicalUrl,
				ogTitle: title,
				ogDescription: description,
				ogImage: `${baseUrl}/images/og-task-default.jpg`,
				twitterTitle: title,
				twitterDescription: description,
				twitterImage: `${baseUrl}/images/og-task-default.jpg`,
				jsonLd: remembered ? generateTaskJsonLd(remembered, canonicalUrl) : null,
				task: remembered
			},
			taskId
		};
	}

	let uniqueId = taskId; // Default to using taskId as uniqueId
	let shouldRedirect = false;

	// Determine if taskId is an event ID, UUID, or npub/pubkey
	let event = null;

	if (isEventId(taskId)) {
		// It's an event ID, load the event and extract uniqueId for redirect
		try {
			const result = await nostrEventsService.findEventById(taskId);
			event = result.data;

			if (event) {
				// Extract uniqueId from the event content
				try {
					const taskData = JSON.parse(event.content) as TaskEventContent;
					if (taskData.uniqueId) {
						uniqueId = taskData.uniqueId;
						shouldRedirect = true; // Redirect to UUID URL for stability
					}
				} catch (parseError) {
					console.error('Error parsing task data from event:', parseError);
				}
			}
		} catch (error) {
			console.error('Error loading task by event ID:', error);
		}
	} else if (isUuid(taskId)) {
		// Legacy: UUID in URL → d-tag was task-{uuid}
		try {
			const result = await findTaskByDTag(`task-${taskId}`);
			if (result?.data) {
				event = result.data;
			}
		} catch (error) {
			console.error('Error loading task by unique ID:', error);
		}
	} else if (isNpub(taskId)) {
		// It's an npub, convert to hex and find task by author
		try {
			const hexPubkey = npubToHex(taskId);
			const result = await findTaskByAuthor(hexPubkey);
			if (result?.data) {
				event = result.data;
				// Extract uniqueId for redirect
				try {
					const taskData = JSON.parse(event.content) as TaskEventContent;
					if (taskData.uniqueId) {
						uniqueId = taskData.uniqueId;
						shouldRedirect = true; // Redirect to UUID URL for stability
					}
				} catch (parseError) {
					console.error('Error parsing task data from event:', parseError);
				}
			}
		} catch (error) {
			console.error('Error loading task by npub:', error);
		}
	} else if (/^[0-9a-fA-F]{64}$/.test(taskId)) {
		// It's a hex pubkey, try to find task by author
		try {
			const result = await findTaskByAuthor(taskId);
			if (result?.data) {
				event = result.data;
				// Extract uniqueId for redirect
				try {
					const taskData = JSON.parse(event.content) as TaskEventContent;
					if (taskData.uniqueId) {
						uniqueId = taskData.uniqueId;
						shouldRedirect = true; // Redirect to UUID URL for stability
					}
				} catch (parseError) {
					console.error('Error parsing task data from event:', parseError);
				}
			}
		} catch (error) {
			console.error('Error loading task by pubkey:', error);
		}
	} else {
		// Readable d-tag (slug-timestamp-suffix): query by d-tag
		try {
			const result = await findTaskByDTag(taskId);
			if (result?.data) {
				event = result.data;
			}
		} catch (error) {
			console.error('Error loading task by d-tag:', error);
		}
		if (!event) {
			try {
				const result = await nostrEventsService.findEventById(taskId);
				event = result.data;
				if (event) {
					const dTag = event.tags?.find((tag: string[]) => tag[0] === 'd')?.[1];
					if (dTag && dTag !== taskId) {
						uniqueId = dTag;
						shouldRedirect = true;
					}
				}
			} catch {
				// Ignore
			}
		}
	}

	// Redirect to UUID URL if we accessed via event ID, npub, or pubkey
	if (shouldRedirect && uniqueId !== taskId && uniqueId) {
		throw redirect(301, `/tasks/${uniqueId}`);
	}
	const canonicalUrl = `${baseUrl}/tasks/${uniqueId}`;

	// Default SEO data
	let seo: SeoData = {
		title: 'Task Details - BitTasker',
		description:
			'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		keywords: 'bitcoin tasks, freelance work, gig economy, task marketplace, bitcoin payments',
		canonical: canonicalUrl,
		ogTitle: 'Task Details - BitTasker',
		ogDescription:
			'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		ogImage: `${baseUrl}/images/og-task-default.jpg`,
		twitterTitle: 'Task Details - BitTasker',
		twitterDescription:
			'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		twitterImage: `${baseUrl}/images/og-task-default.jpg`,
		jsonLd: null,
		task: null as Task | null
	};

	if (event) {
		const taskData = JSON.parse(event.content) as TaskEventContent;
		const dTag = event.tags?.find((tag: string[]) => tag[0] === 'd')?.[1];
		const resolvedTaskId = dTag ?? event.id;

		if (!resolvedTaskId) {
			return {
				seo,
				taskId: uniqueId
			};
		}

		const task: Task = {
			...taskData,
			id: resolvedTaskId,
			npub: event.pubkey
		};

		// Helper function to check if URL is a video
		function isVideoFile(url: string): boolean {
			const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
			const urlLower = url.toLowerCase();
			return videoExtensions.some((ext) => urlLower.endsWith(ext));
		}

		// Get first image attachment (not video) for meta tags
		const firstImage = task.attachments?.find((att) => !isVideoFile(att.url));
		const taskImage = firstImage?.url || `${baseUrl}/images/og-task-default.jpg`;

		// Generate dynamic SEO data based on task content
		const taskTitle = task.title || 'Untitled Task';
		const taskDescription = task.description || 'No description available';
		// For hourly rate tasks, show total (hourly × estimated hours) in link preview so it's not misleading
		const displayAmount =
			task.budget?.type === 'HOURLY' &&
			task.budget.estimatedHours != null &&
			task.budget.estimatedHours > 0 &&
			task.budget.amount != null
				? task.budget.amount * task.budget.estimatedHours
				: task.budget?.amount;
		const taskBudget =
			displayAmount != null && displayAmount > 0 ? `$${displayAmount}` : 'Price not specified';
		const taskLocation =
			task.pickupLocation?.displayName || task.dropOffLocation?.displayName || 'Remote';
		const taskSkills = task.skills?.join(', ') || '';

		// Truncate description for meta tags (keep under 160 characters)
		const truncatedDescription =
			taskDescription.length > 150 ? taskDescription.substring(0, 147) + '...' : taskDescription;

		seo = {
			title: `${taskTitle} - ${taskBudget} - BitTasker`,
			description: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation} | Skills: ${taskSkills}`,
			keywords: `bitcoin task, ${taskSkills}, ${taskLocation}, freelance work, gig economy, task marketplace, bitcoin payments, ${taskTitle.toLowerCase()}`,
			canonical: canonicalUrl,
			ogTitle: `${taskTitle} - ${taskBudget} - BitTasker`,
			ogDescription: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`,
			ogImage: taskImage,
			twitterTitle: `${taskTitle} - ${taskBudget} - BitTasker`,
			twitterDescription: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`,
			twitterImage: taskImage,
			jsonLd: generateTaskJsonLd(task, canonicalUrl),
			task
		};
	}

	return {
		seo,
		taskId: uniqueId // Always use uniqueId for the component (stable identifier)
	};
};

function generateTaskJsonLd(task: Task, canonicalUrl: string) {
	const siteBaseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(
		/\/$/,
		''
	);

	return {
		'@context': 'https://schema.org',
		'@type': 'JobPosting',
		title: task.title,
		description: task.description,
		datePosted: task.createdAt,
		validThrough: task.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
		employmentType: 'CONTRACTOR',
		hiringOrganization: {
			'@type': 'Organization',
			name: 'BitTasker',
			url: siteBaseUrl,
			logo: `${siteBaseUrl}/images/logos/bittasker-logomark.svg`
		},
		jobLocation:
			task.pickupLocation?.displayName || task.dropOffLocation?.displayName
				? {
						'@type': 'Place',
						name: task.pickupLocation?.displayName || task.dropOffLocation?.displayName,
						address: {
							'@type': 'PostalAddress',
							addressLocality: task.pickupLocation?.displayName || task.dropOffLocation?.displayName
						}
					}
				: {
						'@type': 'Place',
						name: 'Remote',
						address: {
							'@type': 'PostalAddress',
							addressLocality: 'Remote'
						}
					},
		baseSalary: (() => {
			const amt =
				task.budget?.type === 'HOURLY' &&
				task.budget.estimatedHours != null &&
				task.budget.estimatedHours > 0 &&
				task.budget.amount != null
					? task.budget.amount * task.budget.estimatedHours
					: task.budget?.amount;
			return amt != null && amt > 0
				? { '@type': 'MonetaryAmount' as const, currency: 'USD', value: amt }
				: undefined;
		})(),
		skills: task.skills || [],
		url: canonicalUrl,
		identifier: {
			'@type': 'PropertyValue',
			name: 'BitTasker Task ID',
			value: task.id
		},
		workHours: 'Flexible',
		jobBenefits: [
			'Bitcoin payments',
			'Decentralized platform',
			'No middleman fees',
			'Global marketplace'
		]
	};
}
