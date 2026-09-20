// @ts-nocheck
import type { PageLoad } from './$types';
import type { Task } from '$lib/types/task';
import { nip19 } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import type { NostrEvent } from '$lib/types/nostr';
import { getTaskRelay, ndk } from '$lib/nostr/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

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

type TaskAddressPointer = {
	dTag: string;
	author?: string;
};

/**
 * Check if a string is an npub (bech32 encoded public key)
 */
function isNpub(str: string): boolean {
	return str.startsWith('npub1');
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

function normalizeAuthorParam(author: string | null): string | undefined {
	if (!author) return undefined;
	if (/^[0-9a-fA-F]{64}$/.test(author)) return author.toLowerCase();
	if (isNpub(author)) return npubToHex(author);
	return undefined;
}

function parseTaskAddressPointer(value: string): TaskAddressPointer | null {
	const decodedValue = decodeURIComponent(value);
	const [kind, author, ...dTagParts] = decodedValue.split(':');
	if (kind !== String(KINDS.TASK_CREATION) || !author || dTagParts.length === 0) return null;
	const normalizedAuthor = normalizeAuthorParam(author);
	const dTag = dTagParts.join(':');
	if (!normalizedAuthor || !dTag) return null;
	return { dTag, author: normalizedAuthor };
}

/**
 * Find task event by d-tag (Addressable Event: kind:pubkey:d-tag).
 */
async function findTaskByDTag(
	dTagValue: string,
	author?: string
): Promise<{ data: NostrEvent } | null> {
	try {
		const filter: NDKFilter = {
			kinds: [KINDS.TASK_CREATION],
			'#d': [dTagValue],
			limit: 1
		};
		if (author) {
			filter.authors = [author];
		}

		const ndkEvent = await ndk.fetchEvent(
			filter,
			{ closeOnEose: true },
			getTaskRelay()
		);
		if (ndkEvent) {
			return { data: (await ndkEvent.toNostrEvent()) as NostrEvent };
		}
		return null;
	} catch (error) {
		console.error('Error finding task by d-tag:', error);
		return null;
	}
}

export const load = async ({ params, url }: Parameters<PageLoad>[0]) => {
	const addressPointer = parseTaskAddressPointer(params.taskId);
	const queryAuthor = normalizeAuthorParam(url.searchParams.get('author'));
	const taskId = addressPointer?.dTag ?? params.taskId;
	const taskAuthor = addressPointer?.author ?? queryAuthor;
	const result = await findTaskByDTag(taskId, taskAuthor);
	const event = result?.data ?? null;
	const uniqueId = taskId;
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
