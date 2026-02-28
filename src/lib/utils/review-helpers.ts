/**
 * Review Helper Utilities
 * 
 * Functions to help with review management, finding pending reviews, etc.
 */

import { getUserContracts } from './nostr-bid';
import { getReviewsByReviewer, hasUserReviewedEscrow } from './review-source';
import { getNpub } from './nostrKeys';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore nostr-tools type definitions issue
import { nip19 } from 'nostr-tools';

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

/** Normalize npub to hex for comparison with contract pubkeys (which may be hex). */
function npubToHex(pubkey: string): string {
	try {
		if (pubkey.startsWith('npub')) {
			return nip19.decode(pubkey).data as string;
		}
		return pubkey;
	} catch {
		return pubkey;
	}
}

/**
 * Find all contracts that need reviews from the current user.
 * One "reviews by reviewer" fetch + one contracts fetch, then in-memory filter (no per-escrow queries).
 */
export async function findPendingReviews(): Promise<PendingReview[]> {
	try {
		const currentUserNpub = await getNpub();
		if (!currentUserNpub) {
			return [];
		}
		const currentUserHex = npubToHex(currentUserNpub);

		const [contracts, reviewsGiven] = await Promise.all([
			getUserContracts({ limit: 100 }),
			getReviewsByReviewer(currentUserNpub, 200)
		]);

		const reviewedEscrowIds = new Set<string>();
		for (const r of reviewsGiven) {
			if (r.escrowId) reviewedEscrowIds.add(r.escrowId);
		}

		const completedStatuses = [
			EscrowStatus.Completed,
			EscrowStatus.FundsReleased,
			EscrowStatus.DisputeResolved
		];
		const completedContracts = contracts.filter((c) => completedStatuses.includes(c.status));
		const pending: PendingReview[] = [];

		for (const contract of completedContracts) {
			if (reviewedEscrowIds.has(contract.escrowData.id)) continue;
			const content = contract.contractEvent?.content;
			if (!content?.clientPubkey || !content?.freelancerPubkey) continue;
			const clientHex = npubToHex(content.clientPubkey);
			const freelancerHex = npubToHex(content.freelancerPubkey);
			const isClient = clientHex === currentUserHex;
			const revieweePubkey = isClient ? content.freelancerPubkey : content.clientPubkey;
			let completedAt = (contract.contractEvent.created_at || 0) * 1000 || Date.now();
			if (contract.statusEvents?.length) {
				const completionEvent = contract.statusEvents.find(
					(e) =>
						e.content?.action === EscrowStatus.Completed ||
						e.content?.action === EscrowStatus.FundsReleased ||
						e.content?.action === EscrowStatus.DisputeResolved
				);
				if (completionEvent?.content?.timestamp) {
					completedAt = completionEvent.content.timestamp * 1000;
				}
			}
			pending.push({
				contract,
				escrowId: contract.escrowData.id,
				revieweePubkey,
				revieweeName: undefined,
				completedAt,
				canReview: true
			});
		}
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

		return await hasUserReviewedEscrow(escrowId, currentUserPubkey);
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
	const content = contract.contractEvent?.content;
	if (!content?.clientPubkey || !content?.freelancerPubkey) {
		return null;
	}
	if (content.clientPubkey === currentUserPubkey) {
		return content.freelancerPubkey;
	}
	if (content.freelancerPubkey === currentUserPubkey) {
		return content.clientPubkey;
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

		const content = contracts[0].contractEvent?.content;
		if (!content?.clientPubkey || !content?.freelancerPubkey) {
			return null;
		}

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
		const normalizedClient = await normalizePubkey(content.clientPubkey);
		const normalizedFreelancer = await normalizePubkey(content.freelancerPubkey);

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

