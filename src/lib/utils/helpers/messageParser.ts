import { checkoutPlainText } from '$lib/market/nip15';
import { TAGS } from '$lib/utils/constants/tags';

/**
 * Parse message content and extract readable text
 * For JSON messages (like bid-status), extracts the message field
 * For regular messages, returns as-is
 */
export function parseMessageContent(plaintext: string): string {
	if (!plaintext || !plaintext.trim()) {
		return plaintext;
	}

	// Check if it's a JSON message
	if (plaintext.startsWith('{') || plaintext.startsWith('[')) {
		try {
			const parsed = JSON.parse(plaintext);

			// If it's a bid-status message, return only the message field
			if (parsed.type === 'bid-status' && parsed.message) {
				return parsed.message;
			}

			const checkout = checkoutPlainText(plaintext);
			if (checkout) return checkout;

			// For other JSON messages, return the original stringified JSON
			// (but this shouldn't happen for display purposes)
			return plaintext;
		} catch (error) {
			console.error('Error parsing message content:', error);
			// If parsing fails, return original text
			return plaintext;
		}
	}

	// For non-JSON messages, return as-is
	return plaintext;
}

/**
 * Extract location data from event tags if it contains location information
 * Returns location data if found, null otherwise
 */
export function extractLocationDataFromTags(event: { tags: string[][] }): {
	type: 'location';
	location?: Record<string, unknown>;
	locations?: Array<{ location: Record<string, unknown>; label: string }>;
	label?: string;
	taskId?: string;
	taskTitle?: string;
} | null {
	if (!event || !event.tags) {
		return null;
	}

	// Check if event has location data tag (using single-character tag 'l')
	const locationDataTag = event.tags.find((tag) => tag[0] === TAGS.L);
	if (locationDataTag && locationDataTag[1]) {
		try {
			const locationData = JSON.parse(locationDataTag[1]);
			if (locationData.type === 'location' && (locationData.location || locationData.locations)) {
				return locationData;
			}
		} catch (error) {
			console.error('Error parsing location data from tags:', error);
		}
	}

	return null;
}

/**
 * Extract location data from a message if it contains location information (legacy support)
 * Returns location data if found, null otherwise
 */
export function extractLocationData(plaintext: string): {
	type: 'location';
	location?: Record<string, unknown>;
	locations?: Array<{ location: Record<string, unknown>; label: string }>;
	label?: string;
	taskId?: string;
	taskTitle?: string;
} | null {
	// Legacy: check if message contains location data marker (for backwards compatibility)
	if (!plaintext || !plaintext.trim()) {
		return null;
	}

	const locationDataMatch = plaintext.match(/\[LOCATION_DATA:([\s\S]+?)\]/);
	if (locationDataMatch) {
		try {
			const locationData = JSON.parse(locationDataMatch[1]);
			if (locationData.type === 'location' && (locationData.location || locationData.locations)) {
				return locationData;
			}
		} catch (error) {
			console.error('Error parsing location data:', error);
		}
	}

	return null;
}

/**
 * Extract human-readable text from a location message (removes location data marker)
 */
export function extractLocationMessageText(plaintext: string): string {
	if (!plaintext || !plaintext.trim()) {
		return plaintext;
	}

	// Remove location data marker (including multiline JSON) but keep the rest of the message
	return plaintext.replace(/\[LOCATION_DATA:[\s\S]+?\]/g, '').trim();
}

/**
 * Check if a message is a JSON system message (should be filtered out from chat)
 * Returns true for all system/automated messages that shouldn't be shown in user-to-user chat
 *
 * System messages are identified by having a 'type' property in their JSON structure.
 * All system messages (bids, contracts, status updates, payments, etc.) have this property.
 * User messages are plain text and don't have this property, so they pass through.
 */
export function isJsonSystemMessage(plaintext: string): boolean {
	if (!plaintext || !plaintext.trim()) {
		return false;
	}

	// Check if it's a JSON message
	if (plaintext.startsWith('{') || plaintext.startsWith('[')) {
		try {
			const parsed = JSON.parse(plaintext);

			// If the message has a type property, it's a system message
			// This catches ALL system messages regardless of their specific type:
			// - bid, bid-status (accepted/rejected)
			// - contract, contract-status
			// - task-completed, payment, payment-released
			// - dispute-raised, resolution-proposed, proposal-accepted
			// - escrow-cancelled, timelock-resolved
			// - and any future system message types
			if (checkoutPlainText(plaintext)) return false;
			if (parsed && typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
				return true;
			}

			return false;
		} catch {
			// If it's not valid JSON, it's not a system message
			return false;
		}
	}

	return false;
}

/**
 * Check if a message is a user-to-user chat message (should be displayed)
 * Returns true only for non-system messages
 */
export function isUserToUserMessage(plaintext: string): boolean {
	return !isJsonSystemMessage(plaintext);
}
