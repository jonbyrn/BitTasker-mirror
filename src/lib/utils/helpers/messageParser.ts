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
			if (parsed.messageType === 'bid-status' && parsed.message) {
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
 */
export function isJsonSystemMessage(plaintext: string): boolean {
	if (!plaintext || !plaintext.trim()) {
		return false;
	}

	// Check if it's a JSON message
	if (plaintext.startsWith('{') || plaintext.startsWith('[')) {
		try {
			const parsed = JSON.parse(plaintext);
			
			// Filter out all system message types
			const systemMessageTypes = [
				'bid',
				'bid-status',
				'contract',
				'contract-status',
				'task-completed',
				'payment-released',
				'dispute-raised',
				'resolution-proposed',
				'proposal-accepted',
				'escrow-cancelled',
				'timelock-resolved'
			];
			
			return parsed.messageType && systemMessageTypes.includes(parsed.messageType);
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

