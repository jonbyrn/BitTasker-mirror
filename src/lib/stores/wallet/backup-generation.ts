/** rgb-lib `DbBackupInfo.last_operation_timestamp`. A wall clock is not a generation. */
export function operationGeneration(payload: unknown): number | null {
	if (typeof payload === 'number' && Number.isFinite(payload) && payload > 0) return payload;
	let record: unknown = payload;
	if (typeof payload === 'string') {
		try {
			record = JSON.parse(payload);
		} catch {
			return null;
		}
	}
	if (!record || typeof record !== 'object') return null;
	const body = record as { last_operation_timestamp?: unknown; lastOperationTimestamp?: unknown };
	const value = body.last_operation_timestamp ?? body.lastOperationTimestamp;
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
	return null;
}

/**
 * A later save from a tab whose wallet operation is older must not replace
 * the backup. An unknown generation must not replace a numbered one.
 */
export function decideBackupWrite(stored: number | null, next: number | null): 'write' | 'keep' {
	if (stored == null) return 'write';
	if (next == null) return 'keep';
	return next >= stored ? 'write' : 'keep';
}

/**
 * Restore when the backup is newer than the loaded wallet, even if a snapshot
 * is already stored. A newer wallet is left alone. Equal generations keep a
 * snapshot that is already there.
 */
export function decideBackupRestore(
	walletGeneration: number | null,
	backupGeneration: number | null,
	snapshotKept: boolean
): 'restore' | 'skip' {
	if (walletGeneration != null && backupGeneration != null && walletGeneration > backupGeneration) {
		return 'skip';
	}
	if (
		backupGeneration != null &&
		(walletGeneration == null || backupGeneration > walletGeneration)
	) {
		return 'restore';
	}
	if (snapshotKept) return 'skip';
	return 'restore';
}
