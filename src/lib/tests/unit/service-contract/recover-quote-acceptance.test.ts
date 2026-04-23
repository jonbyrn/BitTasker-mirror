import { beforeEach, describe, expect, it, vi } from 'vitest';

const getContracts = vi.fn();
const publishContractEvent = vi.fn();
const loadContractByEscrowId = vi.fn();
const getTransactionReceipt = vi.fn();
const getEscrow = vi.fn();
const parseLog = vi.fn();
const ensureEscrowReady = vi.fn();

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: (...args: unknown[]) => getContracts(...args),
			publishContractEvent: (...args: unknown[]) => publishContractEvent(...args)
		}
	}
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: (...args: unknown[]) => loadContractByEscrowId(...args)
	}
}));

vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	ensureEscrowReady: (...args: unknown[]) => ensureEscrowReady(...args)
}));

describe('recoverServiceQuoteAcceptanceContract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getContracts.mockResolvedValue([]);
		publishContractEvent.mockResolvedValue(undefined);
		loadContractByEscrowId.mockResolvedValue(true);
		getTransactionReceipt.mockResolvedValue({
			status: 1,
			logs: [{ topics: ['0xabc'], data: '0xdef' }]
		});
		getEscrow.mockResolvedValue({
			amount: 1_400_000_000_000_000n,
			client: '0x3333333333333333333333333333333333333333'
		});
		parseLog.mockReturnValue({
			name: 'EscrowCreated',
			args: ['212']
		});
		ensureEscrowReady.mockResolvedValue({
			contract: {
				interface: {
					parseLog: (...args: unknown[]) => parseLog(...args)
				},
				getEscrow: (...args: unknown[]) => getEscrow(...args)
			},
			provider: {
				getTransactionReceipt: (...args: unknown[]) => getTransactionReceipt(...args)
			}
		});
	});

	it('publishes the missing quote contract event from on-chain escrow details when amountRbtc is absent', async () => {
		const { recoverServiceQuoteAcceptanceContract } = await import(
			'$lib/utils/service-contract/recover-quote-acceptance'
		);

		const result = await recoverServiceQuoteAcceptanceContract({
			transactionHash: '0x2f98eb008f38d5eca651215ab8c5b194165e59589298196fa784a8bb4398e5ad',
			freelancerPubkey: 'a'.repeat(64),
			estimatedStartTime: 1_700_010_000,
			estimatedCompletionTime: 1_700_269_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Need a logo refresh',
			serviceDescription: 'Please redesign our logo.',
			contextVersionRef: 'service-event-id',
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678',
			proposalEventId: 'proposal-event-id',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-id'
			}
		});

		expect(getEscrow).toHaveBeenCalledWith('212');
		expect(publishContractEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				escrowId: '212',
				amount: '0.0014',
				clientRskAddress: '0x3333333333333333333333333333333333333333',
				quoteRequestId: 'qr_12345678',
				proposalId: 'pr_12345678',
				purchaseMode: 'quote'
			})
		);
		expect(loadContractByEscrowId).toHaveBeenCalledWith('212');
		expect(result).toEqual({
			status: 'contract_ready',
			escrowId: '212',
			transactionHash: '0x2f98eb008f38d5eca651215ab8c5b194165e59589298196fa784a8bb4398e5ad'
		});
	});

	it('stays in contract_sync_pending when on-chain escrow details still cannot provide an amount', async () => {
		const { recoverServiceQuoteAcceptanceContract } = await import(
			'$lib/utils/service-contract/recover-quote-acceptance'
		);
		getEscrow.mockResolvedValueOnce({
			client: '0x3333333333333333333333333333333333333333'
		});

		const result = await recoverServiceQuoteAcceptanceContract({
			transactionHash: '0x2f98eb008f38d5eca651215ab8c5b194165e59589298196fa784a8bb4398e5ad',
			freelancerPubkey: 'a'.repeat(64),
			estimatedStartTime: 1_700_010_000,
			estimatedCompletionTime: 1_700_269_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Need a logo refresh',
			serviceDescription: 'Please redesign our logo.',
			contextVersionRef: 'service-event-id',
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678',
			proposalEventId: 'proposal-event-id',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-id'
			}
		});

		expect(publishContractEvent).not.toHaveBeenCalled();
		expect(result).toEqual({
			status: 'contract_sync_pending',
			escrowId: '212',
			transactionHash: '0x2f98eb008f38d5eca651215ab8c5b194165e59589298196fa784a8bb4398e5ad'
		});
	});
});
