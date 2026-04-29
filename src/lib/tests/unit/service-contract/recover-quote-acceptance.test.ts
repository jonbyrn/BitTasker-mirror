import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInitContract = vi.fn();
const mockParsePaymentId = vi.fn();
const mockPublishServiceContractEvent = vi.fn();
const loadContractByEscrowId = vi.fn();

vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: () => '0xcccccccccccccccccccccccccccccccccccccccc'
}));

vi.mock('$lib/utils/contract/v2/creation', () => ({
	parsePaymentContractCreatedPaymentId: (...args: unknown[]) => mockParsePaymentId(...args)
}));

vi.mock('$lib/utils/contract/v2/service-creation', () => ({
	publishServiceContractEvent: (...args: unknown[]) => mockPublishServiceContractEvent(...args)
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: (...args: unknown[]) => loadContractByEscrowId(...args)
	}
}));

vi.mock('$lib/utils/contract', () => ({
	initContract: (...args: unknown[]) => mockInitContract(...args)
}));

describe('recoverServiceQuoteAcceptanceContract', () => {
	let getTransactionReceipt: ReturnType<typeof vi.fn>;
	let getPayment: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		getTransactionReceipt = vi.fn();
		getPayment = vi.fn();
		mockPublishServiceContractEvent.mockResolvedValue({ success: true });
		mockInitContract.mockResolvedValue({
			contract: { getPayment },
			provider: { getTransactionReceipt },
			wallet: { address: '0x1111111111111111111111111111111111111111' }
		});
		getTransactionReceipt.mockResolvedValue({
			status: 1,
			logs: [{ topics: ['0xabc'], data: '0xdef' }]
		});
		mockParsePaymentId.mockReturnValue(212n);
	});

	it('publishes the missing quote contract event from on-chain escrow details when amountRbtc is absent', async () => {
		const { recoverServiceQuoteAcceptanceContract } = await import(
			'$lib/utils/service-contract/recover-quote-acceptance'
		);

		loadContractByEscrowId.mockResolvedValueOnce(false).mockResolvedValue(true);
		getPayment.mockResolvedValue({
			amount: 1_400_000_000_000_000n,
			tasker: '0x3333333333333333333333333333333333333333'
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

		expect(getPayment).toHaveBeenCalledWith(212n);
		expect(mockPublishServiceContractEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				paymentId: '212',
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

		loadContractByEscrowId.mockResolvedValue(false);
		getPayment.mockResolvedValue({
			tasker: '0x3333333333333333333333333333333333333333'
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

		expect(mockPublishServiceContractEvent).not.toHaveBeenCalled();
		expect(result).toEqual({
			status: 'contract_sync_pending',
			escrowId: '212',
			transactionHash: '0x2f98eb008f38d5eca651215ab8c5b194165e59589298196fa784a8bb4398e5ad'
		});
	});
});
