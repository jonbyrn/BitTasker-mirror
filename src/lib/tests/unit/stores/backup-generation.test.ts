import { describe, expect, it } from 'vitest';
import {
	decideBackupRestore,
	decideBackupWrite,
	operationGeneration
} from '$lib/stores/wallet/backup-generation';

describe('backup generation', () => {
	it('reads the wallet operation timestamp and ignores a wall clock', () => {
		expect(operationGeneration({ last_operation_timestamp: 40 })).toBe(40);
		expect(operationGeneration('{"lastOperationTimestamp":12}')).toBe(12);
		expect(operationGeneration(40)).toBe(40);
		expect(operationGeneration({ last_operation_timestamp: 0 })).toBeNull();
		expect(operationGeneration('not-json')).toBeNull();
		expect(operationGeneration(null)).toBeNull();
	});

	it('refuses a stale snapshot and an unknown generation', () => {
		expect(decideBackupWrite(null, 10)).toBe('write');
		expect(decideBackupWrite(10, 10)).toBe('write');
		expect(decideBackupWrite(10, 11)).toBe('write');
		expect(decideBackupWrite(20, 11)).toBe('keep');
		expect(decideBackupWrite(20, null)).toBe('keep');
		expect(decideBackupWrite(null, null)).toBe('write');
	});

	it('restores only a newer backup over a stored snapshot', () => {
		expect(decideBackupRestore(10, 40, true)).toBe('restore');
		expect(decideBackupRestore(null, 40, true)).toBe('restore');
		expect(decideBackupRestore(40, 10, false)).toBe('skip');
		expect(decideBackupRestore(40, 10, true)).toBe('skip');
		expect(decideBackupRestore(10, 10, true)).toBe('skip');
		expect(decideBackupRestore(null, null, true)).toBe('skip');
		expect(decideBackupRestore(null, null, false)).toBe('restore');
		expect(decideBackupRestore(10, 10, false)).toBe('restore');
	});
});
