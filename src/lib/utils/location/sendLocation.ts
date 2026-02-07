import type { Location } from '$lib/types/task';
import { sendDirectMessage } from '$lib/utils/nostr-message';
import { formatLocationAddress, generateGoogleMapsDirectionsLink } from './maps';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { TAG_PATTERNS } from '$lib/utils/constants/tags';

export interface LocationMessageData {
	type: 'location';
	location?: Location;
	locations?: Array<{ location: Location; label: string }>;
	taskId?: string;
	taskTitle?: string;
}

/**
 * Send location details to taskee in chat
 * This is called after contract creation to share exact task locations
 */
export async function sendLocationToTaskee(
	location: Location,
	recipientPubkey: string,
	options?: {
		label?: string;
		taskId?: string;
		threadRootId?: string;
	}
): Promise<void> {
	try {
		// Convert recipient pubkey to hex if needed
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		// Format the message with location details
		const formattedAddress = formatLocationAddress(location);
		const directionsLink = generateGoogleMapsDirectionsLink(location, {
			origin: 'current',
			label: options?.label
		});

		// Create structured message data
		const locationData: LocationMessageData = {
			type: 'location',
			location,
			taskId: options?.taskId
		};

		// Create human-readable message
		const messageText = `📍 ${options?.label || 'Location'}\n\n${formattedAddress}\n\n${directionsLink}\n\n[LOCATION_DATA:${JSON.stringify(locationData)}]`;

		// Send the message using centralized tag patterns
		const tags = TAG_PATTERNS.location(JSON.stringify(locationData), options?.taskId);
		await sendDirectMessage(messageText, recipientPubkeyHex, options?.threadRootId, tags);
	} catch (error) {
		console.error('Error sending location to taskee:', error);
		throw error;
	}
}

/**
 * Send multiple locations (pickup and dropoff) to taskee in a single message
 * For remote tasks, always sends congratulations, title, and description even without locations
 */
export async function sendLocationsToTaskee(
	pickupLocation: Location | null,
	dropoffLocation: Location | null,
	recipientPubkey: string,
	options?: {
		taskId?: string;
		taskTitle?: string;
		taskDescription?: string;
		isRemote?: boolean;
		threadRootId?: string;
		additionalNotes?: string;
	}
): Promise<void> {
	try {
		// Convert recipient pubkey to hex if needed
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		// Helper function to check if location is valid
		const isValidLocation = (loc: Location | null): boolean => {
			return loc !== null && 
				loc.latitude !== null && 
				loc.longitude !== null &&
				loc.locationLoaded === true;
		};

		// Get translations (common translations are loaded by default)
		const _ = get(t);

		const isRemote = options?.isRemote === true;

		// Build locations array - only include valid locations and never for remote tasks
		const locations: Array<{ location: Location; label: string }> = [];
		if (!isRemote) {
			if (isValidLocation(pickupLocation)) {
				locations.push({ location: pickupLocation!, label: _('common.location.pickup_location') });
			}
			if (isValidLocation(dropoffLocation)) {
				locations.push({ location: dropoffLocation!, label: _('common.location.dropoff_location') });
			}
		}

		const hasValidLocations = locations.length > 0;

		// For remote tasks, always send message with congratulations, title, and description
		// For in-person tasks, only send if there are valid locations
		if (!isRemote && !hasValidLocations) {
			console.warn('No valid locations provided to send for in-person task');
			return;
		}

		// If remote task but no title, don't send anything
		if (isRemote && !options?.taskTitle) {
			console.warn('Remote task but no title provided');
			return;
		}

		// Create structured message data
		const locationData: LocationMessageData = {
			type: 'location',
			locations: hasValidLocations ? locations : undefined,
			taskId: options?.taskId,
			taskTitle: options?.taskTitle
		};

		// Build human-readable message
		let messageText = '';
		
		// Add congratulations message and task title (always for remote, or when title is provided)
		if (options?.taskTitle) {
			messageText += `🎉 ${_('common.location.task_accepted_congratulations')}\n\n`;
			messageText += `📋 ${options.taskTitle}\n\n`;
			
			// Add task description if provided
			if (options?.taskDescription) {
				messageText += `${options.taskDescription}\n\n`;
			}
			
			// Only show location details message if there are valid locations
			if (hasValidLocations) {
				messageText += `${_('common.location.location_details_below')}\n\n`;
			}
		}

		// Add location details (only valid locations are in the array)
		if (hasValidLocations) {
			locations.forEach((loc, index) => {
				if (index > 0) messageText += '\n';
				const formattedAddress = formatLocationAddress(loc.location);
				const directionsLink = generateGoogleMapsDirectionsLink(loc.location, {
					origin: 'current',
					label: loc.label
				});
				messageText += `📍 ${loc.label}\n${formattedAddress}\n${directionsLink}`;
			});
		}

		// Add additional notes if provided
		if (options?.additionalNotes && options.additionalNotes.trim()) {
			messageText += '\n\n';
			messageText += `📝 ${_('dashboard.bids.bid_acceptance.additional_notes_label')}\n`;
			messageText += `${options.additionalNotes.trim()}`;
		}

		// Build tags with location data using centralized tag patterns
		const tags = TAG_PATTERNS.location(JSON.stringify(locationData), options?.taskId);

		// Send the single message (without JSON in text)
		await sendDirectMessage(messageText, recipientPubkeyHex, options?.threadRootId, tags);
	} catch (error) {
		console.error('Error sending locations to taskee:', error);
		throw error;
	}
}

