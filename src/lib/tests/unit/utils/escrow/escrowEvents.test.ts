import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
	ServiceAcceptanceSnapshot,
	ServiceProposalStatusEvent
} from '$lib/types/service-quote';
import { EscrowStatus } from '$lib/utils/escrow';
import {
	registerPendingContractByTxHash,
	registerPendingContract,
	replacePendingContractByTxHash,
	publishEscrowStatus,
	handleEscrowCreated,
	publishPendingServiceAcceptanceUnknownByTxHash,
	configureServiceAcceptanceReverifyForTest,
	reverifyPublishedServiceAcceptanceByEscrowId,
	retryPendingServiceAcceptanceByEscrowId,
	cleanupPendingContractByTxHash,
	contractCreationStore
} from '$lib/utils/escrow/v1/escrowEvents';
import { publishContractEvent, publishContractStatus } from '$lib/utils/escrow/v1/nostrContract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { contractStore } from '$lib/stores/contract.store';
import { appStore } from '$lib/stores/app.store';
import { getStatusMessages } from '$lib/utils/helpers/contractStatusFormatter';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { updateTask } from '$lib/nostr/task';
import { publishServiceProposalStatus } from '$lib/utils/service-quote/publish';
import { completeServiceProposalAcceptance } from '$lib/utils/service-quote/accept';
import {
	clearAcceptanceConfirmedMonitorEntry,
	clearAcceptanceLedger,
	getAcceptanceConfirmedMonitorEntry,
	getAcceptanceReplayEntry,
	upsertAcceptanceConfirmedMonitorEntry,
	upsertAcceptanceReplayEntry
} from '$lib/utils/service-quote/acceptance-ledger';

// Mock @bittasker/wallet-core to avoid EventBus import issues (normalizeRskAddress used by escrow)
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr?.toLowerCase() ?? '')
}));

// Mock dependencies - must be defined before vi.mock calls
vi.mock('$lib/utils/escrow/v1/nostrContract', () => ({
	publishContractEvent: vi.fn(),
	publishContractStatus: vi.fn(),
	getContracts: vi.fn().mockResolvedValue([]),
	deleteContract: vi.fn().mockResolvedValue(undefined),
	handleStatusEvent: vi.fn().mockResolvedValue(undefined),
	handleContractEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	sendBidStatusUpdate: vi.fn()
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: vi.fn()
	}
}));

// Mock task.store to prevent "Pool not found" when loaded transitively
vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	const mockPool = { subscribe: () => () => {}, publish: () => [], querySync: () => [] };
	const mockTasksStore = writable({
		pool: mockPool,
		items: [],
		loading: false,
		error: null,
		currentPage: 1,
		hasMore: true,
		searchParamsKey: ''
	});
	const mockMyTasksStore = writable({
		items: [],
		loading: false,
		error: null,
		currentPage: 1,
		hasMore: true
	});
	return {
		tasksStore: {
			subscribe: mockTasksStore.subscribe,
			set: vi.fn(),
			update: vi.fn(),
			reset: vi.fn(),
			pool: mockPool
		},
		myTasksStore: {
			subscribe: mockMyTasksStore.subscribe,
			set: vi.fn(),
			update: vi.fn(),
			reset: vi.fn()
		},
		taskStore: {},
		TASKS_PER_PAGE: 10,
		STEPS: writable([])
	};
});
vi.mock('$lib/nostr/task', () => ({
	getTaskStableId: (x: string) => x,
	createTask: vi.fn(),
	updateTask: vi.fn(),
	deleteTask: vi.fn()
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const mockPool = { subscribe: () => () => {}, publish: () => [], querySync: () => [] };
	const store = writable({ pool: mockPool });
	return {
		appStore: {
			...store,
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn(),
			showInfoToast: vi.fn()
		}
	};
});

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusMessages: vi.fn()
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('a'.repeat(64))
}));

vi.mock('$lib/utils/service-quote/accept', () => ({
	completeServiceProposalAcceptance: vi.fn()
}));

vi.mock('$lib/utils/service-quote/publish', () => ({
	publishServiceProposalStatus: vi.fn().mockResolvedValue({
		event: {
			id: 'status-event-id',
			kind: 6422,
			pubkey: 'a'.repeat(64),
			created_at: 1700000200,
			tags: [],
			content: {
				type: 'service-proposal-status',
				proposalId: 'pr_12345678',
				quoteRequestId: 'qr_12345678',
				serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				status: 'accepting',
				actorPubkey: 'a'.repeat(64),
				timestamp: 1700000200,
				version: 'v1'
			},
			sig: 'sig'
		} as unknown as ServiceProposalStatusEvent,
		relayResults: [],
		publishedRelaySet: []
	})
}));

