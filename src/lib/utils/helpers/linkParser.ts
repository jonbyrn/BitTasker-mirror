/**
 * Detects URLs in text and returns an array of text segments and links
 */
export interface TextSegment {
	type: 'text' | 'link';
	content: string;
	url?: string;
}

/**
 * Parse text and extract URLs, returning segments with type information
 */
export function parseLinks(text: string): TextSegment[] {
	// More strict regex: only matches http/https URLs, www. URLs, or valid domain patterns
	// Valid domains must have a TLD (top-level domain) with 2+ letters and be followed by whitespace, punctuation, or end of string
	const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?)/g;
	const segments: TextSegment[] = [];
	let lastIndex = 0;
	let match;

	while ((match = urlRegex.exec(text)) !== null) {
		const matchedText = match[0];
		
		// Additional validation: don't match if it looks like a word with a capital letter after the dot
		// (e.g., "variable.Comienza" should not be a link)
		if (!matchedText.startsWith('http://') && !matchedText.startsWith('https://') && !matchedText.startsWith('www.')) {
			// Check if after the first dot there's a capital letter (likely a word, not a domain)
			const afterFirstDot = matchedText.split('.')[1];
			if (afterFirstDot && afterFirstDot[0] && afterFirstDot[0] === afterFirstDot[0].toUpperCase() && afterFirstDot[0] !== afterFirstDot[0].toLowerCase()) {
				// Skip this match - it's likely a word with a dot, not a URL
				continue;
			}
			
			// Also check if it's a valid domain pattern (should have a proper TLD)
			const domainPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
			if (!domainPattern.test(matchedText.split('/')[0])) {
				continue;
			}
		}
		
		// Add text before the URL
		if (match.index > lastIndex) {
			segments.push({
				type: 'text',
				content: text.substring(lastIndex, match.index)
			});
		}

		// Process the URL
		let url = matchedText;
		let displayUrl = matchedText;

		// Add protocol if missing
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}

		// Truncate long URLs for display
		if (displayUrl.length > 50) {
			displayUrl = displayUrl.substring(0, 47) + '...';
		}

		segments.push({
			type: 'link',
			content: displayUrl,
			url: url
		});

		lastIndex = match.index + matchedText.length;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		segments.push({
			type: 'text',
			content: text.substring(lastIndex)
		});
	}

	// If no URLs found, return the whole text as a single segment
	if (segments.length === 0) {
		segments.push({
			type: 'text',
			content: text
		});
	}

	return segments;
}

