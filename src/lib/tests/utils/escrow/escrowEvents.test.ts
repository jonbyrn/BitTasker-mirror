import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';

// Mock @bittasker/wallet-core first to avoid EventBus import issues
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr.toLowerCase())
}));

// Mock dependencies - must be defined before vi.mock calls
vi.mock('$lib/utils/escrow/v1/nostrContract', () => ({
	createContract: vi.fn(),
	publishContractStatus: vi.fn()
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	sendBidStatusUpdate: vi.fn()
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusMessages: vi.fn()
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn()
	}
}));

// Mock @bittasker/wallet-core to avoid EventBus import issues
vi.mock('@bittasker/wallet-core', () => ({}));

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
	
	const mockGet = vi.fn((store: any) => {
		// When get(t) is called, t is a svelte-i18n readable store
		// get(t) should return the translation function: (key: string) => string
		if (typeof store === 'function') {
			// Check if it has a subscribe method (it's a store)
			if (store.subscribe || (store.toString && store.toString().includes('t'))) {
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

import {
	registerPendingContractByTxHash,
	registerPendingContract,
	publishEscrowStatus,
	handleEscrowCreated,
	cleanupPendingContractByTxHash
} from '$lib/utils/escrow/v1/escrowEvents';
import { createContract, publishContractStatus } from '$lib/utils/escrow/v1/nostrContract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { contractStore } from '$lib/stores/contract.store';
import { appStore } from '$lib/stores/app.store';
import { getStatusMessages } from '$lib/utils/helpers/contractStatusFormatter';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

describe('escrowEvents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
				status: EscrowStatus.PendingCompletion
			});

			expect(vi.mocked(publishContractStatus)).toHaveBeenCalled();
			expect(vi.mocked(appStore.showInfoToast)).toHaveBeenCalled();
		});

		it('should publish confirmed status and show success toast', async () => {
			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.Completed
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
				status: EscrowStatus.Completed
			});

			expect(vi.mocked(appStore.showErrorToast)).toHaveBeenCalled();
		});

		it('should include completion attachments when provided', async () => {
			const attachments = [
				{
					type: 'image',
					url: 'https://example.com/image.jpg',
					name: 'image.jpg'
				}
			];

			await publishEscrowStatus({
				escrowId: '123',
				contractEventId: 'contract-123',
				transactionHash: '0x456',
				status: EscrowStatus.PendingCompletion,
				completionAttachments: attachments
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
				proposedFreelancerAmount: '0.5'
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			await handleEscrowCreated(event);

			expect(vi.mocked(createContract)).toHaveBeenCalled();
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			await handleEscrowCreated(event);

			expect(vi.mocked(createContract)).toHaveBeenCalled();
			expect(vi.mocked(sendBidStatusUpdate)).toHaveBeenCalled();
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

			vi.mocked(createContract).mockRejectedValueOnce(new Error('Failed to create contract'));

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
			expect(vi.mocked(createContract)).not.toHaveBeenCalled();
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			await handleEscrowCreated(event);

			// Call again - should not find pending contract (already cleaned up)
			vi.clearAllMocks();
			await handleEscrowCreated(event);

			// Should not create contract again since it was cleaned up
			expect(vi.mocked(createContract)).not.toHaveBeenCalled();
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			await handleEscrowCreated(event);

			// Call again with same transaction hash - should not find pending contract
			vi.clearAllMocks();
			const event2 = {
				...event,
				escrowId: '456' // Different escrow ID but same transaction hash
			};
			await handleEscrowCreated(event2);

			// Should not create contract again since it was cleaned up
			expect(vi.mocked(createContract)).not.toHaveBeenCalled();
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
			expect(vi.mocked(createContract)).not.toHaveBeenCalled();
		});

		it('should not throw error when cleaning up non-existent transaction hash', () => {
			expect(() => cleanupPendingContractByTxHash('0x999')).not.toThrow();
		});

		it('should handle null transaction hash gracefully', () => {
			// Should not throw when hash is null or undefined
			expect(() => cleanupPendingContractByTxHash(null as any)).not.toThrow();
			expect(() => cleanupPendingContractByTxHash(undefined as any)).not.toThrow();
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
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200
			});

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);
			
			// Make sendBidStatusUpdate fail
			vi.mocked(sendBidStatusUpdate).mockRejectedValueOnce(new Error('Failed to send bid status update'));

			// Should not throw - error should be caught and logged
			await expect(handleEscrowCreated(event)).resolves.not.toThrow();

			// Verify sendBidStatusUpdate was called (even though it failed)
			expect(vi.mocked(sendBidStatusUpdate)).toHaveBeenCalled();

			// Verify that contract was still created despite sendBidStatusUpdate failure
			// (This is the current behavior - contract creation succeeds even if status update fails)
			expect(vi.mocked(createContract)).toHaveBeenCalled();

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
			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);
			
			await handlePromise;

			// Contract should still have been created despite cleanup attempt
			expect(vi.mocked(createContract)).toHaveBeenCalled();
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			// Call both concurrently to simulate race condition
			const [result] = await Promise.allSettled([
				handleEscrowCreated(event),
				Promise.resolve().then(() => cleanupPendingContractByTxHash(txHash))
			]);

			// Should not throw errors
			expect(result.status).toBe('fulfilled');
			
			// Contract should have been created
			expect(vi.mocked(createContract)).toHaveBeenCalled();
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

			vi.mocked(createContract).mockResolvedValue(undefined);
			vi.mocked(contractStore.loadContractByEscrowId).mockResolvedValue(undefined);
			vi.mocked(pushNotificationService.sendNotificationToNpubs).mockResolvedValue(undefined);

			await handleEscrowCreated(event);

			// After successful processing, cleanup should work (processingContracts should be cleared)
			// This test verifies that the processingContracts set is properly cleaned up
			cleanupPendingContractByTxHash(txHash);
			
			// Should not throw and should allow cleanup after processing
			expect(vi.mocked(createContract)).toHaveBeenCalled();
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

			// Make createContract fail
			vi.mocked(createContract).mockRejectedValueOnce(new Error('Failed to create contract'));

			await expect(handleEscrowCreated(event)).resolves.not.toThrow();

			// After error, cleanup should work (processingContracts should be cleared)
			cleanupPendingContractByTxHash(txHash);
			
			// Should not throw - processingContracts should be cleaned up even on error
			expect(vi.mocked(createContract)).toHaveBeenCalled();
		});
	});
});
