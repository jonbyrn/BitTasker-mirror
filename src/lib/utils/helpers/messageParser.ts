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