export interface TaskCompletionMessageData {
	type: 'task-completion';
	taskId?: string;
	escrowId?: string;
	taskTitle?: string;
}

/**
 * Send task completion message to tasker
 * This is called when a taskee marks a task as completed
 */
export async function sendTaskCompletionMessageToTasker(
	recipientPubkey: string,
	options?: {
		taskId?: string;
		taskTitle?: string;
		escrowId?: string;
		threadRootId?: string;
	}
): Promise<void> {
	try {
		// Convert recipient pubkey to hex if needed
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		// Get translations
		const _ = get(t);

		// Build human-readable message
		let messageText = '';
		
		if (options?.taskTitle) {
			messageText += `✅ ${_('common.location.task_completed_message')}\n\n`;
			messageText += `📋 ${options.taskTitle}\n\n`;
			messageText += `${_('common.location.task_completed_review_message')}\n`;
		} else {
			messageText += `✅ ${_('common.location.task_completed_message')}\n\n`;
			messageText += `${_('common.location.task_completed_review_message')}\n`;
		}

		// Build tags with completion data using centralized tag patterns
		const tags = TAG_PATTERNS.taskCompletion(
			options?.taskId || '',
			options?.escrowId
		);

		// Send the message
		await sendDirectMessage(messageText, recipientPubkeyHex, options?.threadRootId, tags);
	} catch (error) {
		console.error('Error sending task completion message to tasker:', error);
		throw error;
	}
}

/**
 * Send payment released message to taskee
 * This is called when the tasker accepts the work and releases payment (so the taskee receives a DM)
 */
export async function sendPaymentReleasedMessageToTaskee(
	recipientPubkey: string,
	options?: {
		taskId?: string;
		taskTitle?: string;
		threadRootId?: string;
	}
): Promise<void> {
	try {
		const recipientPubkeyHex = recipientPubkey.startsWith('npub')
			? (nip19.decode(recipientPubkey).data as string)
			: recipientPubkey;

		const _ = get(t);

		let messageText = '';
		if (options?.taskTitle) {
			messageText += `💰 ${_('common.location.funds_released_message')}\n\n`;
			messageText += `📋 ${options.taskTitle}\n\n`;
			messageText += `${_('common.location.funds_released_taskee_message')}\n`;
		} else {
			messageText += `💰 ${_('common.location.funds_released_message')}\n\n`;
			messageText += `${_('common.location.funds_released_taskee_message')}\n`;
		}

		const tags = TAG_PATTERNS.paymentReleased(options?.taskId || '');

		await sendDirectMessage(messageText, recipientPubkeyHex, options?.threadRootId, tags);
	} catch (error) {
		console.error('Error sending payment released message to taskee:', error);
		throw error;
	}
}

