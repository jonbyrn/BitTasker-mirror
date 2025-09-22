/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getNpub } from './nostrKeys';
import {
	sendDirectMessage,
	getMessageHistory,
	getMessagedPeople
} from './nostr-message';

export interface NostrBid {
	type: 'bid';
	taskId: string;
	taskTitle: string; // Add task title
	taskDescription: string; // Add task description
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	hourlyRate?: number | null; // Allow null values
	estimatedHours?: number | null; // Allow null values
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	// New datetime fields for fixed price bids
	startDate?: string | null;
	endDate?: string | null;
	startTime?: string | null;
	endTime?: string | null;
	// Add this field to identify it as a bid
	messageType: 'bid';
	taskCreatorUsername?: string;
	taskCreatorAvatar?: string;
	taskCreatorPubkey?: string;
	// Bidder information
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;
	// RSK wallet address for escrow funding
	bidderWalletAddress?: string;
}

export interface BidMessage {
	bid: NostrBid; // The bid data
	senderPubkey: string; // Who sent the bid
	event: NostrEvent; // The Nostr event
}

/**
 * Get only bids from DMs (excluding normal messages)
 */
export async function getBidsFromDMs(taskId?: string): Promise<BidMessage[]> {
	try {
		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// For each conversation, search only for messages that are bids
		for (const person of messagedPeople) {
			try {
				// Get bid-specific message history with this person (more efficient)
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				// Filter only messages that contain bids
				for (const message of messageHistory) {
					try {
						// Skip if message is empty or invalid
						if (!message.plaintext || message.plaintext.trim() === '') {
							continue;
						}

						// Try to parse as JSON first
						let parsedContent;
						try {
							parsedContent = JSON.parse(message.plaintext);
						} catch {
							// Not JSON, skip
							continue;
						}

						// Verify it's a valid bid
						if (parsedContent.messageType === 'bid' && parsedContent.type === 'bid') {
							// If taskId is specified, filter by that task
							if (!taskId || parsedContent.taskId === taskId) {
								bids.push({
									bid: parsedContent,
									senderPubkey: message.senderPubkey,
									event: message.event
								});
							}
						}
					} catch (parseError) {
						// Not a valid bid, continue
						continue;
					}
				}
			} catch (err) {
				continue;
			}
		}
		
		// Sort by timestamp (most recent first)
		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error getting bids from DMs:', error);
		throw error;
	}
}

/**
 * Get all bids sent by the current user
 */
export async function getMyBids(): Promise<BidMessage[]> {
	try {
		const npub = await getNpub();
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Get all people you've exchanged messages with
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// For each conversation, search only for bids sent by the current user
		for (const person of messagedPeople) {
			try {
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				for (const message of messageHistory) {
					try {
						// Skip if message is empty or invalid
						if (!message.plaintext || message.plaintext.trim() === '') {
							continue;
						}

						const parsedContent = JSON.parse(message.plaintext);

						// Verify it's a bid sent by the current user
						if (parsedContent.messageType === 'bid' && 
							parsedContent.type === 'bid' && 
							message.senderPubkey === pubkeyHex) {
							
							// Ensure all fields are present
							const completeBid: NostrBid = {
								...parsedContent,
								messageType: 'bid'
							};

							bids.push({
								bid: completeBid,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
						}
					} catch (parseError) {
						continue;
					}
				}
			} catch (err) {
				// Skip this conversation if there's an error
				console.warn('Failed to get message history for pubkey:', person.pubkey, err);
				continue;
			}
		}

		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error getting my bids:', error);
		throw error;
	}
}