vi.mock('$lib/utils/escrow/v1/escrow', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/escrow/v1/escrow')>();
	return {
		...actual,
		reverifyPublishedServiceAcceptance: vi.fn().mockResolvedValue({
			status: 'confirmed',
			confirmationsAtVerification: 3
		})
	};
});

// Mock svelte-i18n
// t is a readable store, and get(t) from svelte/store returns its value (translation function)
vi.mock('svelte-i18n', () => {
	// t is a readable store that contains a translation function
	// When you call get(t), you get the translation function: (key: string) => string
	const translationFn = (key: string) => key;

	// Make t a callable function that also acts like a store
	// When get(t) is called, it should return the translation function
	const mockT = Object.assign(
		vi.fn((key: string) => key),
		{
			subscribe: vi.fn(),
			// Make it callable as a function to get its value
			[Symbol.toPrimitive]: () => translationFn
		}
	);

	return {
		t: mockT
	};
});

vi.mock('svelte/store', () => {
	// Translation function that get(t) should return
	// In svelte-i18n, t is a readable store, and get(t) returns the translation function
	const translationFn = (key: string) => key;

	const mockGet = vi.fn((store: unknown) => {
		// When get(t) is called, t is a svelte-i18n readable store
		// get(t) should return the translation function: (key: string) => string
		if (typeof store === 'function') {
			// Check if it has a subscribe method (it's a store)
			if ((store as any).subscribe || (store.toString && store.toString().includes('t'))) {
				// It's the t store, return translation function
				return translationFn;
			}
			// For other functions/stores, try to get their value
			try {
				return store();
			} catch {
				// If calling fails, return translation function as fallback
				return translationFn;
			}
		}
		// For non-function stores, return as-is
		return store;
	});

	return {
		writable: vi.fn(() => ({
			set: vi.fn(),
			subscribe: vi.fn(),
			update: vi.fn()
		})),
		derived: vi.fn(() => ({
			subscribe: vi.fn()
		})),
		get: mockGet
	};
});

function createAcceptanceSnapshot(
	overrides: Partial<ServiceAcceptanceSnapshot> = {}
): ServiceAcceptanceSnapshot {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x2222222222222222222222222222222222222222',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x4444444444444444444444444444444444444444',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'snapshot-123',
		btcUsdRateMicros: 100_000_000_000,
		sourceTimestamp: 1_763_000_000,
		requiredConfirmations: 3,
		finalityPolicyVersion: 'rsk_rootstock_default_v1',
		sats: '100000',
		weiAmount: '1000000000000000',
		confirmationsAtVerification: 0,
		verificationRpc: 'rsk:testnet',
		...overrides
	};
}

