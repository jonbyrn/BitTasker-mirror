import type { PageLoad } from './$types';
import nostrEventsService from '$lib/api/services/nostr/events';
import type { Task } from '$lib/types/task';
import { nip19 } from 'nostr-tools';
import { redirect } from '@sveltejs/kit';
import KINDS from '$lib/utils/constants/kinds';

const SITE_URL = 'https://bittasker.com';

export const prerender = false;

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
		throw new Error(`Failed to decode npub: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Find task event by author (npub or hex pubkey)
 */
async function findTaskByAuthor(pubkey: string): Promise<{ data: any } | null> {
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
 * Find task event by unique ID using the 'd' tag
 */
async function findTaskByUniqueId(uniqueId: string): Promise<{ data: any } | null> {
	try {
		// The uniqueId is stored in the 'd' tag as 'task-{uniqueId}'
		const dTagValue = `task-${uniqueId}`;
		
		// Use requestEvents for proper tag filtering
		// The filter format for Nostr tag queries
		const filter = {
			kinds: [KINDS.TASK_CREATION],
			'#d': [dTagValue],
			limit: 1
		};
		
		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});
		
		if (response.data && response.data.length > 0) {
			// Verify the event actually has the uniqueId in its content or tags
			const event = response.data[0];
			
			// First check tags for the 'd' tag
			const dTag = event.tags?.find((tag: string[]) => tag[0] === 'd' && tag[1] === dTagValue);
			if (dTag) {
				return { data: event };
			}
			
			// Also check the content for uniqueId
			try {
				const taskData = JSON.parse(event.content);
				if (taskData.uniqueId === uniqueId) {
					return { data: event };
				}
			} catch {
				// If parsing fails, we already checked tags above
			}
		}
		return null;
	} catch (error) {
		console.error('Error finding task by unique ID:', error);
		return null;
	}
}

export const load: PageLoad = async ({ params, url }) => {
	const taskId = params.taskId;
	let uniqueId = taskId; // Default to using taskId as uniqueId
	let shouldRedirect = false;
	
	// Determine if taskId is an event ID, UUID, or npub/pubkey
	let event: any = null;
	
	if (isEventId(taskId)) {
		// It's an event ID, load the event and extract uniqueId for redirect
		try {
			const result = await nostrEventsService.findEventById(taskId);
			event = result.data;
			
			if (event) {
				// Extract uniqueId from the event content
				try {
					const taskData = JSON.parse(event.content) as Task;
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
		// It's a unique ID (UUID), find task by uniqueId using 'd' tag
		// No redirect needed - UUID is the stable identifier
		try {
			const result = await findTaskByUniqueId(taskId);
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
					const taskData = JSON.parse(event.content) as Task;
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
					const taskData = JSON.parse(event.content) as Task;
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
		// Try as event ID anyway (fallback)
		try {
			const result = await nostrEventsService.findEventById(taskId);
			event = result.data;
			
			if (event) {
				// Extract uniqueId for redirect
				try {
					const taskData = JSON.parse(event.content) as Task;
					if (taskData.uniqueId) {
						uniqueId = taskData.uniqueId;
						shouldRedirect = true; // Redirect to UUID URL for stability
					}
				} catch (parseError) {
					console.error('Error parsing task data from event:', parseError);
				}
			}
		} catch (error) {
			console.error('Error loading task:', error);
		}
	}
	
	// Redirect to UUID URL if we accessed via event ID, npub, or pubkey
	if (shouldRedirect && uniqueId !== taskId && uniqueId) {
		throw redirect(301, `/tasks/${uniqueId}`);
	}
	
	const canonicalUrl = `${SITE_URL}/tasks/${uniqueId}`;
	
	// Default SEO data
	let seo = {
		title: 'Task Details - BitTasker',
		description: 'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		keywords: 'bitcoin tasks, freelance work, gig economy, task marketplace, bitcoin payments',
		canonical: canonicalUrl,
		ogTitle: 'Task Details - BitTasker',
		ogDescription: 'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		ogImage: `${SITE_URL}/images/og-task-default.jpg`,
		twitterTitle: 'Task Details - BitTasker',
		twitterDescription: 'View task details and submit your bid on BitTasker, the Bitcoin-powered task marketplace.',
		twitterImage: `${SITE_URL}/images/og-task-default.jpg`,
		jsonLd: null as any,
		task: null as Task | null
	};

	if (event) {
		const taskData = JSON.parse(event.content) as Task;
		const task = {
			...taskData,
			id: event.id,
			npub: event.pubkey
		};

		// Generate dynamic SEO data based on task content
		const taskTitle = task.title || 'Untitled Task';
		const taskDescription = task.description || 'No description available';
		const taskBudget = task.budget?.amount ? `$${task.budget.amount}` : 'Price not specified';
		const taskLocation = task.pickupLocation?.displayName || task.dropOffLocation?.displayName || 'Remote';
		const taskSkills = task.skills?.join(', ') || '';
		
		// Truncate description for meta tags (keep under 160 characters)
		const truncatedDescription = taskDescription.length > 150 
			? taskDescription.substring(0, 147) + '...' 
			: taskDescription;

		seo = {
			title: `${taskTitle} - ${taskBudget} - BitTasker`,
			description: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation} | Skills: ${taskSkills}`,
			keywords: `bitcoin task, ${taskSkills}, ${taskLocation}, freelance work, gig economy, task marketplace, bitcoin payments, ${taskTitle.toLowerCase()}`,
			canonical: canonicalUrl,
			ogTitle: `${taskTitle} - ${taskBudget} - BitTasker`,
			ogDescription: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`,
			ogImage: task.attachments?.[0]?.url || `${SITE_URL}/images/og-task-default.jpg`,
			twitterTitle: `${taskTitle} - ${taskBudget} - BitTasker`,
			twitterDescription: `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`,
			twitterImage: task.attachments?.[0]?.url || `${SITE_URL}/images/og-task-default.jpg`,
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
	const baseUrl = SITE_URL;
	
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
			url: baseUrl,
			logo: `${baseUrl}/images/Logos/BitTasker-Logo-Icon-light-mode.svg`
		},
		jobLocation: task.pickupLocation?.displayName || task.dropOffLocation?.displayName ? {
			'@type': 'Place',
			name: task.pickupLocation?.displayName || task.dropOffLocation?.displayName,
			address: {
				'@type': 'PostalAddress',
				addressLocality: task.pickupLocation?.displayName || task.dropOffLocation?.displayName
			}
		} : {
			'@type': 'Place',
			name: 'Remote',
			address: {
				'@type': 'PostalAddress',
				addressLocality: 'Remote'
			}
		},
		baseSalary: task.budget?.amount ? {
			'@type': 'MonetaryAmount',
			currency: 'USD',
			value: task.budget.amount
		} : undefined,
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

