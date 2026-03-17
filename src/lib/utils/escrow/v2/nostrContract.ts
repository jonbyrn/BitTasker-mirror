/**
 * V2 Nostr contract — publish CONTRACT, getContracts (#v=v2), handleContractEvent.
 */

import type { Filter, NostrEvent } from 'nostr-tools';
import { nip19, nip44 } from 'nostr-tools';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import TAGS, { TAG_PATTERNS, TAG_FILTERS } from '$lib/utils/constants/tags';
import type {
	NostrContract,
	CreateContractParams,
	PublishStatusParams,
	ContractFilter,
	ContractWithEvents,
	ContractEvent,
	ContractStatusEvent
} from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { EscrowStatus as V1EscrowStatus } from '../v1/escrow.enum';
import { EscrowStatus as V2EscrowStatus } from './escrow.enum';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';
import { contractStore } from '$lib/stores/contract.store';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import KINDS from '$lib/utils/constants/kinds';
import { createDebug } from '$lib/utils/debug';
import { escrow } from './escrow';

const d = createDebug('escrow:v2:nostr');

/**
 * Publish CONTRACT event with v2 tags after V2 createPaymentContract tx is confirmed.
 * Uses V2 contract address from env (same network as VITE_RSK_NETWORK).
 */
export async function publishContractEvent(params: CreateContractParams): Promise<void> {
	try {
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
		const network = import.meta.env.VITE_RSK_NETWORK ?? 'testnet';
		const contractAddress =
			network === 'mainnet'
				? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
				: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;

		if (!contractAddress) {
			d.error('publishContractEvent: V2 contract address not configured', { network });
			throw new Error('V2 contract address not configured for this network');
		}

		const contractData: NostrContract = {
			escrowId: params.escrowId,
			taskId: params.taskId,
			taskTitle: params.taskTitle,
			taskDescription: params.taskDescription,
			freelancerPubkey: params.freelancerPubkey,
			clientPubkey,
			amount: params.amount,
			currency: 'RBTC',
			status: V1EscrowStatus.Funded,
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash,
			type: 'contract',
			contractAddress
		};

		const contractMessage = JSON.stringify(contractData);
		const tags = TAG_PATTERNS.contract(
			params.escrowId,
			params.taskId,
			params.freelancerPubkey,
			clientPubkey,
			network,
			'v2'
		);
		const tTag = tags.find((t) => t[0] === 't');
		d.log('[V2 CONTRACT] CONTRACT event tags', { tags, taskIdTag: tTag?.[1] ?? params.taskId });

		await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
		d.log('publishContractEvent success', { escrowId: params.escrowId, taskId: params.taskId });
	} catch (error) {
		d.error('publishContractEvent failed', { escrowId: params.escrowId }, error);
		throw error;
	}
}

/**
 * Query CONTRACT events with #v = v2, hydrate with v2 loadEscrowDetails, build ContractWithEvents.
 */
