/**
 * rgb-lib `DbBackupInfo.last_operation_timestamp`.
 * The wasm wallet stores an RFC3339 string and bumps it on blind receive.
 * A number is the same instant in milliseconds, used by tests.
 */
export function operationGeneration(payload: unknown): number | null {
	if (typeof payload === 'number' && Number.isFinite(payload) && payload > 0) {
		return Math.trunc(payload);
	}
	if (typeof payload === 'string') {
		const text = payload.trim();
		if (!text) return null;
		if (text.startsWith('{') || text.startsWith('[')) {
			try {
				return operationGeneration(JSON.parse(text) as unknown);
			} catch {
				return null;
			}
		}
		if (/^\d+$/.test(text)) {
			const value = Number(text);
			return value > 0 ? value : null;
		}
		return epochFromStamp(text);
	}
	if (!payload || typeof payload !== 'object') return null;
	const body = payload as { last_operation_timestamp?: unknown; lastOperationTimestamp?: unknown };
	const value = body.last_operation_timestamp ?? body.lastOperationTimestamp;
	if (value == null) return null;
	return operationGeneration(value);
}

/** The timestamp text rgb-lib wrote, or the numeric generation when that is all we have. */
export function operationStamp(payload: unknown): string | null {
	if (operationGeneration(payload) == null) return null;
	return stampText(payload);
}

function stampText(payload: unknown): string | null {
	if (typeof payload === 'number' && Number.isFinite(payload) && payload > 0) {
		return String(Math.trunc(payload));
	}
	if (typeof payload === 'string') {
		const text = payload.trim();
		if (!text) return null;
		if (text.startsWith('{') || text.startsWith('[')) {
			try {
				return stampText(JSON.parse(text) as unknown);
			} catch {
				return null;
			}
		}
		return text;
	}
	if (!payload || typeof payload !== 'object') return null;
	const body = payload as { last_operation_timestamp?: unknown; lastOperationTimestamp?: unknown };
	const value = body.last_operation_timestamp ?? body.lastOperationTimestamp;
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number' && Number.isFinite(value) && value > 0)
		return String(Math.trunc(value));
	return null;
}

/** rgb-lib formats fractional seconds to nanoseconds. `Date.parse` keeps milliseconds. */
function epochFromStamp(stamp: string): number | null {
	const normalized = stamp.replace(/(\.\d{3})\d+/, '$1');
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
