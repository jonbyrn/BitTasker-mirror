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
 */
export async function sendLocationsToTaskee(
	pickupLocation: Location | null,
	dropoffLocation: Location | null,
	recipientPubkey: string,
	options?: {
		taskId?: string;
		taskTitle?: string;
		threadRootId?: string;
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

		// Build locations array - only include valid locations
		const locations: Array<{ location: Location; label: string }> = [];
		if (isValidLocation(pickupLocation)) {
			locations.push({ location: pickupLocation!, label: _('location.pickup_location') });
		}
		if (isValidLocation(dropoffLocation)) {
			locations.push({ location: dropoffLocation!, label: _('location.dropoff_location') });
		}

		// If no valid locations, don't send anything
		if (locations.length === 0) {
			console.warn('No valid locations provided to send');
			return;
		}

		// Create structured message data
		const locationData: LocationMessageData = {
			type: 'location',
			locations,
			taskId: options?.taskId,
			taskTitle: options?.taskTitle
		};

		// Build human-readable message
		let messageText = '';
		
		// Add congratulations message and task title
		if (options?.taskTitle) {
			messageText += `🎉 ${_('location.task_accepted_congratulations')}\n\n`;
			messageText += `📋 ${options.taskTitle}\n\n`;
			messageText += `${_('location.location_details_below')}\n\n`;
		}

		// Add location details (only valid locations are in the array)
		locations.forEach((loc, index) => {
			if (index > 0) messageText += '\n';
			const formattedAddress = formatLocationAddress(loc.location);
			const directionsLink = generateGoogleMapsDirectionsLink(loc.location, {
				origin: 'current',
				label: loc.label
			});
			messageText += `📍 ${loc.label}\n${formattedAddress}\n${directionsLink}`;
		});

		// Build tags with location data using centralized tag patterns
		const tags = TAG_PATTERNS.location(JSON.stringify(locationData), options?.taskId);

		// Send the single message (without JSON in text)
		await sendDirectMessage(messageText, recipientPubkeyHex, options?.threadRootId, tags);
	} catch (error) {
		console.error('Error sending locations to taskee:', error);
		throw error;
	}
}

