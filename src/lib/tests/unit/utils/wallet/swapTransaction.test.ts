import { describe, it, expect, vi } from 'vitest';
import type { BoltzSwapData } from '@bittasker/wallet-core';
import {
	PENDING_STATUSES,
	COMPLETED_STATUSES,
	FAILED_STATUSES,
	FINAL_STATUSES,
	isExpiredSwapSafeToDelete,
	shouldShowSwap,
	isSwapCompleted,
	getSwapType,
	mapSwapToTransaction,
	getSwapActions
} from '$lib/utils/wallet/swapTransaction';

vi.mock('$lib/stores/wallet.store', () => ({ walletManager: {} }));

describe('swapTransaction', () => {
	describe('constants', () => {
		it('should include expected pending statuses', () => {
			expect(PENDING_STATUSES).toContain('swap.created');
			expect(PENDING_STATUSES).toContain('transaction.confirmed');
			expect(PENDING_STATUSES).toContain('invoice.pending');
		});

		it('should include expected completed statuses', () => {
			expect(COMPLETED_STATUSES).toContain('transaction.claimed');
			expect(COMPLETED_STATUSES).toContain('invoice.settled');
			expect(COMPLETED_STATUSES).toContain('invoice.paid');
		});

		it('should include expected failed statuses', () => {
			expect(FAILED_STATUSES).toContain('swap.expired');
			expect(FAILED_STATUSES).toContain('transaction.failed');
			expect(FAILED_STATUSES).toContain('transaction.refunded');
			expect(FAILED_STATUSES).toContain('transaction.claim.failed');
		});

		it('should have final statuses include completed and key failed', () => {
			expect(FINAL_STATUSES).toContain('transaction.claimed');
			expect(FINAL_STATUSES).toContain('swap.expired');
			expect(FINAL_STATUSES).not.toContain('transaction.lockupFailed');
		});
	});

	describe('getSwapType', () => {
		it('should return submarine when swap has invoice and lockupAddress', () => {
			const swap = {
				invoice: 'ln...',
				lockupAddress: '0x...',
				status: 'swap.created',
				id: '1'
			} as unknown as BoltzSwapData;
			expect(getSwapType(swap)).toBe('submarine');
		});

		it('should return reverse when swap has invoice but no lockupAddress', () => {
			const swap = {
				invoice: 'ln...',
				amount: 1000,
				status: 'swap.created',
				id: '1'
			} as unknown as BoltzSwapData;
			expect(getSwapType(swap)).toBe('reverse');
		});

		it('should return chain when swap has neither invoice+lockupAddress nor invoice-only', () => {
			const swap = { toAmount: 5000, status: 'swap.created', id: '1' } as unknown as BoltzSwapData;
			expect(getSwapType(swap)).toBe('chain');
		});
	});

	describe('isSwapCompleted', () => {
		it('should return true for completed statuses', () => {
			expect(isSwapCompleted('transaction.claimed')).toBe(true);
			expect(isSwapCompleted('invoice.settled')).toBe(true);
			expect(isSwapCompleted('invoice.paid')).toBe(true);
		});

		it('should return false for pending and failed statuses', () => {
			expect(isSwapCompleted('swap.created')).toBe(false);
			expect(isSwapCompleted('transaction.mempool')).toBe(false);
			expect(isSwapCompleted('swap.expired')).toBe(false);
			expect(isSwapCompleted('transaction.failed')).toBe(false);
		});
	});

	describe('isExpiredSwapSafeToDelete', () => {
		it('should return false when status is not swap.expired', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{ status: 'swap.created', id: '1' } as unknown as BoltzSwapData,
					'reverse'
				)
			).toBe(false);
		});

		it('should return true for reverse swap when expired', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{ status: 'swap.expired', id: '1' } as unknown as BoltzSwapData,
					'reverse'
				)
			).toBe(true);
		});

		it('should return true for submarine when expired and no lockupTxHash', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{ status: 'swap.expired', id: '1', lockupTxHash: undefined } as unknown as BoltzSwapData,
					'submarine'
				)
			).toBe(true);
		});

		it('should return false for submarine when expired but user locked funds', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{ status: 'swap.expired', id: '1', lockupTxHash: '0xabc' } as unknown as BoltzSwapData,
					'submarine'
				)
			).toBe(false);
		});

		it('should return true for chain when expired and neither side locked', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{
						status: 'swap.expired',
						id: '1',
						lockupTxHash: undefined,
						serverLockupTxHash: undefined
					} as unknown as BoltzSwapData,
					'chain'
				)
			).toBe(true);
		});

		it('should return false for chain when expired and user locked', () => {
			expect(
				isExpiredSwapSafeToDelete(
					{
						status: 'swap.expired',
						id: '1',
						lockupTxHash: '0xuser',
						serverLockupTxHash: undefined
					} as unknown as BoltzSwapData,
					'chain'
				)
			).toBe(false);
		});
	});

	describe('shouldShowSwap', () => {
		it('should return false for completed statuses', () => {
			expect(
				shouldShowSwap('transaction.claimed', 'reverse', {
					status: 'transaction.claimed',
					id: '1'
				} as unknown as BoltzSwapData)
			).toBe(false);
			expect(
				shouldShowSwap('invoice.settled', 'submarine', {
					status: 'invoice.settled',
					id: '1'
				} as unknown as BoltzSwapData)
			).toBe(false);
		});

		it('should return false for expired swap safe to delete', () => {
			expect(
				shouldShowSwap('swap.expired', 'reverse', {
					status: 'swap.expired',
					id: '1'
				} as unknown as BoltzSwapData)
			).toBe(false);
		});

		it('should return true for pending status', () => {
			expect(
				shouldShowSwap('transaction.mempool', 'submarine', {
					status: 'transaction.mempool',
					id: '1'
				} as unknown as BoltzSwapData)
			).toBe(true);
		});

		it('should return true for expired submarine when user locked (not safe to delete)', () => {
			expect(
				shouldShowSwap('swap.expired', 'submarine', {
					status: 'swap.expired',
					id: '1',
					lockupTxHash: '0xabc'
				} as unknown as BoltzSwapData)
			).toBe(true);
		});

		it('should hide failed submarine swap that never locked funds', () => {
			expect(
				shouldShowSwap('invoice.failedToPay', 'submarine', {
					status: 'invoice.failedToPay',
					id: '1',
					invoice: 'ln...',
					lockupAddress: '0x...'
				} as unknown as BoltzSwapData)
			).toBe(false);
		});
	});

	describe('mapSwapToTransaction', () => {
		it('should map submarine swap to ProcessedTransaction with displayType send', () => {
			const swap = {
				id: 'sub1',
				status: 'invoice.settled',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				lockupAddress: '0x...',
				invoiceAmount: 50000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'submarine', 100_000);
			expect(result.type).toBe('send');
			expect(result.displayType).toBe('send');
			expect(result.network).toBe('lightning');
			expect(result.value).toBe('50000');
			expect(result.title).toBe('wallet.sent');
			expect(result.hash).toBeDefined();
			expect(result.balanceAfter).toBe(100_000);
		});

		it('should map reverse swap to ProcessedTransaction with displayType receive', () => {
			const swap = {
				id: 'rev1',
				status: 'invoice.settled',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				amount: 30000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'reverse', 50_000);
			expect(result.type).toBe('receive');
			expect(result.displayType).toBe('receive');
			expect(result.network).toBe('lightning');
			expect(result.value).toBe('30000');
			expect(result.title).toBe('wallet.received');
		});

		it('should map chain swap with displayType receive', () => {
			const swap = {
				id: 'chain1',
				status: 'transaction.claim.pending',
				createdAt: '2024-01-15T10:00:00Z',
				toAmount: 25000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'chain', 75_000);
			expect(result.type).toBe('receive');
			expect(result.displayType).toBe('receive');
			expect(result.network).toBe('rsk');
			expect(result.value).toBe('25000');
		});

		it('should set pending status label for pending swap', () => {
			const swap = {
				id: 'p1',
				status: 'swap.created',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				lockupAddress: '0x...',
				invoiceAmount: 10000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'submarine', 0);
			expect(result.status.label).toBe('wallet.transaction.status.pending');
			expect(result.borderColor).toBe('neutral');
			expect(result.title).toBe('wallet.swap.pending_send');
		});

		it('should map transaction.claim.failed to failed without unknown status warn', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const swap = {
				id: 'rev-fail',
				status: 'transaction.claim.failed',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				amount: 3332
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'reverse', 0);
			expect(result.status.label).toBe('wallet.transaction.status.failed');
			expect(result.title).toBe('wallet.swap.failed_receive');
			expect(warnSpy).not.toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it('should set failed status and borderColor error for failed swap', () => {
			const swap = {
				id: 'f1',
				status: 'swap.expired',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				lockupAddress: '0x...',
				invoiceAmount: 10000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'submarine', 0);
			expect(result.status.label).toBe('wallet.transaction.status.failed');
			expect(result.borderColor).toBe('error');
			expect(result.title).toBe('wallet.swap.failed_send');
		});

		it('should include swap id and rawStatus in result.swap', () => {
			const swap = {
				id: 'my-swap-id',
				status: 'transaction.mempool',
				createdAt: '2024-01-15T10:00:00Z',
				invoice: 'ln...',
				amount: 1000
			} as unknown as BoltzSwapData;
			const result = mapSwapToTransaction(swap, 'reverse', 0);
			expect(result.swap).toBeDefined();
			expect(result.swap?.id).toBe('my-swap-id');
			expect(result.swap?.rawStatus).toBe('transaction.mempool');
			expect(result.swap?.type).toBe('reverse');
		});
	});

	describe('getSwapActions', () => {
		it('should include viewQR action for non-final status', () => {
			const swap = {
				id: 'a1',
				status: 'swap.created',
				createdAt: '2024-01-15T10:00:00Z'
			} as unknown as BoltzSwapData;
			const actions = getSwapActions(swap);
			expect(actions.length).toBeGreaterThanOrEqual(1);
			expect(actions.some((a) => a.type === 'viewQR')).toBe(true);
			expect(actions.find((a) => a.type === 'viewQR')?.label).toBe('wallet.swap.action.view_qr');
		});

		it('should not include viewQR for final status', () => {
			const swap = {
				id: 'a2',
				status: 'transaction.claimed',
				createdAt: '2024-01-15T10:00:00Z'
			} as unknown as BoltzSwapData;
			const actions = getSwapActions(swap);
			expect(actions.some((a) => a.type === 'viewQR')).toBe(false);
		});
	});
});
