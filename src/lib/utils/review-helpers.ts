/**
 * Review Helper Utilities
 *
 * Functions to help with review management, finding pending reviews, etc.
 */

import { getUserContracts } from './nostr-bid';
import { hasUserReviewedEscrow } from './nostr-review';
import { getNpub } from './nostrKeys';
import { fetchProfileMetadata } from './nostr-message';
import { normalizeNostrPubkey, nostrPubkeysMatch } from './nostr-pubkey';
import { isConfirmedReviewCompletionAction, isReviewableContractStatus } from './review-status';
import type { ContractWithEvents } from '$lib/types/contract';
import type { ContractFilter } from '$lib/types/contract';
import { nip19 } from 'nostr-tools';

export { isReviewableContractStatus };

const PENDING_REVIEW_CONTRACT_PAGE_SIZE = 100;

/**
 * Pending review information
 */
export interface PendingReview {
	contract: ContractWithEvents;
	escrowId: string;
	escrowTxHash?: string;
	revieweePubkey: string;
	revieweeName?: string;
	completedAt: number;
	canReview: boolean; // Whether current user can review this contract
}

export class PartialPendingReviewsError extends Error {
	readonly pendingReviews: PendingReview[];

	constructor(message: string, pendingReviews: PendingReview[]) {
		super(message);
		this.name = 'PartialPendingReviewsError';
		this.pendingReviews = pendingReviews;
	}
}

function toProfileLookupPubkey(pubkey: string): string {
	if (pubkey.startsWith('npub')) {
		return pubkey;
	}

	try {
		return nip19.npubEncode(pubkey);
	} catch {
		return pubkey;
	}
}

async function resolveRevieweeName(revieweePubkey: string): Promise<string | undefined> {
	try {
		const profile = await fetchProfileMetadata(toProfileLookupPubkey(revieweePubkey));
		return profile.name || undefined;
	} catch (error) {
		console.error('Failed to load pending reviewee profile:', error);
		return undefined;
	}
}

function getCompletionEventTimestampSeconds(
	event: ContractWithEvents['statusEvents'][number]
): number {
	if (!event || typeof event !== 'object') {
		return 0;
	}

	const contentTimestamp = event.content?.timestamp;
	if (
		typeof contentTimestamp === 'number' &&
		Number.isFinite(contentTimestamp) &&
		contentTimestamp > 0
	) {
		return contentTimestamp;
	}

	const createdAt = event.created_at;
	if (typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0) {
		return createdAt;
	}

	return 0;
}

function getLatestConfirmedCompletionEvent(
	statusEvents: ContractWithEvents['statusEvents'] | undefined
): ContractWithEvents['statusEvents'][number] | null {
	if (!Array.isArray(statusEvents) || statusEvents.length === 0) {
		return null;
	}

	let latestEvent: ContractWithEvents['statusEvents'][number] | null = null;
	let latestTimestamp = 0;

	for (const event of statusEvents) {
		if (!isConfirmedReviewCompletionAction(event.content?.action)) {
			continue;
		}

		const eventTimestamp = getCompletionEventTimestampSeconds(event);
		if (latestEvent === null || eventTimestamp > latestTimestamp) {
			latestEvent = event;
			latestTimestamp = eventTimestamp;
		}
	}

	return latestEvent;
}

async function buildPendingReview(
	contract: ContractWithEvents,
	currentUserPubkey: string
): Promise<PendingReview | null> {
	const revieweePubkey = getOtherPartyPubkey(contract, currentUserPubkey);
	if (!revieweePubkey) {
		return null;
	}

	let completedAt = (contract.contractEvent.created_at || 0) * 1000 || Date.now();
	let escrowTxHash = contract.contractEvent.content.transactionHash;

	if (contract.statusEvents && contract.statusEvents.length > 0) {
		const completionEvent = getLatestConfirmedCompletionEvent(contract.statusEvents);

		if (completionEvent) {
			if (
				typeof completionEvent.content?.timestamp === 'number' &&
				Number.isFinite(completionEvent.content.timestamp) &&
				completionEvent.content.timestamp > 0
			) {
				completedAt = completionEvent.content.timestamp * 1000;
			} else if (
				typeof completionEvent.created_at === 'number' &&
				Number.isFinite(completionEvent.created_at) &&
				completionEvent.created_at > 0
			) {
				completedAt = completionEvent.created_at * 1000;
			}

			if (completionEvent.content?.transactionHash) {
				escrowTxHash = completionEvent.content.transactionHash;
			}
		}
	}

	return {
		contract,
		escrowId: contract.escrowData.id,
		escrowTxHash,
		revieweePubkey,
		revieweeName: await resolveRevieweeName(revieweePubkey),
		completedAt,
		canReview: true
	};
}

