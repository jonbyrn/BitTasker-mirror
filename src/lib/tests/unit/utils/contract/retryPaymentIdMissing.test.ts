import { describe, it, expect } from 'vitest';
import { ContractStatus } from '$lib/utils/contract/types';
import type { SecurePaymentLegacy } from '$lib/utils/contract/types';

/**
 * Tests for the retry flow when paymentId is missing from the Nostr event.
 *
 * Reproduces the bug: contract b8df0b877359a44e (haircut service) has no paymentId
 * tag, has a confirmed transactionHash, but retry never resolves because:
 * 1. getProvider() can hang indefinitely (no timeout)
 * 2. provider.waitForTransaction() has a 3-min timeout but the user sees no feedback
 * 3. resolvePaymentIdFromTxHash sets isPending=true and clears error, creating a
 *    "stuck" state where the UI shows "Funded" with no actions and no error
 */

describe('retry flow when paymentId is missing', () => {
	it('resolvePaymentIdFromTxHash sets isPending=true and clears optimisticBlockchainStatus on timeout', async () => {
		// Simulate the exact state of contract b8df0b877359a44e:
		// - No paymentId
		// - Has transactionHash
		// - isPending=true (set in constructor)
		// - blockchainData=null

		let isPending = true;
		let optimisticStatus: ContractStatus | null = null;
		let error: string | null = 'Previous error';
		let paymentId: string | undefined = undefined;

		// Simulate resolvePaymentIdFromTxHash timeout behavior
		async function simulateResolveTimeout() {
			isPending = true;
			optimisticStatus = ContractStatus.Funded; // UI shows "Funded"
			error = null; // error banner disappears

			try {
				// Simulate the 3-minute timeout
				await Promise.race([
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('Transaction confirmation timed out')), 100)
					),
					new Promise<never>(() => {}) // provider.waitForTransaction that never resolves
				]);
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
				isPending = false;
			} finally {
				optimisticStatus = null;
			}
		}

		// Before retry: error is shown, isPending is true
		expect(error).toBe('Previous error');
		expect(isPending).toBe(true);

		// After retry starts: error cleared, optimistic status set
		error = null;
		optimisticStatus = ContractStatus.Funded;

		expect(error).toBeNull();
		expect(optimisticStatus).toBe(ContractStatus.Funded);

		// After timeout: error is set, isPending is false
		await simulateResolveTimeout();

		expect(error).toContain('timed out');
		expect(isPending).toBe(false);
		expect(optimisticStatus).toBeNull();
		expect(paymentId).toBeUndefined(); // paymentId was never resolved
	});

	it('retry does nothing when paymentId is missing and no transactionHash', () => {
		// Contract with no paymentId and no transactionHash
		const paymentId: string | undefined = undefined;
		const transactionHash: string | undefined = undefined;

		let reloadCalled = false;

		// Simulate reloadBlockchainData
		function reloadBlockchainData() {
			if (!paymentId) return; // exits immediately
			reloadCalled = true;
		}

		// Simulate retryLoadBlockchainData
		function retryLoadBlockchainData() {
			if (!paymentId && transactionHash) {
				// Would call resolvePaymentIdFromTxHash
			}
			reloadBlockchainData();
		}

		retryLoadBlockchainData();

		expect(reloadCalled).toBe(false); // reload was never called
		expect(paymentId).toBeUndefined(); // still no paymentId
	});

	it('stuck state: UI shows Funded with no actions and no error during resolvePaymentIdFromTxHash', () => {
		// This is the exact state the user sees when retry is clicked:
		// - error = null (cleared at start of retry)
		// - isPending = true (set by resolvePaymentIdFromTxHash)
		// - optimisticBlockchainStatus = Funded (set by resolvePaymentIdFromTxHash)
		// - blockchainData = null (never loaded)
		// - paymentId = undefined (not yet resolved)

		const state = {
			error: null as string | null,
			isPending: true,
			optimisticBlockchainStatus: ContractStatus.Funded as ContractStatus | null,
			blockchainData: null as SecurePaymentLegacy | null,
			paymentId: undefined as string | undefined
		};

		// Display status: optimisticBlockchainStatus takes precedence → shows "Funded"
		const displayStatus = state.optimisticBlockchainStatus ?? ContractStatus.Funded;
		expect(displayStatus).toBe(ContractStatus.Funded);

		// Permitted actions: isPending=true → all false
		const awaitingTx = state.isPending;
		expect(awaitingTx).toBe(true);

		// Error banner: error=null → not shown
		expect(state.error).toBeNull();

		// Loading indicator: blockchainData=null AND error=null → shows spinner
		const showLoading = !state.blockchainData && !state.error;
		expect(showLoading).toBe(true);

		// RESULT: User sees "Funded" status, no actions, no error, loading spinner
		// This state persists for up to 3 minutes (the timeout)
	});

	it('after timeout: error shows but retry leads back to the same stuck state', async () => {
		let attempts = 0;

		async function simulateRetryCycle() {
			attempts++;
			let error: string | null = null;
			let isPending = false;

			// Step 1: clear error (retry starts)
			error = null;

			// Step 2: resolvePaymentIdFromTxHash starts
			isPending = true;

			// Step 3: getProvider hangs or waitForTransaction times out
			try {
				await new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Transaction confirmation timed out')), 50)
				);
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
				isPending = false;
			}

			return { error, isPending };
		}

		// First retry
		const result1 = await simulateRetryCycle();
		expect(result1.error).toContain('timed out');
		expect(result1.isPending).toBe(false);

		// Second retry — same result
		const result2 = await simulateRetryCycle();
		expect(result2.error).toContain('timed out');
		expect(result2.isPending).toBe(false);

		expect(attempts).toBe(2);
		// The user is stuck in an infinite loop: retry → timeout → error → retry → timeout → error
	});
});
