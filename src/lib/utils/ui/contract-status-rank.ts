const RANK: Record<string, number> = {
	draft: 0,
	failed: 1,
	funding: 2,
	locking: 3,
	locked: 4,
	funded: 4,
	work_in_progress: 5,
	work_submitted: 6,
	approved: 7,
	settlement_requested: 8,
	releasing: 9,
	released_pending: 10,
	released: 11,
	settled: 11,
	refunded: 12,
	disputed: 12,
	cancelled: 13
};

const TERMINAL = new Set(['cancelled', 'disputed', 'refunded', 'failed']);

export function contractStatusRank(status: string): number {
	return RANK[status] ?? 0;
}

/**
 * After a local action, a slower relay read must not move the contract backwards.
 * A cancel, dispute, refund, or failure from the relay still wins.
 */
export function shouldKeepLocalStatus(hold: string | null, fetched: string): boolean {
	if (!hold) return false;
	if (TERMINAL.has(fetched)) return false;
	return contractStatusRank(fetched) < contractStatusRank(hold);
}
