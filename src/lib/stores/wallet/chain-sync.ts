/**
 * beta.12 puts `startNodeChainSync` on `RlnWasmBinding`, not on `UTEXOWallet`.
 * `attachLightningNode` → `ensureNodeAttached` already calls `chainSyncStartValue`
 * the first time the node is attached (also from unlock → goOnline).
 * A second start drops that closure: "closure invoked recursively or after being dropped".
 */

export type ChainSyncPlan = 'running' | 'start' | 'skip';

export function chainSyncRunning(status: unknown): boolean {
	if (typeof status !== 'object' || status === null) return false;
	const row = status as {
		running?: unknown;
		active?: unknown;
		started?: unknown;
		status?: unknown;
	};
	if (row.running === true || row.active === true || row.started === true) return true;
	return typeof row.status === 'string' && /run|active|start/i.test(row.status);
}

export function chainSyncStopped(status: unknown): boolean {
	if (typeof status !== 'object' || status === null) return false;
	const row = status as { running?: unknown; active?: unknown; status?: unknown };
	if (row.running === false || row.active === false) return true;
	return typeof row.status === 'string' && /idle|stop|false/i.test(row.status);
}

/** Start a loop only when status says it is stopped and a start function exists. */
export function chainSyncPlan(status: unknown, hasStart: boolean): ChainSyncPlan {
	if (chainSyncRunning(status)) return 'running';
	if (hasStart && chainSyncStopped(status)) return 'start';
	return 'skip';
}
