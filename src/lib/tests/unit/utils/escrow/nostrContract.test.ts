import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';

const publishNostrEvent = vi.fn();
const getNpub = vi.fn();

vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((value: string) => value?.toLowerCase() ?? '')
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: (...args: unknown[]) => publishNostrEvent(...args),
	queryNostrEvents: vi.fn(),
	getSignedEvent: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => getNpub(...args),
	getNostrKeyPair: vi.fn()
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	publishEscrowStatus: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		loadEscrowDetails: vi.fn()
	},
	EscrowStatus: {
		Funded: 'FUNDED'
	}
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {}
}));

describe('publishContractEvent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getNpub.mockResolvedValue('b'.repeat(64));
		publishNostrEvent.mockResolvedValue(undefined);
	});

	it('publishes the buyer RSK address in lowercase on instant-buy contract events', async () => {
		const { publishContractEvent } = await import('$lib/utils/escrow/v1/nostrContract');

		await publishContractEvent({
			escrowId: 'escrow-123',
			freelancerPubkey: 'a'.repeat(64),
			clientRskAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
			amount: '0.00125000',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_003_600,
			serviceId: 'service-123',
			serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
			serviceTitle: 'Brand Identity Sprint',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'instant_buy',
			instantOrderId: 'sib_1234567890abcdef'
		});

		expect(publishNostrEvent).toHaveBeenCalledTimes(1);
		expect(publishNostrEvent).toHaveBeenCalledWith(
			KINDS.CONTRACT,
			expect.any(String),
			'a'.repeat(64),
			expect.any(Array)
		);

		const serializedContract = publishNostrEvent.mock.calls[0]?.[1];
		expect(JSON.parse(serializedContract)).toEqual(
			expect.objectContaining({
				escrowId: 'escrow-123',
				purchaseMode: 'instant_buy',
				clientRskAddress: '0xabcdef1234567890abcdef1234567890abcdef12'
			})
		);
	});
});
