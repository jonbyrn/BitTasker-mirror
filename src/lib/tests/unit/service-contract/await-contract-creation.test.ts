import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionReceipt } from 'ethers';

const mockInitContract = vi.fn();
const mockLoadContractByEscrowId = vi.fn();
const mockParsePaymentId = vi.fn();

vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: () => '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
}));

vi.mock('$lib/utils/contract/v2/creation', () => ({
	parsePaymentContractCreatedPaymentId: (...args: unknown[]) => mockParsePaymentId(...args)
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		loadContractByEscrowId: (...args: unknown[]) => mockLoadContractByEscrowId(...args)
	}
}));

vi.mock('$lib/utils/contract', () => ({
	initContract: (...args: unknown[]) => mockInitContract(...args)
}));

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
	return {
		status: 1,
		logs: [],
		...overrides
	} as TransactionReceipt;
}

describe('waitForContractCreationByTransactionHash', () => {
	let getTransactionReceipt: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useRealTimers();
		vi.resetModules();
		vi.clearAllMocks();
		getTransactionReceipt = vi.fn();
		mockInitContract.mockResolvedValue({
			provider: { getTransactionReceipt },
			contract: {},
			wallet: { address: '0x1111111111111111111111111111111111111111' }
		});
		mockParsePaymentId.mockReturnValue(999n);
		mockLoadContractByEscrowId.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves when the matching transaction hash produces an escrow id', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		getTransactionReceipt.mockResolvedValue(receipt({ status: 1 }));
		mockParsePaymentId.mockReturnValueOnce(42n);

		await expect(waitForContractCreationByTransactionHash('0xAbC123')).resolves.toEqual({
			escrowId: '42',
			transactionHash: '0xabc123'
		});
	});

	it('polls until a receipt appears then resolves', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		getTransactionReceipt.mockResolvedValueOnce(null).mockResolvedValueOnce(receipt({ status: 1 }));
		mockParsePaymentId.mockReturnValueOnce(7n);

		const pending = waitForContractCreationByTransactionHash('0xabc123', {
			timeoutMs: 15_000,
			pollIntervalMs: 1
		});

		await expect(pending).resolves.toMatchObject({
			escrowId: '7',
			transactionHash: '0xabc123'
		});
	});

	it('throws syncing message when the contract cannot be loaded after a successful receipt', async () => {
		const { waitForContractCreationByTransactionHash, CONTRACT_CREATION_SYNCING_MESSAGE } =
			await import('$lib/utils/service-contract/await-contract-creation');

		getTransactionReceipt.mockResolvedValue(receipt({ status: 1 }));
		mockParsePaymentId.mockReturnValueOnce(55n);
		mockLoadContractByEscrowId.mockResolvedValue(false);

		await expect(
			waitForContractCreationByTransactionHash('0xabc123', { pollIntervalMs: 1 })
		).rejects.toThrow(CONTRACT_CREATION_SYNCING_MESSAGE);
	});

	it('rejects after the configured timeout when no receipt arrives', async () => {
		const { waitForContractCreationByTransactionHash, getContractCreationTimeoutReason } =
			await import('$lib/utils/service-contract/await-contract-creation');

		getTransactionReceipt.mockResolvedValue(null);

		await expect(
			waitForContractCreationByTransactionHash('0xabc123', {
				timeoutMs: 200,
				pollIntervalMs: 40
			})
		).rejects.toThrow(getContractCreationTimeoutReason('0xabc123', { timeoutMs: 200 }));
	});

	it('getContractCreationTimeoutReason includes the transaction hash and duration', async () => {
		const { getContractCreationTimeoutReason } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const msg = getContractCreationTimeoutReason('0xdead', { timeoutMs: 45_000 });
		expect(msg).toContain('0xdead');
		expect(msg).toContain('45');
	});
});
