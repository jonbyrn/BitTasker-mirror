import { changellyService, type ChangellySwap, type ChangellySwapStatus } from './changelly.service';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('changelly-monitor');

const POLL_INTERVAL_MS = 10_000;

const MAX_POLL_ATTEMPTS = 60;

const TERMINAL_STATUSES: ReadonlySet<ChangellySwapStatus> = new Set([
	'finished',
	'failed',
	'refunded'
]);

export interface ChangellyMonitorResult {
	swapId: string;
	status: ChangellySwapStatus;
	swap: ChangellySwap;
	success: boolean;
}

export async function monitorChangellySwap(
	swapId: string,
	onStatusChange?: (status: ChangellySwapStatus, swap: ChangellySwap) => void,
	signal?: AbortSignal
): Promise<ChangellyMonitorResult> {
	let lastStatus: ChangellySwapStatus | null = null;

	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		if (signal?.aborted) {
			throw new Error('Monitoring cancelled');
		}

		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			if (signal?.aborted) {
				throw new Error('Monitoring cancelled');
			}
		}

		try {
			const swap = await changellyService.getSwapStatus(swapId);

			if (swap.status !== lastStatus) {
				lastStatus = swap.status;
				d.log('Swap %s status: %s', swapId, swap.status);
				onStatusChange?.(swap.status, swap);
			}

			if (TERMINAL_STATUSES.has(swap.status)) {
				return {
					swapId,
					status: swap.status,
					swap,
					success: swap.status === 'finished'
				};
			}
		} catch (err) {
			d.warn('Poll attempt %d failed for swap %s: %s', attempt + 1, swapId, (err as Error).message);
		}
	}

	d.warn('Max poll attempts reached for swap %s', swapId);
	return {
		swapId,
		status: lastStatus ?? 'waiting',
		swap: {
			id: swapId,
			status: lastStatus ?? 'waiting',
			from: '',
			to: '',
			amountExpectedFrom: '',
			amountExpectedTo: '',
			payoutAddress: '',
			createdAt: '',
			updatedAt: ''
		},
		success: false
	};
}

export function isTerminalStatus(status: ChangellySwapStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

export function isSwapSuccessful(status: ChangellySwapStatus): boolean {
	return status === 'finished';
}
