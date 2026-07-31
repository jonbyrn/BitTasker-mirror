import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { monitorChangellySwap, isTerminalStatus, isSwapSuccessful } from '$lib/services/changelly-monitor';
import type { ChangellySwapStatus } from '$lib/services/changelly.service';

const mockGetSwapStatus = vi.fn();

vi.mock('$lib/utils/debug', () => ({
    createDebug: () => ({
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    })
}));

vi.mock('$lib/services/changelly.service', () => ({
    changellyService: {
        getSwapStatus: (...args: unknown[]) => mockGetSwapStatus(...args)
    }
}));

vi.mock('$lib/services/kill-switch', () => ({
    isChangeallySwapsEnabled: () => true
}));

const SWAP_BASE = { from: '', to: '', amountExpectedFrom: '', amountExpectedTo: '', payoutAddress: '', createdAt: '', updatedAt: '' };

describe('Changelly swap monitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns immediately when swap is already finished', async () => {
        mockGetSwapStatus.mockResolvedValue({
            id: 'test-1', status: 'finished', ...SWAP_BASE
        });

        const result = await monitorChangellySwap('test-1');
        expect(result.success).toBe(true);
        expect(result.status).toBe('finished');
        expect(mockGetSwapStatus).toHaveBeenCalledTimes(1);
    });

    it('polls until status changes to finished', async () => {
        mockGetSwapStatus
            .mockResolvedValueOnce({ id: 'test-2', status: 'waiting', ...SWAP_BASE })
            .mockResolvedValueOnce({ id: 'test-2', status: 'confirming', ...SWAP_BASE })
            .mockResolvedValueOnce({ id: 'test-2', status: 'finished', ...SWAP_BASE });

        const statusChanges: string[] = [];
        const promise = monitorChangellySwap('test-2', (status) => {
            statusChanges.push(status);
        });

        await vi.advanceTimersByTimeAsync(10_000);
        await vi.advanceTimersByTimeAsync(10_000);

        const result = await promise;
        expect(result.success).toBe(true);
        expect(statusChanges).toEqual(['waiting', 'confirming', 'finished']);
    });

    it('returns failure when swap is failed', async () => {
        mockGetSwapStatus.mockResolvedValue({
            id: 'test-3', status: 'failed', ...SWAP_BASE
        });

        const result = await monitorChangellySwap('test-3');
        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
    });

    it('returns failure when swap is refunded', async () => {
        mockGetSwapStatus.mockResolvedValue({
            id: 'test-4', status: 'refunded', ...SWAP_BASE
        });

        const result = await monitorChangellySwap('test-4');
        expect(result.success).toBe(false);
        expect(result.status).toBe('refunded');
    });

    it('can be cancelled via AbortSignal', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            monitorChangellySwap('test-5', undefined, controller.signal)
        ).rejects.toThrow('cancelled');
    });

    it('continues polling on transient errors', async () => {
        mockGetSwapStatus
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ id: 'test-6', status: 'finished', ...SWAP_BASE });

        const promise = monitorChangellySwap('test-6');

        await vi.advanceTimersByTimeAsync(10_000);

        const result = await promise;
        expect(result.success).toBe(true);
    });
});

describe('isTerminalStatus', () => {
    it('finished is terminal', () => expect(isTerminalStatus('finished')).toBe(true));
    it('failed is terminal', () => expect(isTerminalStatus('failed')).toBe(true));
    it('refunded is terminal', () => expect(isTerminalStatus('refunded')).toBe(true));
    it('waiting is not terminal', () => expect(isTerminalStatus('waiting')).toBe(false));
    it('confirming is not terminal', () => expect(isTerminalStatus('confirming')).toBe(false));
    it('exchanging is not terminal', () => expect(isTerminalStatus('exchanging')).toBe(false));
    it('sending is not terminal', () => expect(isTerminalStatus('sending')).toBe(false));
});

describe('isSwapSuccessful', () => {
    it('finished is successful', () => expect(isSwapSuccessful('finished')).toBe(true));
    it('failed is not successful', () => expect(isSwapSuccessful('failed')).toBe(false));
    it('refunded is not successful', () => expect(isSwapSuccessful('refunded')).toBe(false));
    it('waiting is not successful', () => expect(isSwapSuccessful('waiting')).toBe(false));
});
