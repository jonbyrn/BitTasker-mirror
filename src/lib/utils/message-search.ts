import { getMessageHistory } from '$lib/utils/nostr-message';
import type { Event as NostrEvent } from 'nostr-tools';

export interface DecryptedMessage {
	plaintext: string;
	senderPubkey: string;
	event: NostrEvent;
}

export interface SearchOptions {
	query: string;
	pubkey?: string; // Search within specific conversation
	limit?: number;
	dateRange?: {
		start?: Date;
		end?: Date;
	};
	caseSensitive?: boolean;
	wholeWords?: boolean;
}

export interface SearchResult {
	message: DecryptedMessage;
	snippets: string[];
	score: number;
	pubkey: string;
}

export interface SearchIndex {
	pubkey: string;
	messageId: string;
	content: string;
	timestamp: number;
	words: string[];
}

// In-memory search index for fast queries
let searchIndex: SearchIndex[] = [];
let indexLastUpdated = 0;

/**
 * Tokenize text for search indexing
 */
function tokenizeText(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
		.split(/\s+/)
		.filter((word) => word.length > 0);
}

/**
 * Extract search snippets around matches
 */
function extractSnippets(text: string, query: string, maxSnippets = 3): string[] {
	const snippets: string[] = [];
	const queryLower = query.toLowerCase();
	const textLower = text.toLowerCase();
	const snippetLength = 100;

	let startIndex = 0;
	let found = 0;

	while (found < maxSnippets) {
		const matchIndex = textLower.indexOf(queryLower, startIndex);
		if (matchIndex === -1) break;

		// Calculate snippet boundaries
		const snippetStart = Math.max(0, matchIndex - snippetLength / 2);
		const snippetEnd = Math.min(text.length, matchIndex + query.length + snippetLength / 2);

		let snippet = text.substring(snippetStart, snippetEnd);

		// Add ellipsis if needed
		if (snippetStart > 0) snippet = '...' + snippet;
		if (snippetEnd < text.length) snippet = snippet + '...';

		snippets.push(snippet);
		startIndex = matchIndex + query.length;
		found++;
	}

	return snippets;
}

/**
 * Calculate search score based on relevance
 */
function calculateSearchScore(message: DecryptedMessage, query: string): number {
	const queryLower = query.toLowerCase();
	const contentLower = message.plaintext.toLowerCase();

	let score = 0;

	// Exact phrase match (highest score)
	if (contentLower.includes(queryLower)) {
		score += 100;
	}

	// Word matches
	const queryWords = tokenizeText(query);
	const contentWords = tokenizeText(message.plaintext);

	queryWords.forEach((queryWord) => {
		const exactMatches = contentWords.filter((word) => word === queryWord).length;
		const partialMatches = contentWords.filter(
			(word) => word.includes(queryWord) && word !== queryWord
		).length;

		score += exactMatches * 10; // Exact word matches
		score += partialMatches * 5; // Partial word matches
	});

	// Recency bonus (more recent messages get higher scores)
	const daysSinceMessage = (Date.now() - message.event.created_at * 1000) / (1000 * 60 * 60 * 24);
	const recencyBonus = Math.max(0, 30 - daysSinceMessage) * 0.5;
	score += recencyBonus;

	// Length penalty (shorter messages with matches are more relevant)
	const lengthPenalty = Math.min(5, message.plaintext.length / 100);
	score -= lengthPenalty;

	return Math.max(0, score);
}

/**
 * Search messages with full-text search capabilities
 */
export async function searchMessages(options: SearchOptions): Promise<SearchResult[]> {
	const {
		query,
		pubkey,
		limit = 50,
		dateRange,
		caseSensitive = false,
		wholeWords = false
	} = options;

	if (!query.trim()) {
		return [];
	}

	const results: SearchResult[] = [];
	const searchQuery = caseSensitive ? query : query.toLowerCase();

	try {
		// If searching specific conversation
		if (pubkey) {
			const messages = await getMessageHistory(pubkey, { limit: 1000 });

			messages.forEach((message) => {
				const content = caseSensitive ? message.plaintext : message.plaintext.toLowerCase();

				// Apply date range filter
				if (dateRange) {
					const messageDate = new Date(message.event.created_at * 1000);
					if (dateRange.start && messageDate < dateRange.start) return;
					if (dateRange.end && messageDate > dateRange.end) return;
				}

				// Check for matches
				let matches = false;

				if (wholeWords) {
					const words = tokenizeText(content);
					const queryWords = tokenizeText(searchQuery);
					matches = queryWords.every((qWord) => words.some((word) => word === qWord));
				} else {
					matches = content.includes(searchQuery);
				}

				if (matches) {
					const score = calculateSearchScore(message, query);
					const snippets = extractSnippets(message.plaintext, query);

					results.push({
						message,
						snippets,
						score,
						pubkey
					});
				}
			});
		} else {
			// Search across all conversations (requires index or conversation list)
			console.warn('Global search across all conversations not yet implemented');
		}

		// Sort by score and limit results
		return results.sort((a, b) => b.score - a.score).slice(0, limit);
	} catch (error) {
		console.error('Search failed:', error);
		return [];
	}
}

/**
 * Get search suggestions based on query
 */
export function getSearchSuggestions(query: string, limit = 5): string[] {
	if (!query.trim() || searchIndex.length === 0) {
		return [];
	}

	const suggestions = new Set<string>();
	const queryLower = query.toLowerCase();

	// Find words that start with the query
	searchIndex.forEach((item) => {
		item.words.forEach((word) => {
			if (word.startsWith(queryLower) && word !== queryLower) {
				suggestions.add(word);
			}
		});
	});

	return Array.from(suggestions).slice(0, limit);
}

/**
 * Clear search index
 */
export function clearSearchIndex(): void {
	searchIndex = [];
	indexLastUpdated = 0;
}

/**
 * Get search statistics
 */
export function getSearchStats(): {
	indexSize: number;
	lastUpdated: Date | null;
	totalWords: number;
} {
	const totalWords = searchIndex.reduce((sum, item) => sum + item.words.length, 0);

	return {
		indexSize: searchIndex.length,
		lastUpdated: indexLastUpdated ? new Date(indexLastUpdated) : null,
		totalWords
	};
}