export async function getContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	d.log('getContracts start', {
		limit: filter?.limit,
		until: filter?.until,
		escrowIds: filter?.escrowIds,
		taskIds: filter?.taskIds
	});

	let npub = await getNpub();
	if (npub.startsWith('npub')) {
		npub = nip19.decode(npub).data as string;
	}
	const currentNetwork = import.meta.env.VITE_RSK_NETWORK ?? 'testnet';

	const nostrFilter: Filter = {
		kinds: [KINDS.CONTRACT],
		...TAG_FILTERS.byNpub(npub),
		...TAG_FILTERS.byNetwork(currentNetwork),
		...TAG_FILTERS.byVersion('v2'),
		limit: filter?.limit ?? 5
	};
	if (filter?.escrowIds) nostrFilter['#d'] = filter.escrowIds;
	if (filter?.taskIds) nostrFilter['#t'] = filter.taskIds;
	if (filter?.until) nostrFilter.until = filter.until;
	if (filter?.since) nostrFilter.since = filter.since;

	const contractEventsWithStatus = await queryNostrEvents(
		nostrFilter,
		{
			kinds: [KINDS.CONTRACT_STATUS],
			limit: (filter?.limit ?? 5) * 20
		},
		{ attachAs: 'statusEvents', keepLatest: false }
	);

	d.log('getContracts nostr result', { count: contractEventsWithStatus.length });

	const contractsWithStatuses: ContractWithEvents[] = [];

	for (const event of contractEventsWithStatus) {
		try {
			const contractEvent = event as unknown as ContractEvent;
			const content = contractEvent.content as unknown as NostrContract;
			const statusEvents = (contractEvent.statusEvents as ContractStatusEvent[] | undefined)?.sort(
				(a, b) => a.created_at - b.created_at
			);

			const isClient = content.clientPubkey === npub;
			const isFreelancer = content.freelancerPubkey === npub;

			let escrowData: EscrowData | null = null;
			let blockchainStatus: V1EscrowStatus | null = null;
			let isPending = false;
			const disputeProposal: DisputeProposal | null = null; // V2 stub returns null

			try {
				const contractAddress =
					content.contractAddress &&
					content.contractAddress.toLowerCase() !==
						(import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET ?? '').toLowerCase()
						? content.contractAddress
						: undefined;

				escrowData = await escrow.loadEscrowDetails(content.escrowId, contractAddress);
				if (escrowData) blockchainStatus = escrowData.status as V1EscrowStatus;
			} catch (escrowErr) {
				const msg = escrowErr instanceof Error ? escrowErr.message : String(escrowErr);
				const isNotFound =
					msg.includes('not found') ||
					msg.includes('does not exist') ||
					(msg.includes('reverted') && !msg.includes('provider') && !msg.includes('wallet'));
				if (isNotFound && content.transactionHash) {
					isPending = true;
				} else if (
					msg.includes('provider') ||
					msg.includes('wallet') ||
					msg.includes('not initialized')
				) {
					continue;
				}
			}

			// Map v2 blockchain status to v1-equivalent for determineContractState (v1 enum).
			// V2 WorkInProgress (10) → pass Funded (0) to get canComplete when started; then show 10.
			// V2 FundsReleased (7) → pass v1 FundsReleased (10) to get final state; then show 7.
			let statusForPermissions = blockchainStatus;
			let displayStatusOverride: number | null = null;
			if (blockchainStatus === (V2EscrowStatus.WorkInProgress as number)) {
				statusForPermissions = V1EscrowStatus.Funded;
				displayStatusOverride = V2EscrowStatus.WorkInProgress;
			} else if (blockchainStatus === (V2EscrowStatus.FundsReleased as number)) {
				statusForPermissions = V1EscrowStatus.FundsReleased;
				displayStatusOverride = V2EscrowStatus.FundsReleased;
			}

			const result = determineContractState(
				statusForPermissions,
				statusEvents ?? [],
				content,
				escrowData,
				disputeProposal,
				isPending,
				isClient,
				isFreelancer
			);
			let status = result.status;
			const permissions = result.permissions;
			if (displayStatusOverride !== null) {
				status = displayStatusOverride as V1EscrowStatus;
			}

			if (!escrowData && !isPending) continue;

			if (!escrowData && isPending) {
				escrowData = {
					id: content.escrowId,
					client: content.clientPubkey ?? '',
					freelancer: content.freelancerPubkey ?? '',
					baseAmount: content.amount ?? '0',
					clientFee: '0',
					freelancerFee: '0',
					totalAmount: content.amount ?? '0',
					status: V1EscrowStatus.PendingFunding,
					estimatedStartTime: content.estimatedStartTime ?? 0,
					estimatedCompletionTime: content.estimatedCompletionTime ?? 0,
					completionTime: 0,
					timelockExpiry: 0,
					clientFeeTier: 1,
					freelancerFeeTier: 1,
					createdAt: (contractEvent.created_at ?? 0) * 1000,
					lastUpdated: Date.now()
				};
			}

			if (!escrowData) continue;

			contractsWithStatuses.push({
				contractEvent,
				statusEvents: statusEvents ?? [],
				isClient,
				blockchainStatus,
				escrowData,
				status,
				isPending,
				permissions,
				disputeProposal,
				completionAttachments:
					statusEvents
						?.slice()
						.reverse()
						.find((e) => e.content.completionAttachments)?.content.completionAttachments ?? null
			});
		} catch (err) {
			d.error('getContracts process event', { eventId: event.id }, err);
		}
	}

	let result = contractsWithStatuses;
	if (filter?.statuses?.length) {
		result = result.filter((c) => filter.statuses!.includes(c.status));
	}
	return result.sort((a, b) => b.contractEvent.created_at - a.contractEvent.created_at);
}

/**
 * Publish CONTRACT_STATUS (v2): encrypted DM to the other party with action and txHash.
 * Queries CONTRACT by escrowId and #v=v2 to get recipient; uses TAG_PATTERNS.contractStatus with version 'v2'.
 */
export async function publishContractStatus(params: PublishStatusParams): Promise<void> {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const filter: Filter = {
			kinds: [KINDS.CONTRACT],
			'#d': [params.escrowId],
			...TAG_FILTERS.byVersion('v2'),
			...TAG_FILTERS.byNpub(userPubkeyHex),
			limit: 1
		};
		const events = await queryNostrEvents(filter);
		if (events.length === 0) {
			d.warn('publishContractStatus: no v2 contract found', { escrowId: params.escrowId });
			throw new Error('Contract not found for status update');
		}

		const contractEvent = await decryptContractEvent(events[0] as NostrEvent, userPubkeyHex);
		if (!contractEvent) {
			throw new Error('Failed to decrypt contract for status update');
		}

		const content = contractEvent.content as NostrContract;
		const recipientPubkey =
			userPubkeyHex === content.clientPubkey ? content.freelancerPubkey : content.clientPubkey;

		const statusData = {
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.action,
			message: params.message,
			timestamp: Date.now(),
			transactionHash: params.transactionHash,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount,
			completionAttachments: params.completionAttachments,
			type: 'contract-status' as const
		};
		const tags = TAG_PATTERNS.contractStatus(
			params.contractEventId,
			params.escrowId,
			recipientPubkey,
			params.action,
			'v2'
		);

		await publishNostrEvent(
			KINDS.CONTRACT_STATUS,
			JSON.stringify(statusData),
			recipientPubkey,
			tags
		);
		d.log('publishContractStatus success', {
			escrowId: params.escrowId,
			action: params.action,
			txHash: params.transactionHash?.slice(0, 10)
		});
	} catch (error) {
		d.error('publishContractStatus failed', { escrowId: params.escrowId }, error);
		throw error;
	}
}