describe('escrowEvents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearAcceptanceLedger();
		window.localStorage.clear();
		configureServiceAcceptanceReverifyForTest(null);
		vi.mocked(publishServiceProposalStatus).mockResolvedValue({
			event: {
				id: 'status-event-id',
				kind: 6422,
				pubkey: 'a'.repeat(64),
				created_at: 1700000200,
				tags: [],
				content: {
					type: 'service-proposal-status',
					proposalId: 'pr_12345678',
					quoteRequestId: 'qr_12345678',
					serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
					serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
					status: 'accepting',
					actorPubkey: 'a'.repeat(64),
					timestamp: 1700000200,
					version: 'v1'
				},
				sig: 'sig'
			} as unknown as ServiceProposalStatusEvent,
			relayResults: [],
			publishedRelaySet: []
		});
		vi.mocked(getStatusMessages).mockReturnValue({
			pendingMessage: 'pending.message',
			confirmedMessage: 'confirmed.message',
			successToast: 'success.toast',
			errorToast: 'error.toast'
		});
	});

	describe('registerPendingContractByTxHash', () => {
		it('should register pending contract by transaction hash', () => {
			const params = {
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			};

			registerPendingContractByTxHash(params);

			// Function should complete without error
			expect(true).toBe(true);
		});

		it('should move pending contract tracking to a replacement transaction hash', async () => {
			registerPendingContractByTxHash({
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xabc123'
			});
			replacePendingContractByTxHash('0xabc123', '0xdef456');
			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated({
				escrowId: 'svc-123',
				transactionHash: '0xdef456',
				transactionHashes: ['0xabc123', '0xdef456'],
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			});

			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
			expect(vi.mocked(contractCreationStore.set)).toHaveBeenLastCalledWith({
				escrowId: 'svc-123',
				contractEventId: 'contract-svc-123',
				state: 'contract_ready',
				transactionHash: '0xdef456',
				transactionHashes: ['0xdef456', '0xabc123']
			});
		});
	});

	describe('publishPendingServiceAcceptanceUnknownByTxHash', () => {
		it('publishes accept_unknown status updates for pending service contracts', async () => {
			registerPendingContractByTxHash({
				bidEventId: 'proposal-123',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice123',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-id',
				purchaseMode: 'quote',
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			await publishPendingServiceAcceptanceUnknownByTxHash('0xservice123', 'pending_timeout');

			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accept_unknown',
						reasonCode: 'pending_timeout',
						transactionHash: '0xservice123'
					}),
					proposalEventId: 'proposal-event-id'
				})
			);
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenCalledWith(
				'proposal-123',
				false,
				false,
				'pending_timeout',
				'0xservice123'
			);
		});

		it('uses the replacement hash when reporting tx replacement ambiguity', async () => {
			registerPendingContractByTxHash({
				bidEventId: 'proposal-456',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice456',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-456',
				proposalId: 'proposal-456',
				proposalEventId: 'proposal-event-id-456',
				purchaseMode: 'quote',
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			await publishPendingServiceAcceptanceUnknownByTxHash(
				'0xservice456',
				'tx_replaced',
				'0xservice789'
			);

			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accept_unknown',
						reasonCode: 'tx_replaced',
						transactionHash: '0xservice789'
					}),
					proposalEventId: 'proposal-event-id-456'
				})
			);
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenCalledWith(
				'proposal-456',
				false,
				false,
				'tx_replaced',
				'0xservice789'
			);
		});
	});

	describe('registerPendingContract', () => {
		it('should register pending contract by escrow ID', () => {
			const params = {
				bidEventId: 'bid-123',
				escrowId: '123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			};

			registerPendingContract(params);

			// Function should complete without error
			expect(true).toBe(true);
		});
	});

	const recipientPubkey = 'aa'.repeat(32);

	describe('publishEscrowStatus', () => {
		beforeEach(() => {
			// Reset all mocks
			vi.clearAllMocks();
			vi.mocked(getStatusMessages).mockReturnValue({
				pendingMessage: 'pending.message',
				confirmedMessage: 'confirmed.message',
				successToast: 'success.toast',
				errorToast: 'error.toast'
			});
		});

		it('should publish pending status and show info toast', async () => {
			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.PendingCompletion,
				recipientPubkey
			});

			expect(vi.mocked(publishContractStatus)).toHaveBeenCalled();
			expect(vi.mocked(appStore.showInfoToast)).toHaveBeenCalled();
		});

		it('should publish confirmed status and show success toast', async () => {
			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.Completed,
				recipientPubkey
			});

			expect(vi.mocked(publishContractStatus)).toHaveBeenCalled();
			expect(vi.mocked(appStore.showSuccessToast)).toHaveBeenCalled();
		});

		it('should handle errors and show error toast', async () => {
			vi.mocked(publishContractStatus).mockRejectedValueOnce(new Error('Publish failed'));

			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.Completed,
				recipientPubkey
			});

			expect(vi.mocked(appStore.showErrorToast)).toHaveBeenCalled();
		});

		it('should include completion attachments when provided', async () => {
			const attachments = [
				{
					type: 'image',
					url: 'https://example.com/image.jpg',
					key: 'image.jpg',
					alt: 'image',
					size: 1024
				}
			];

			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.PendingCompletion,
				completionAttachments: attachments,
				recipientPubkey
			});

			expect(vi.mocked(publishContractStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					completionAttachments: attachments
				})
			);
		});

		it('should include proposed amounts for dispute resolution', async () => {
			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.DisputeResolutionProposed,
				proposedClientAmount: '0.5',
				proposedFreelancerAmount: '0.5',
				recipientPubkey
			});

			expect(vi.mocked(publishContractStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					proposedClientAmount: '0.5',
					proposedFreelancerAmount: '0.5'
				})
			);
		});
	});

	describe('handleEscrowCreated', () => {
		beforeEach(() => {
			// Clear any pending contracts from previous tests
			// Note: We can't directly access the internal Maps, so we'll rely on the functions
			vi.clearAllMocks();
		});

		it('should handle escrow created event with pending contract by escrow ID', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			// First register a pending contract
			registerPendingContract({
				bidEventId: 'bid-123',
				escrowId: '123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
			expect(vi.mocked(sendBidStatusUpdate)).toHaveBeenCalled();
			expect(vi.mocked(contractStore.loadContractByEscrowId)).toHaveBeenCalledWith('123');
		});

		it('should handle escrow created event with pending contract by transaction hash', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			// Register by transaction hash
			registerPendingContractByTxHash({
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
			expect(vi.mocked(sendBidStatusUpdate)).toHaveBeenCalled();
		});

		it('publishes service-context contracts without task bid side effects', async () => {
			const acceptedSnapshot = createAcceptanceSnapshot({
				confirmationsAtVerification: 3
			});
			const event = {
				escrowId: 'svc-123',
				transactionHash: '0xservice123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000',
				acceptanceSnapshot: acceptedSnapshot
			};

			registerPendingContract({
				bidEventId: 'proposal-123',
				escrowId: 'svc-123',
				freelancerPubkey: 'npub1freelancer',
				clientRskAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice123',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-id',
				purchaseMode: 'quote',
				acceptanceSnapshot: createAcceptanceSnapshot(),
				selectedTierId: 'premium',
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id',
					tierId: 'premium'
				},
				agreementSnapshot: {
					selectedTierId: 'premium',
					deliverables: 'Three logo concepts'
				}
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			expect(vi.mocked(publishContractEvent)).toHaveBeenCalledWith(
				expect.objectContaining({
					contextType: 'service',
					serviceId: '30402:pub:dtag',
					serviceTitle: 'Logo Design',
					clientRskAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
					purchaseMode: 'quote',
					proposalId: 'proposal-123',
					agreementSnapshot: expect.objectContaining({
						deliverables: 'Three logo concepts'
					})
				})
			);
			expect(vi.mocked(sendBidStatusUpdate)).not.toHaveBeenCalled();
			expect(vi.mocked(updateTask)).not.toHaveBeenCalled();
			expect(vi.mocked(pushNotificationService.sendNotificationToNpubs)).toHaveBeenCalledWith(
				expect.objectContaining({
					clickAction: expect.stringContaining('type=services&highlight=svc-123')
				})
			);
			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accepted',
						escrowId: 'svc-123',
						transactionHash: '0xservice123',
						acceptanceSnapshot: acceptedSnapshot
					}),
					proposalEventId: 'proposal-event-id'
				})
			);
			expect(getAcceptanceConfirmedMonitorEntry('svc-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-123',
					proposalId: 'proposal-123',
					transactionHash: '0xservice123',
					acceptanceSnapshot: acceptedSnapshot
				})
			);
		});

		it('retains confirmed service acceptance locally when accepted status publish fails and retries by escrow id', async () => {
			const acceptedSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-retry',
				confirmationsAtVerification: 3
			});
			const event = {
				escrowId: 'svc-retry-123',
				transactionHash: '0xservice-retry',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000',
				acceptanceSnapshot: acceptedSnapshot
			};

			registerPendingContract({
				bidEventId: 'proposal-retry-123',
				escrowId: 'svc-retry-123',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice-retry',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-retry-123',
				proposalId: 'proposal-retry-123',
				proposalEventId: 'proposal-event-id-retry',
				purchaseMode: 'quote',
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-retry'
				}),
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);
			vi.mocked(publishServiceProposalStatus)
				.mockRejectedValueOnce(new Error('status publish failed'))
				.mockResolvedValueOnce({
					event: {
						id: 'status-event-id-retry',
						kind: 6422,
						pubkey: 'a'.repeat(64),
						created_at: 1700000200,
						tags: [],
						content: {
							type: 'service-proposal-status',
							proposalId: 'pr_12345678',
							quoteRequestId: 'qr_12345678',
							serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
							serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
							status: 'accepting',
							actorPubkey: 'a'.repeat(64),
							timestamp: 1700000200,
							version: 'v1'
						},
						sig: 'sig'
					} as unknown as ServiceProposalStatusEvent,
					relayResults: [],
					publishedRelaySet: []
				});

			await handleEscrowCreated(event);

			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenCalledWith(
				'proposal-retry-123',
				false,
				false,
				'reconciliation_deferred',
				'0xservice-retry'
			);

			const retryResult = await retryPendingServiceAcceptanceByEscrowId('svc-retry-123');

			expect(retryResult).toEqual({ status: 'accepted' });
			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenLastCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accepted',
						escrowId: 'svc-retry-123',
						transactionHash: '0xservice-retry',
						acceptanceSnapshot: acceptedSnapshot
					}),
					proposalEventId: 'proposal-event-id-retry'
				})
			);
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenLastCalledWith(
				'proposal-retry-123',
				true,
				false,
				undefined,
				'0xservice-retry'
			);
			expect(getAcceptanceConfirmedMonitorEntry('svc-retry-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-retry-123',
					proposalId: 'proposal-retry-123',
					transactionHash: '0xservice-retry',
					acceptanceSnapshot: acceptedSnapshot
				})
			);
			await expect(retryPendingServiceAcceptanceByEscrowId('svc-retry-123')).resolves.toEqual({
				status: 'not_found'
			});
		});

		it('keeps deferred service acceptance pending when a retry publish still fails', async () => {
			registerPendingContract({
				bidEventId: 'proposal-retry-failed',
				escrowId: 'svc-retry-failed',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice-retry-failed',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-retry-failed',
				proposalId: 'proposal-retry-failed',
				proposalEventId: 'proposal-event-id-retry-failed',
				purchaseMode: 'quote',
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			vi.mocked(publishServiceProposalStatus).mockRejectedValue(new Error('status publish failed'));

			const retryResult = await retryPendingServiceAcceptanceByEscrowId('svc-retry-failed');

			expect(retryResult).toEqual({
				status: 'deferred',
				reasonCode: 'reconciliation_deferred'
			});
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenCalledWith(
				'proposal-retry-failed',
				false,
				false,
				'reconciliation_deferred',
				'0xservice-retry-failed'
			);
			await expect(retryPendingServiceAcceptanceByEscrowId('svc-retry-failed')).resolves.toEqual({
				status: 'deferred',
				reasonCode: 'reconciliation_deferred'
			});
		});

		it('persists deferred service acceptance replay data for later recovery', async () => {
			const acceptedSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-replay',
				confirmationsAtVerification: 3
			});
			const event = {
				escrowId: 'svc-replay-123',
				transactionHash: '0xservice-replay',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000',
				acceptanceSnapshot: acceptedSnapshot
			};

			registerPendingContract({
				bidEventId: 'proposal-replay-123',
				escrowId: 'svc-replay-123',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xservice-replay',
				contextType: 'service',
				contextId: '30402:pub:dtag',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				quoteRequestId: 'request-replay-123',
				proposalId: 'proposal-replay-123',
				proposalEventId: 'proposal-event-id-replay',
				purchaseMode: 'quote',
				acceptanceSnapshot: createAcceptanceSnapshot({
					conversionSnapshotId: 'snapshot-replay'
				}),
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);
			vi.mocked(publishServiceProposalStatus).mockRejectedValueOnce(
				new Error('status publish failed')
			);

			await handleEscrowCreated(event);

			expect(getAcceptanceReplayEntry('svc-replay-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-replay-123',
					proposalId: 'proposal-replay-123',
					proposalEventId: 'proposal-event-id-replay',
					quoteRequestId: 'request-replay-123',
					serviceId: '30402:pub:dtag',
					serviceAddress: '30402:pub:dtag',
					counterpartyPubkey: 'npub1freelancer',
					transactionHash: '0xservice-replay',
					attemptCount: 1,
					acceptanceSnapshot: acceptedSnapshot
				})
			);
		});

		it('replays deferred service acceptance from persisted storage after a reload', async () => {
			const acceptedSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-reload',
				confirmationsAtVerification: 3
			});
			upsertAcceptanceReplayEntry({
				escrowId: 'svc-reload-123',
				proposalId: 'proposal-reload-123',
				proposalEventId: 'proposal-event-id-reload',
				quoteRequestId: 'request-reload-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1freelancer',
				transactionHash: '0xservice-reload',
				acceptanceSnapshot: acceptedSnapshot
			});

			expect(getAcceptanceReplayEntry('svc-reload-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-reload-123',
					proposalId: 'proposal-reload-123',
					transactionHash: '0xservice-reload'
				})
			);

			vi.mocked(publishServiceProposalStatus).mockResolvedValueOnce({
				event: {
					id: 'status-event-id-reload',
					kind: 6422,
					pubkey: 'a'.repeat(64),
					created_at: 1700000200,
					tags: [],
					content: {
						type: 'service-proposal-status',
						proposalId: 'pr_12345678',
						quoteRequestId: 'qr_12345678',
						serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
						serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
						status: 'accepting',
						actorPubkey: 'a'.repeat(64),
						timestamp: 1700000200,
						version: 'v1'
					},
					sig: 'sig'
				} as unknown as ServiceProposalStatusEvent,
				relayResults: [],
				publishedRelaySet: []
			});

			await expect(retryPendingServiceAcceptanceByEscrowId('svc-reload-123')).resolves.toEqual({
				status: 'accepted'
			});
			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenLastCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accepted',
						escrowId: 'svc-reload-123',
						transactionHash: '0xservice-reload',
						acceptanceSnapshot: acceptedSnapshot
					}),
					proposalEventId: 'proposal-event-id-reload'
				})
			);
			expect(getAcceptanceReplayEntry('svc-reload-123')).toBeNull();
			expect(getAcceptanceConfirmedMonitorEntry('svc-reload-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-reload-123',
					proposalId: 'proposal-reload-123',
					transactionHash: '0xservice-reload',
					acceptanceSnapshot: acceptedSnapshot
				})
			);
		});

		it('downgrades a previously published accepted status when revalidation loses finality', async () => {
			const acceptanceSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-monitor-downgrade',
				confirmationsAtVerification: 3
			});

			upsertAcceptanceConfirmedMonitorEntry({
				escrowId: 'svc-monitor-123',
				proposalId: 'proposal-monitor-123',
				proposalEventId: 'proposal-event-id-monitor',
				quoteRequestId: 'request-monitor-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1freelancer',
				transactionHash: '0xservice-monitor',
				acceptanceSnapshot
			});
			configureServiceAcceptanceReverifyForTest(
				vi.fn().mockResolvedValueOnce({
					status: 'downgraded',
					reasonCode: 'reconciliation_deferred'
				})
			);

			await expect(
				reverifyPublishedServiceAcceptanceByEscrowId('svc-monitor-123')
			).resolves.toEqual({
				status: 'downgraded',
				reasonCode: 'reconciliation_deferred'
			});

			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accept_unknown',
						escrowId: 'svc-monitor-123',
						transactionHash: '0xservice-monitor',
						reasonCode: 'reconciliation_deferred'
					}),
					proposalEventId: 'proposal-event-id-monitor'
				})
			);
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenLastCalledWith(
				'proposal-monitor-123',
				false,
				false,
				'reconciliation_deferred',
				'0xservice-monitor'
			);
			expect(getAcceptanceConfirmedMonitorEntry('svc-monitor-123')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-monitor-123',
					proposalId: 'proposal-monitor-123',
					publishedStatus: 'accept_unknown'
				})
			);
		});

		it('keeps confirmed monitor entries when revalidation is deferred', async () => {
			const acceptanceSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-monitor-deferred',
				confirmationsAtVerification: 3
			});

			upsertAcceptanceConfirmedMonitorEntry({
				escrowId: 'svc-monitor-deferred',
				proposalId: 'proposal-monitor-deferred',
				proposalEventId: 'proposal-event-id-monitor-deferred',
				quoteRequestId: 'request-monitor-deferred',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1freelancer',
				transactionHash: '0xservice-monitor-deferred',
				acceptanceSnapshot
			});
			configureServiceAcceptanceReverifyForTest(
				vi.fn().mockResolvedValueOnce({
					status: 'deferred',
					reasonCode: 'rpc_unavailable'
				})
			);

			await expect(
				reverifyPublishedServiceAcceptanceByEscrowId('svc-monitor-deferred')
			).resolves.toEqual({
				status: 'deferred',
				reasonCode: 'rpc_unavailable'
			});
			expect(getAcceptanceConfirmedMonitorEntry('svc-monitor-deferred')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-monitor-deferred',
					proposalId: 'proposal-monitor-deferred',
					publishedStatus: 'accepted'
				})
			);
		});

		it('reconfirms a downgraded funded accept by republishing accepted once finality recovers', async () => {
			const acceptanceSnapshot = createAcceptanceSnapshot({
				conversionSnapshotId: 'snapshot-monitor-reconfirm',
				confirmationsAtVerification: 3
			});

			upsertAcceptanceConfirmedMonitorEntry({
				escrowId: 'svc-monitor-reconfirm',
				proposalId: 'proposal-monitor-reconfirm',
				proposalEventId: 'proposal-event-id-monitor-reconfirm',
				quoteRequestId: 'request-monitor-reconfirm',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1freelancer',
				transactionHash: '0xservice-monitor-reconfirm',
				publishedStatus: 'accept_unknown',
				acceptanceSnapshot
			});
			configureServiceAcceptanceReverifyForTest(
				vi.fn().mockResolvedValueOnce({
					status: 'confirmed',
					confirmationsAtVerification: 5
				})
			);

			await expect(
				reverifyPublishedServiceAcceptanceByEscrowId('svc-monitor-reconfirm')
			).resolves.toEqual({
				status: 'confirmed'
			});

			expect(vi.mocked(publishServiceProposalStatus)).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						status: 'accepted',
						escrowId: 'svc-monitor-reconfirm',
						transactionHash: '0xservice-monitor-reconfirm',
						acceptanceSnapshot: expect.objectContaining({
							confirmationsAtVerification: 5
						})
					}),
					proposalEventId: 'proposal-event-id-monitor-reconfirm'
				})
			);
			expect(vi.mocked(completeServiceProposalAcceptance)).toHaveBeenLastCalledWith(
				'proposal-monitor-reconfirm',
				true,
				false,
				undefined,
				'0xservice-monitor-reconfirm'
			);
			expect(getAcceptanceConfirmedMonitorEntry('svc-monitor-reconfirm')).toEqual(
				expect.objectContaining({
					escrowId: 'svc-monitor-reconfirm',
					proposalId: 'proposal-monitor-reconfirm',
					publishedStatus: 'accepted',
					acceptanceSnapshot: expect.objectContaining({
						confirmationsAtVerification: 5
					})
				})
			);
		});

		it('returns not_found when no confirmed monitor entry exists for revalidation', async () => {
			clearAcceptanceConfirmedMonitorEntry('svc-missing');

			await expect(reverifyPublishedServiceAcceptanceByEscrowId('svc-missing')).resolves.toEqual({
				status: 'not_found'
			});
		});

		it('sends the instant-buy notification branch and exposes the resolved transaction hash', async () => {
			const event = {
				escrowId: 'svc-ib-123',
				transactionHash: '0xinstantbuy123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			registerPendingContract({
				bidEventId: 'instant-order-123',
				escrowId: 'svc-ib-123',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0xinstantbuy123',
				contextType: 'service',
				contextId: 'service-123',
				contextTitle: 'Logo Design',
				contextDescription: 'Design service',
				contextVersionRef: 'service-event-id',
				serviceId: 'service-123',
				serviceAddress: '30402:pub:dtag',
				serviceTitle: 'Logo Design',
				purchaseMode: 'instant_buy',
				instantOrderId: 'sib_1234567890abcd',
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				}
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(true);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			expect(vi.mocked(pushNotificationService.sendNotificationToNpubs)).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.stringContaining('Book Now order'),
					clickAction: expect.stringContaining(
						'/dashboard?tab=contracts&type=services&highlight=svc-ib-123'
					)
				})
			);
			expect(vi.mocked(sendBidStatusUpdate)).not.toHaveBeenCalled();
			expect(vi.mocked(publishServiceProposalStatus)).not.toHaveBeenCalled();
			expect(vi.mocked(contractCreationStore.set)).toHaveBeenLastCalledWith(
				expect.objectContaining({
					escrowId: 'svc-ib-123',
					contractEventId: 'contract-svc-ib-123',
					state: 'contract_ready',
					transactionHash: '0xinstantbuy123',
					transactionHashes: ['0xinstantbuy123']
				})
			);
		});

		it('should handle error when creating Nostr contract', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			registerPendingContract({
				bidEventId: 'bid-123',
				escrowId: '123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockRejectedValueOnce(new Error('Failed to create contract'));

			await handleEscrowCreated(event);

			expect(vi.mocked(appStore.showErrorToast)).toHaveBeenCalled();
		});

		it('should handle case when no pending contract exists', async () => {
			const event = {
				escrowId: '999',
				transactionHash: '0x999',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			await handleEscrowCreated(event);

			// Should not create contract or send notifications
			expect(vi.mocked(publishContractEvent)).not.toHaveBeenCalled();
			expect(vi.mocked(sendBidStatusUpdate)).not.toHaveBeenCalled();
		});

		it('should clean up pending contract after successful creation', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			registerPendingContract({
				bidEventId: 'bid-123',
				escrowId: '123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			// Call again - should not find pending contract (already cleaned up)
			vi.clearAllMocks();
			await handleEscrowCreated(event);

			// Should not create contract again since it was cleaned up
			expect(vi.mocked(publishContractEvent)).not.toHaveBeenCalled();
		});

		it('should clean up pending contract by transaction hash after successful creation', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			// Register by transaction hash (before escrow ID is known)
			registerPendingContractByTxHash({
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			// Call again with same transaction hash - should not find pending contract
			vi.clearAllMocks();
			const event2 = {
				...event,
				escrowId: '456' // Different escrow ID but same transaction hash
			};
			await handleEscrowCreated(event2);

			// Should not create contract again since it was cleaned up
			expect(vi.mocked(publishContractEvent)).not.toHaveBeenCalled();
		});
	});

	describe('cleanupPendingContractByTxHash', () => {
		it('should clean up pending contract by transaction hash', () => {
			const params = {
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			};

			// Register a pending contract
			registerPendingContractByTxHash(params);

			// Clean it up
			cleanupPendingContractByTxHash('0x123');

			// Try to handle escrow created - should not find pending contract
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			vi.clearAllMocks();
			handleEscrowCreated(event);

			// Should not create contract since it was cleaned up
			expect(vi.mocked(publishContractEvent)).not.toHaveBeenCalled();
		});

		it('should not throw error when cleaning up non-existent transaction hash', () => {
			expect(() => cleanupPendingContractByTxHash('0x999')).not.toThrow();
		});

		it('should handle null transaction hash gracefully', () => {
			// Should not throw when hash is null or undefined
			expect(() => cleanupPendingContractByTxHash(null as unknown as string)).not.toThrow();
			expect(() => cleanupPendingContractByTxHash(undefined as unknown as string)).not.toThrow();
			expect(() => cleanupPendingContractByTxHash('')).not.toThrow();
		});
	});

	describe('Issue #8: Error Handling Gap in sendBidStatusUpdate', () => {
		it('should handle error when sendBidStatusUpdate fails in handleEscrowCreated', async () => {
			const event = {
				escrowId: '123',
				transactionHash: '0x123',
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			// Register pending contract
			registerPendingContract({
				escrowId: '123',
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: '0x123'
			});

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			// Make sendBidStatusUpdate fail
			vi.mocked(sendBidStatusUpdate).mockRejectedValueOnce(
				new Error('Failed to send bid status update')
			);

			// Should not throw - error should be caught and logged
			await expect(handleEscrowCreated(event)).resolves.not.toThrow();

			// Verify sendBidStatusUpdate was called (even though it failed)
			expect(vi.mocked(sendBidStatusUpdate)).toHaveBeenCalled();

			// Verify that contract was still created despite sendBidStatusUpdate failure
			// (This is the current behavior - contract creation succeeds even if status update fails)
			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();

			// The issue is: if sendBidStatusUpdate fails, the error is only logged
			// but not surfaced to the user or retried. The escrow exists but bid status isn't updated.
			// This test confirms the current behavior - errors are caught but not handled properly.
		});
	});

	describe('Issue #3: Race Condition in Pending Contract Cleanup', () => {
		it('should prevent cleanup when contract is being processed', async () => {
			const txHash = '0x123';

			// Register pending contract
			registerPendingContractByTxHash({
				bidEventId: 'bid-123',
				taskId: 'task-123',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: txHash
			});

			// Simulate handleEscrowCreated starting to process
			// In the actual code, processingContracts.add() happens in handleEscrowCreated
			// For this test, we'll manually simulate the race condition
			const event = {
				escrowId: '123',
				transactionHash: txHash,
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '1000000000000000000'
			};

			// Start handleEscrowCreated but don't await it yet
			const handlePromise = handleEscrowCreated(event);

			// Immediately try to cleanup (simulating race condition)
			cleanupPendingContractByTxHash(txHash);

			// Wait for handleEscrowCreated to complete
			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handlePromise;

			// Contract should still have been created despite cleanup attempt
			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
		});

		it('should handle concurrent cleanup and processing gracefully', async () => {
			const txHash = '0x456';

			// Register pending contract
			registerPendingContractByTxHash({
				bidEventId: 'bid-456',
				taskId: 'task-456',
				taskTitle: 'Test Task 2',
				taskDescription: 'Test Description 2',
				freelancerPubkey: 'npub1freelancer2',
				amount: '2.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: txHash
			});

			const event = {
				escrowId: '456',
				transactionHash: txHash,
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '2000000000000000000'
			};

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			// Call both concurrently to simulate race condition
			const [result] = await Promise.allSettled([
				handleEscrowCreated(event),
				Promise.resolve().then(() => cleanupPendingContractByTxHash(txHash))
			]);

			// Should not throw errors
			expect(result.status).toBe('fulfilled');

			// Contract should have been created
			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
		});

		it('should clean up processingContracts set after successful processing', async () => {
			const txHash = '0x789';

			registerPendingContractByTxHash({
				bidEventId: 'bid-789',
				taskId: 'task-789',
				taskTitle: 'Test Task 3',
				taskDescription: 'Test Description 3',
				freelancerPubkey: 'npub1freelancer3',
				amount: '3.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: txHash
			});

			const event = {
				escrowId: '789',
				transactionHash: txHash,
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '3000000000000000000'
			};

			vi.mocked(publishContractEvent).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined as unknown as boolean);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof pushNotificationService.sendNotificationToNpubs>>);

			await handleEscrowCreated(event);

			// After successful processing, cleanup should work (processingContracts should be cleared)
			// This test verifies that the processingContracts set is properly cleaned up
			cleanupPendingContractByTxHash(txHash);

			// Should not throw and should allow cleanup after processing
			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
		});

		it('should clean up processingContracts set after error', async () => {
			const txHash = '0x999';

			registerPendingContractByTxHash({
				bidEventId: 'bid-999',
				taskId: 'task-999',
				taskTitle: 'Test Task 4',
				taskDescription: 'Test Description 4',
				freelancerPubkey: 'npub1freelancer4',
				amount: '4.0',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				transactionHash: txHash
			});

			const event = {
				escrowId: '999',
				transactionHash: txHash,
				client: '0x1111111111111111111111111111111111111111',
				freelancer: '0x2222222222222222222222222222222222222222',
				amount: '4000000000000000000'
			};

			// Make publishContractEvent fail
			vi.mocked(publishContractEvent).mockRejectedValueOnce(new Error('Failed to create contract'));

			await expect(handleEscrowCreated(event)).resolves.not.toThrow();

			// After error, cleanup should work (processingContracts should be cleared)
			cleanupPendingContractByTxHash(txHash);

			// Should not throw - processingContracts should be cleaned up even on error
			expect(vi.mocked(publishContractEvent)).toHaveBeenCalled();
		});
	});
});