function getNextContractUntil(contracts: ContractWithEvents[]): number | null {
	if (contracts.length === 0) {
		return null;
	}

	const oldestCreatedAt = contracts.reduce((oldest, contract) => {
		return Math.min(oldest, contract.contractEvent.created_at ?? Infinity);
	}, Infinity);

	if (!Number.isFinite(oldestCreatedAt)) {
		return null;
	}

	return oldestCreatedAt > 0 ? oldestCreatedAt : null;
}

function getPendingReviewContractKey(contract: ContractWithEvents): string {
	const escrowId = contract.escrowData?.id;
	if (escrowId) {
		return `escrow:${escrowId}`;
	}

	const txHash = contract.contractEvent?.content?.transactionHash;
	if (txHash) {
		return `tx:${txHash}`;
	}

	return `created:${contract.contractEvent?.created_at ?? 0}`;
}

async function getContractsForPendingReviewDiscovery(): Promise<ContractWithEvents[]> {
	const contractsByKey = new Map<string, ContractWithEvents>();
	let nextUntil: number | undefined;
	let currentPageLimit = PENDING_REVIEW_CONTRACT_PAGE_SIZE;

	while (true) {
		const filter: ContractFilter = {
			limit: currentPageLimit,
			...(nextUntil !== undefined ? { until: nextUntil } : {})
		};
		const page = await getUserContracts(filter);

		for (const contract of page) {
			contractsByKey.set(getPendingReviewContractKey(contract), contract);
		}

		if (page.length < currentPageLimit) {
			break;
		}

		const pageUntil = getNextContractUntil(page);
		if (pageUntil === null) {
			break;
		}

		if (nextUntil !== undefined && pageUntil === nextUntil) {
			currentPageLimit *= 2;
			continue;
		}

		nextUntil = pageUntil;
		currentPageLimit = PENDING_REVIEW_CONTRACT_PAGE_SIZE;
	}

	return [...contractsByKey.values()];
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

		// Page through user contracts so older completed escrows remain discoverable.
		const contracts = await getContractsForPendingReviewDiscovery();

		// Filter to completed contracts
		const completedContracts = contracts.filter((contract) => {
			return isReviewableContractStatus(contract.status);
		});

		let hadPartialFailure = false;
		const pending = (
			await Promise.all(
				completedContracts.map(async (contract) => {
					try {
						const userReviewed = await hasUserReviewedEscrow(
							contract.escrowData.id,
							currentUserPubkey
						);

						if (userReviewed) {
							return null;
						}

						return buildPendingReview(contract, currentUserPubkey);
					} catch (error) {
						hadPartialFailure = true;
						console.error('Failed to inspect pending review contract:', {
							escrowId: contract.escrowData.id,
							error
						});
						return null;
					}
				})
			)
		).filter((review): review is PendingReview => review !== null);

		// Sort by completion date (newest first)
		const sortedPending = pending.sort((a, b) => b.completedAt - a.completedAt);

		if (hadPartialFailure) {
			throw new PartialPendingReviewsError(
				'Some pending reviews could not be refreshed.',
				sortedPending
			);
		}

		return sortedPending;
	} catch (error) {
		console.error('Failed to find pending reviews:', error);
		throw error instanceof Error ? error : new Error('Failed to find pending reviews');
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

		return hasUserReviewedEscrow(escrowId, currentUserPubkey);
	} catch (error) {
		console.error('Failed to check if contract reviewed:', error);
		throw error instanceof Error ? error : new Error('Failed to check if contract reviewed');
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
	if (nostrPubkeysMatch(contract.contractEvent.content.clientPubkey, currentUserPubkey)) {
		return contract.contractEvent.content.freelancerPubkey;
	} else if (
		nostrPubkeysMatch(contract.contractEvent.content.freelancerPubkey, currentUserPubkey)
	) {
		return contract.contractEvent.content.clientPubkey;
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

		return getRevieweeRoleFromContractParticipants(
			contracts[0].contractEvent.content.clientPubkey,
			contracts[0].contractEvent.content.freelancerPubkey,
			revieweePubkey
		);
	} catch (error) {
		console.error('Failed to determine reviewee role:', error);
		return null;
	}
}

export function getRevieweeRoleFromContractParticipants(
	clientPubkey: string,
	freelancerPubkey: string,
	revieweePubkey: string
): 'tasker' | 'taskee' | null {
	const normalizedReviewee = normalizeNostrPubkey(revieweePubkey);
	const normalizedClient = normalizeNostrPubkey(clientPubkey);
	const normalizedFreelancer = normalizeNostrPubkey(freelancerPubkey);

	if (normalizedReviewee === normalizedClient) {
		return 'tasker';
	}

	if (normalizedReviewee === normalizedFreelancer) {
		return 'taskee';
	}

	return null;
}
