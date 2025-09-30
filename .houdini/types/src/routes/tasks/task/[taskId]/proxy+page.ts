// @ts-nocheck
import type { PageLoad } from './$types';
import nostrEventsService from '$lib/api/services/nostr/events';
import type { Task } from '$lib/types/task';

const SITE_URL = 'https://bittasker.com';

export const prerender = false;

export const load = async ({ params, url }: Parameters<PageLoad>[0]) => {
	const taskId = params.taskId;
	const canonicalUrl = `${SITE_URL}/tasks/task/${taskId}`;
	
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

	try {
		// Fetch task data from Nostr
		const { data: event } = await nostrEventsService.findEventById(taskId);
		
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
	} catch (error) {
		console.error('Error loading task for SEO:', error);
	}
	return {
		seo,
		taskId
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