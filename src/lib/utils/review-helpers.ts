/**
 * Review Helper Utilities
 * 
 * Functions to help with review management, finding pending reviews, etc.
 */

import { getUserContracts } from './nostr-bid';
import { getReviewsForEscrow } from './nostr-review';
import { getNpub } from './nostrKeys';
import type { ContractWithEvents } from '$lib/types/contract';

/**
 * Pending review information
 */
export interface PendingReview {
	contract: ContractWithEvents;
	escrowId: string;
	revieweePubkey: string;
	revieweeName?: string;
	completedAt: number;
	canReview: boolean; // Whether current user can review this contract
}

/**
 * Find all contracts that need reviews from the current user
 */
export async function findPendingReviews(): Promise<PendingReview[]> {
	try {
		const currentUserPubkey = await getNpub();
		if (!currentUserPubkey) {
			return [];
		}

		// Get all user contracts
		const contracts = await getUserContracts();
		
		// Filter to completed contracts
		const completedContracts = contracts.filter(contract => {
			const status = contract.contract.status;
			return status === 'completed' || status === 'resolved';
		});

		// Find contracts without reviews
		const pending: PendingReview[] = [];
		
		for (const contract of completedContracts) {
			// Check if user has already reviewed this escrow
			const escrowReviews = await getReviewsForEscrow(contract.contract.escrowId);
			const userReviewed = escrowReviews.some(r => r.reviewerPubkey === currentUserPubkey);
			
			if (!userReviewed) {
				// Determine who the reviewee is (the other party)
				// If current user is client, review Taskee; if current user is Taskee, review client
				const isClient = contract.contract.clientPubkey === currentUserPubkey;
				const revieweePubkey = isClient ? contract.contract.freelancerPubkey : contract.contract.clientPubkey;
				
				// Get completion date (use latest status event or contract creation)
				let completedAt = contract.contract.createdAt || Date.now();
				if (contract.statusEvents && contract.statusEvents.length > 0) {
					const completionEvent = contract.statusEvents.find((e) => {
						const action = e.status.action;
						return action === 'task-completed' || action === 'payment-released';
					});
					if (completionEvent) {
						completedAt = completionEvent.status.timestamp * 1000;
					}
				}

				pending.push({
					contract,
					escrowId: contract.contract.escrowId,
					revieweePubkey,
					revieweeName: undefined, // Will need to get from profile
					completedAt,
					canReview: true
				});
			}
		}

		// Sort by completion date (newest first)
		return pending.sort((a, b) => b.completedAt - a.completedAt);
	} catch (error) {
		console.error('Failed to find pending reviews:', error);
		return [];
	}
}

/**
 * Check if a contract has been reviewed by the current user
 */
export async function hasUserReviewedContract(escrowId: string): Promise<boolean> {
	try {
		const currentUserPubkey = await getNpub();
		if (!currentUserPubkey) {
			return false;
		}

		const reviews = await getReviewsForEscrow(escrowId);
		return reviews.some(r => r.reviewerPubkey === currentUserPubkey);
	} catch (error) {
		console.error('Failed to check if contract reviewed:', error);
		return false;
	}
}

/**
 * Get the other party's pubkey for a contract
 * Returns the Taskee's pubkey if current user is the client, or the client's pubkey if current user is the Taskee
 */
export function getOtherPartyPubkey(
	contract: ContractWithEvents,
	currentUserPubkey: string
): string | null {
	if (contract.contract.clientPubkey === currentUserPubkey) {
		return contract.contract.freelancerPubkey;
	} else if (contract.contract.freelancerPubkey === currentUserPubkey) {
		return contract.contract.clientPubkey;
	}
	return null;
}

/**
 * Get count of pending reviews for current user
 */
export async function getPendingReviewsCount(): Promise<number> {
	const pending = await findPendingReviews();
	return pending.length;
}

/**
 * Determine if a reviewee is a Tasker (client) or Taskee (freelancer) based on contract
 * @param escrowId - The escrow ID
 * @param revieweePubkey - The reviewee's pubkey (can be hex or npub format)
 * @returns 'tasker' if reviewee is client, 'taskee' if freelancer, null if cannot determine
 */
export async function getRevieweeRole(
	escrowId: string,
	revieweePubkey: string
): Promise<'tasker' | 'taskee' | null> {
	try {
		const contracts = await getUserContracts({ escrowIds: [escrowId] });
		
		if (contracts.length === 0) {
			return null;
		}

		const contract = contracts[0].contract;
		
		// Normalize pubkeys for comparison (handle both hex and npub formats)
		const normalizePubkey = async (pubkey: string): Promise<string> => {
			// If it's an npub, decode it to hex
			if (pubkey.startsWith('npub')) {
				try {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore nostr-tools type definitions issue
					const { nip19 } = await import('nostr-tools');
					const decoded = nip19.decode(pubkey);
					return (decoded.data as string).toLowerCase();
				} catch {
					return pubkey.toLowerCase();
				}
			}
			return pubkey.toLowerCase();
		};

		const normalizedReviewee = await normalizePubkey(revieweePubkey);
		const normalizedClient = await normalizePubkey(contract.clientPubkey);
		const normalizedFreelancer = await normalizePubkey(contract.freelancerPubkey);

		if (normalizedReviewee === normalizedClient) {
			return 'tasker'; // Reviewee is the client (Tasker)
		} else if (normalizedReviewee === normalizedFreelancer) {
			return 'taskee'; // Reviewee is the freelancer (Taskee)
		}

		return null;
	} catch (error) {
		console.error('Failed to determine reviewee role:', error);
		return null;
	}
}

