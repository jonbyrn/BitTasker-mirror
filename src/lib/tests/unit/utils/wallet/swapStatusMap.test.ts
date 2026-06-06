import { describe, it, expect } from 'vitest';
import {
	FAILED_STATUSES,
	FINAL_STATUSES,
	isSwapFailed,
	mapBoltzModalStatus,
	mapBoltzModalStatus as mapModal
} from '$lib/utils/wallet/swapStatusMap';

describe('swapStatusMap', () => {
	it('should treat transaction.claim.failed as failed and final', () => {
		expect(FAILED_STATUSES).toContain('transaction.claim.failed');
		expect(FINAL_STATUSES).toContain('transaction.claim.failed');
		expect(isSwapFailed('transaction.claim.failed')).toBe(true);
	});

	it('should map transaction.claim.failed to modal error for reverse', () => {
		expect(mapBoltzModalStatus('transaction.claim.failed', 'reverse')).toBe('error');
	});

	it('should map invoice.paid to success for submarine', () => {
		expect(mapModal('invoice.paid', 'submarine')).toBe('success');
	});

	it('should map swap.created to sending for submarine', () => {
		expect(mapModal('swap.created', 'submarine')).toBe('sending');
	});
});
