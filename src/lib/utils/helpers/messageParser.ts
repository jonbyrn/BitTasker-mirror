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
 * Check if a message is a JSON system message (should be parsed for display)
 */
export function isJsonSystemMessage(plaintext: string): boolean {
	if (!plaintext || !plaintext.trim()) {
		return false;
	}

	if (plaintext.startsWith('{') || plaintext.startsWith('[')) {
		try {
			const parsed = JSON.parse(plaintext);
			return parsed.messageType === 'bid-status' || parsed.messageType === 'contract' || parsed.messageType === 'contract-status';
		} catch {
			return false;
		}
	}

	return false;
}

