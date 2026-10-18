import { describe, expect, it } from 'vitest';
import {
	contractBadgeClass,
	contractStatusKey,
	contractStatusTab,
	contractTaskId
} from '$lib/utils/contract/contract-tabs';

const TASK = 'f'.repeat(64);
const BID = 'a'.repeat(64);

describe('contract tabs', () => {
	it('reads the task id from a contract id', () => {
		expect(contractTaskId(`contract-${TASK}-${BID}`)).toBe(TASK);
		expect(contractTaskId('contract-lifecycle')).toBeNull();
	});

	it('names a settlement request as pending completion', () => {
		expect(contractStatusKey('settlement_requested')).toBe(
			'dashboard.contracts.status.pending_completion'
		);
	});

	it('files a released escrow under paid', () => {
		expect(contractStatusTab('released')).toBe('paid');
		expect(contractStatusTab('settled')).toBe('paid');
		expect(contractStatusKey('released')).toBe('dashboard.contracts.status.funds_released');
		expect(contractBadgeClass('released')).toBe('badge-success');
	});

	it('keeps funded and in-progress contracts out of paid', () => {
		expect(contractStatusTab('funded')).toBe('funded');
		expect(contractStatusTab('work_submitted')).toBe('in_progress');
		expect(contractStatusTab('approved')).toBe('in_progress');
		expect(contractStatusTab('cancelled')).toBe('ended');
		expect(contractStatusTab('disputed')).toBe('dispute');
	});
});