/** Stub: delete contract (V2 may support later). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
export async function deleteContract(_contractEventId: string, _escrowId: string): Promise<void> {
	throw new Error('V2 deleteContract not implemented yet');
}

/** Stub: handle status event (will parse v2 tags). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
export async function handleStatusEvent(_event: NostrEvent): Promise<void> {
	// No-op until status flow is wired
}

/**
 * Decrypt CONTRACT event (NIP-44); same flow as v1.
 */
async function decryptContractEvent(
	event: NostrEvent,
	userPubkeyHex: string
): Promise<ContractEvent | null> {
	try {
		const { nsec } = await getNostrKeyPair();
		let otherPubkey: string;
		if (event.pubkey === userPubkeyHex) {
			const recipientTags = event.tags.filter((t) => t[0] === 'p');
			const other = recipientTags.find((t) => t[1] !== userPubkeyHex);
			if (!other?.[1]) return null;
			otherPubkey = other[1];
		} else {
			otherPubkey = event.pubkey;
		}
		const conversationKey = await nip44.getConversationKey(nsec, otherPubkey);
		const decrypted = nip44.decrypt(event.content, conversationKey);
		return { ...event, content: JSON.parse(decrypted) } as ContractEvent;
	} catch (err) {
		if (err instanceof Error && !err.message.includes('Invalid MAC')) {
			d.warn('decryptContractEvent failed', { eventId: event.id }, err);
		}
		return null;
	}
}

/**
 * Handle incoming v2 CONTRACT event (real-time subscription); add to contract store.
 */
export async function handleContractEvent(event: NostrEvent): Promise<void> {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const contractEvent = await decryptContractEvent(event, userPubkeyHex);
		if (!contractEvent) {
			d.warn('handleContractEvent: decrypt failed', { eventId: event.id });
			return;
		}

		const escrowId =
			event.tags.find((t) => t[0] === TAGS.D)?.[1] ?? contractEvent.content?.escrowId;
		if (!escrowId) {
			d.warn('handleContractEvent: missing escrowId');
			return;
		}

		const state = get(contractStore);
		if (state.contractsMap.get(escrowId) !== undefined) {
			d.log('handleContractEvent: already exists', { escrowId });
			return;
		}

		const content = contractEvent.content as NostrContract;
		const isClient = content.clientPubkey === userPubkeyHex;
		const isFreelancer = content.freelancerPubkey === userPubkeyHex;

		let escrowData: EscrowData | null = null;
		let blockchainStatus: V1EscrowStatus | null = null;
		let isPending = false;

		try {
			const contractAddress = content.contractAddress ?? undefined;
			escrowData = await escrow.loadEscrowDetails(escrowId, contractAddress);
			if (escrowData) blockchainStatus = escrowData.status as V1EscrowStatus;
		} catch {
			if (content.transactionHash) isPending = true;
		}

		const { status, permissions } = determineContractState(
			blockchainStatus,
			[],
			content,
			escrowData,
			null,
			isPending,
			isClient,
			isFreelancer
		);

		if (!escrowData && !isPending) return;

		if (!escrowData && isPending) {
			escrowData = {
				id: content.escrowId,
				client: content.clientPubkey ?? '',
				freelancer: content.freelancerPubkey ?? '',
				baseAmount: content.amount ?? '0',
				clientFee: '0',
				freelancerFee: '0',
				totalAmount: content.amount ?? '0',
				status: V1EscrowStatus.PendingFunding,
				estimatedStartTime: content.estimatedStartTime ?? 0,
				estimatedCompletionTime: content.estimatedCompletionTime ?? 0,
				completionTime: 0,
				timelockExpiry: 0,
				clientFeeTier: 1,
				freelancerFeeTier: 1,
				createdAt: (contractEvent.created_at ?? 0) * 1000,
				lastUpdated: Date.now()
			};
		}

		if (!escrowData) return;

		const newContract: ContractWithEvents = {
			contractEvent,
			statusEvents: [],
			isClient,
			blockchainStatus,
			escrowData,
			status,
			isPending,
			permissions,
			disputeProposal: null,
			completionAttachments: null
		};

		contractStore.update((s) => {
			const updated = [newContract, ...s.contracts];
			const map = new Map<string, number>();
			updated.forEach((c, i) => map.set(c.contractEvent.content.escrowId, i));
			return { ...s, contracts: updated, contractsMap: map };
		});

		d.log('handleContractEvent added', { escrowId });
		appStore.showInfoToast(`New contract received: ${content.taskTitle ?? 'Contract'}`);
	} catch (err) {
		d.error('handleContractEvent', { eventId: event.id }, err);
	}
}
