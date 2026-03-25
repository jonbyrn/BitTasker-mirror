import { beforeEach, describe, expect, it, vi } from 'vitest';

type ContractCreationEvent = {
	state?: 'funding_submitted' | 'contract_sync_pending' | 'contract_ready' | 'failed';
	escrowId?: string;
	contractEventId?: string;
	transactionHash?: string;
	transactionHashes?: string[];
	error?: string;
};

function createStore(initialValue: ContractCreationEvent | null = null) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: ContractCreationEvent | null) => void>();

	return {
		set(nextValue: ContractCreationEvent | null) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		},
		subscribe(subscriber: (nextValue: ContractCreationEvent | null) => void) {
			subscriber(value);
			subscribers.add(subscriber);
			return () => subscribers.delete(subscriber);
		}
	};
}

const hoisted = vi.hoisted(() => ({
	contractCreationStore: createStore()
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		eventOps: {
			getContractCreationStore: () => hoisted.contractCreationStore
		}
	}
}));

describe('waitForContractCreationByTransactionHash', () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.resetModules();
		hoisted.contractCreationStore = createStore();
	});

	it('resolves when the matching transaction hash produces an escrow id', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-123',
			transactionHash: '0xAbC123',
			contractEventId: 'contract-escrow-123'
		});

		await expect(pending).resolves.toMatchObject({
			escrowId: 'escrow-123',
			transactionHash: '0xAbC123',
			contractEventId: 'contract-escrow-123'
		});
	}, 15_000);

	it('ignores unrelated transaction hashes until the correct event arrives', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-other',
			transactionHash: '0xdef456'
		});
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});

		await expect(pending).resolves.toMatchObject({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});
	}, 15_000);

	it('resolves when a replacement transaction hash aliases the original hash', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-123',
			transactionHash: '0xdef456',
			transactionHashes: ['0xabc123', '0xdef456']
		});

		await expect(pending).resolves.toMatchObject({
			escrowId: 'escrow-123',
			transactionHash: '0xdef456',
			transactionHashes: ['0xabc123', '0xdef456']
		});
	}, 15_000);

	it('rejects when the matching transaction hash reports an error', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123',
			error: 'Contract publish failed'
		});

		await expect(pending).rejects.toThrow('Contract publish failed');
	}, 15_000);

	it('rejects immediately when the matching transaction enters contract_sync_pending', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			state: 'contract_sync_pending',
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});

		await expect(pending).rejects.toThrow(
			'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
		);
	}, 15_000);

	it('ignores matching transaction hashes until an escrow id is available', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123');
		hoisted.contractCreationStore.set({
			escrowId: '',
			transactionHash: '0xabc123'
		});
		hoisted.contractCreationStore.set({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});

		await expect(pending).resolves.toMatchObject({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});
	}, 15_000);

	it('resolves immediately when the store already contains the matching event', async () => {
		hoisted.contractCreationStore = createStore({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});

		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		await expect(waitForContractCreationByTransactionHash('0xabc123')).resolves.toEqual({
			escrowId: 'escrow-123',
			transactionHash: '0xabc123'
		});
	});

	it('rejects after the configured timeout', async () => {
		vi.useFakeTimers();

		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		const pending = waitForContractCreationByTransactionHash('0xabc123', 25);
		const assertion = expect(pending).rejects.toThrow(
			'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
		);
		await vi.advanceTimersByTimeAsync(25);
		await assertion;
	});

	it('classifies replacement aliases as tx_replaced when confirmation times out', async () => {
		const { getContractCreationTimeoutReason } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		hoisted.contractCreationStore.set({
			transactionHash: '0xdef456',
			transactionHashes: ['0xabc123', '0xdef456']
		});

		expect(getContractCreationTimeoutReason('0xabc123')).toBe('tx_replaced');
	});

	it('classifies unmatched timeouts as pending_timeout', async () => {
		const { getContractCreationTimeoutReason } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		expect(getContractCreationTimeoutReason('0xabc123')).toBe('pending_timeout');
	});

	it('rejects invalid transaction hashes and timeout values', async () => {
		const { waitForContractCreationByTransactionHash } = await import(
			'$lib/utils/service-contract/await-contract-creation'
		);

		await expect(waitForContractCreationByTransactionHash('   ')).rejects.toThrow(
			'Transaction hash is required to await contract creation.'
		);
		await expect(waitForContractCreationByTransactionHash('0xabc123', 0)).rejects.toThrow(
			'Timeout must be a positive number of milliseconds.'
		);
	});
});
