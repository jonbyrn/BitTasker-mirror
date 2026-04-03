import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractWithEvents } from '$lib/types/contract';

const mocks = vi.hoisted(() => ({
	mockRefundClient: vi.fn(),
	mockCancelEscrow: vi.fn()
}));

vi.mock('$lib/nostr/task', () => ({
	updateTask: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1/escrowBid', () => ({
	formatRBTCAmount: vi.fn(),
	getFeePercentageDisplay: vi.fn(),
	validateEscrowDetails: vi.fn(),
	validateSufficientBalance: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1', () => ({
	escrow: {
		refundClient: mocks.mockRefundClient,
		cancelEscrow: mocks.mockCancelEscrow
	},
	escrowBid: {},
	nostrContract: {},
	escrowEvents: {},
	EscrowStatus: {}
}));

import { escrow } from '$lib/utils/escrow';

describe('EscrowManager wrapper delegation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockRefundClient.mockResolvedValue({
			hash: '0xrefund',
			escrowId: 'escrow-1',
			status: 'pending'
		});
		mocks.mockCancelEscrow.mockResolvedValue({
			hash: '0xcancel',
			escrowId: 'escrow-1',
			status: 'pending'
		});
	});

	const contract = {
		contractEvent: {
			id: 'contract-event-1',
			tags: []
		},
		escrowData: {
			id: 'escrow-1'
		}
	} as unknown as ContractWithEvents;

	it('delegates taskee refunds to handler.escrow.refundClient with contract identifiers', async () => {
		await escrow.escrowOps.refundClient(contract);

		expect(mocks.mockRefundClient).toHaveBeenCalledWith('escrow-1', 'contract-event-1');
		expect(mocks.mockCancelEscrow).not.toHaveBeenCalled();
	});

	it('delegates client cancellations to handler.escrow.cancelEscrow with contract identifiers', async () => {
		await escrow.escrowOps.cancelEscrow(contract);

		expect(mocks.mockCancelEscrow).toHaveBeenCalledWith('escrow-1', 'contract-event-1');
		expect(mocks.mockRefundClient).not.toHaveBeenCalled();
	});

	it('rejects refund requests when escrow identifiers are missing', async () => {
		await expect(
			escrow.escrowOps.refundClient({
				...contract,
				escrowData: { id: '' }
			} as unknown as ContractWithEvents)
		).rejects.toThrow('Missing escrow id for refundClient');

		await expect(
			escrow.escrowOps.refundClient({
				...contract,
				contractEvent: { id: '', tags: [] }
			} as unknown as ContractWithEvents)
		).rejects.toThrow('Missing contract event id for refundClient');
	});
});
