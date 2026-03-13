import { beforeEach, describe, expect, it, vi } from 'vitest';

import KINDS from '$lib/utils/constants/kinds';
import { EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';
import { publishContractEvent } from '$lib/utils/escrow/v2/nostrContract';

const { publishNostrEvent, queryNostrEvents, getNpub } = vi.hoisted(() => ({
	publishNostrEvent: vi.fn(),
	queryNostrEvents: vi.fn(),
	getNpub: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub,
	getNostrKeyPair: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent,
	queryNostrEvents,
	getSignedEvent: vi.fn()
}));

vi.mock('$lib/utils/escrow/v2/escrow', () => ({
	escrow: {
		loadEscrowDetails: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/contractPermissions', () => ({
	determineContractState: vi.fn()
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		update: vi.fn()
	}
}));

vi.mock('$lib/utils/escrow/v2/escrowEvents', () => ({
	publishEscrowStatus: vi.fn()
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		deleteEvent: vi.fn()
	}
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getProvider: vi.fn()
}));

describe('v2 nostrContract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getNpub.mockResolvedValue('client-pubkey-hex');
		queryNostrEvents.mockResolvedValue([]);
	});

	it('publishes the root contract event with canonical payment identity and v2 fields', async () => {
		await publishContractEvent({
			escrowId: '42',
			taskId: 'task-123',
			taskTitle: 'Test task',
			taskDescription: 'Test description',
			freelancerPubkey: 'freelancer-pubkey-hex',
			amount: '0.5',
			estimatedStartTime: 1000,
			estimatedCompletionTime: 2000,
			transactionHash: '0xtxhash',
			cancellationFee: '0.01',
			upfrontDeposit: '0.02'
		});

		expect(publishNostrEvent).toHaveBeenCalledTimes(1);

		const [kind, content, recipientPubkey, tags] = publishNostrEvent.mock.calls[0];
		const parsedContent = JSON.parse(content as string);

		expect(kind).toBe(KINDS.CONTRACT);
		expect(recipientPubkey).toBe('freelancer-pubkey-hex');
		expect(parsedContent).toMatchObject({
			paymentId: '42',
			escrowId: '42',
			taskId: 'task-123',
			status: EscrowStatus.Funded,
			cancellationFee: '0.01',
			upfrontDeposit: '0.02',
			type: 'contract'
		});
		expect(tags).toEqual(
			expect.arrayContaining([
				['d', '42'],
				['t', 'task-123'],
				['v', 'v2']
			])
		);
	});
});
