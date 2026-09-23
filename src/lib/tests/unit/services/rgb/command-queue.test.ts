/**
 * Unit tests for the RGB single-writer command queue.
 * See src/lib/services/rgb/command-queue.ts and
 * docs/adr/0001-greenfield-rgb-wasm-subsystem.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createRgbCommandQueue,
	UnimplementedRgbSealBackend,
	type RgbSealBackend
} from '$lib/services/rgb/command-queue';
import type {
	CommitCommandInput,
	ContractId,
	RgbSeal,
	SealId,
	SpendCommandInput,
	ValidateConsignmentInput,
	ValidateConsignmentResult,
	WitnessCommandInput
} from '$lib/services/rgb/types';

function makeSeal(overrides: Partial<RgbSeal> = {}): RgbSeal {
	return {
		id: 'seal-1' as SealId,
		contractId: 'contract-1' as ContractId,
		state: 'INITIATED',
		utxo: { txid: 'a'.repeat(64), vout: 0 },
		assetId: 'usdt_rgb',
		amount: 1000,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

const COMMIT_INPUT: CommitCommandInput = {
	contractId: 'contract-1' as ContractId,
	assetId: 'usdt_rgb',
	amount: 1000
};

const WITNESS_INPUT: WitnessCommandInput = {
	recipientId: 'seal-1' as SealId,
	contractId: 'contract-1' as ContractId,
	assetId: 'usdt_rgb'
};

const SPEND_INPUT: SpendCommandInput = {
	recipientId: 'seal-1' as SealId,
	contractId: 'contract-1' as ContractId,
	assetId: 'usdt_rgb'
};

const VALIDATE_INPUT: ValidateConsignmentInput = {
	consignment: 'consignment-blob',
	expectedContractId: 'contract-1' as ContractId
};

describe('RgbCommandQueue', () => {
	describe('state machine transitions', () => {
		let backend: RgbSealBackend;

		beforeEach(() => {
			backend = {
				commit: vi.fn().mockResolvedValue(makeSeal({ state: 'INITIATED' })),
				witness: vi.fn().mockResolvedValue(makeSeal({ state: 'WAITING_CONFIRMATIONS' })),
				spend: vi.fn().mockResolvedValue(makeSeal({ state: 'SETTLED' })),
				validateConsignment: vi.fn()
			};
		});

		it('INITIATED via commit()', async () => {
			const queue = createRgbCommandQueue(backend);
			const result = await queue.commit(COMMIT_INPUT);

			expect(result.ok).toBe(true);
			expect(result.value?.state).toBe('INITIATED');
			expect(backend.commit).toHaveBeenCalledWith(COMMIT_INPUT);
		});

		it('WAITING_COUNTERPARTY -> WAITING_CONFIRMATIONS via witness()', async () => {
			const queue = createRgbCommandQueue(backend);
			const result = await queue.witness(WITNESS_INPUT);

			expect(result.ok).toBe(true);
			expect(result.value?.state).toBe('WAITING_CONFIRMATIONS');
			expect(backend.witness).toHaveBeenCalledWith(WITNESS_INPUT);
		});

		it('WAITING_CONFIRMATIONS -> SETTLED via spend()', async () => {
			const queue = createRgbCommandQueue(backend);
			const result = await queue.spend(SPEND_INPUT);

			expect(result.ok).toBe(true);
			expect(result.value?.state).toBe('SETTLED');
			expect(backend.spend).toHaveBeenCalledWith(SPEND_INPUT);
		});

		it('runs the full INITIATED -> WAITING_CONFIRMATIONS -> SETTLED lifecycle in order', async () => {
			const queue = createRgbCommandQueue(backend);

			const committed = await queue.commit(COMMIT_INPUT);
			const witnessed = await queue.witness(WITNESS_INPUT);
			const spent = await queue.spend(SPEND_INPUT);

			expect([committed.value?.state, witnessed.value?.state, spent.value?.state]).toEqual([
				'INITIATED',
				'WAITING_CONFIRMATIONS',
				'SETTLED'
			]);
		});
	});

	describe('queue serialization', () => {
		it('runs concurrently-issued commands sequentially, in submission order', async () => {
			const order: string[] = [];
			const backend: RgbSealBackend = {
				commit: vi.fn(async () => {
					order.push('commit:start');
					await new Promise((r) => setTimeout(r, 20));
					order.push('commit:end');
					return makeSeal({ state: 'INITIATED' });
				}),
				witness: vi.fn(async () => {
					order.push('witness:start');
					order.push('witness:end');
					return makeSeal({ state: 'WAITING_CONFIRMATIONS' });
				}),
				spend: vi.fn(),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);

			// Fire both without awaiting the first — the queue must still serialize them.
			const p1 = queue.commit(COMMIT_INPUT);
			const p2 = queue.witness(WITNESS_INPUT);
			await Promise.all([p1, p2]);

			expect(order).toEqual(['commit:start', 'commit:end', 'witness:start', 'witness:end']);
		});

		it('never lets two commands execute with overlapping in-flight windows', async () => {
			let inFlight = 0;
			let maxConcurrent = 0;
			const backend: RgbSealBackend = {
				commit: vi.fn(async () => {
					inFlight++;
					maxConcurrent = Math.max(maxConcurrent, inFlight);
					await new Promise((r) => setTimeout(r, 10));
					inFlight--;
					return makeSeal({ state: 'INITIATED' });
				}),
				witness: vi.fn(async () => {
					inFlight++;
					maxConcurrent = Math.max(maxConcurrent, inFlight);
					await new Promise((r) => setTimeout(r, 10));
					inFlight--;
					return makeSeal({ state: 'WAITING_CONFIRMATIONS' });
				}),
				spend: vi.fn(async () => {
					inFlight++;
					maxConcurrent = Math.max(maxConcurrent, inFlight);
					await new Promise((r) => setTimeout(r, 10));
					inFlight--;
					return makeSeal({ state: 'SETTLED' });
				}),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);
			await Promise.all([
				queue.commit(COMMIT_INPUT),
				queue.witness(WITNESS_INPUT),
				queue.spend(SPEND_INPUT)
			]);

			expect(maxConcurrent).toBe(1);
		});
	});

	describe('fail-closed error handling', () => {
		it('returns { ok: false, error } for a rejected command instead of throwing', async () => {
			const backend: RgbSealBackend = {
				commit: vi.fn().mockRejectedValue(new Error('stash validation failed')),
				witness: vi.fn(),
				spend: vi.fn(),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);
			const result = await queue.commit(COMMIT_INPUT);

			expect(result).toEqual({ ok: false, error: 'stash validation failed' });
		});

		it('does not poison the queue — a failed command is followed by a successful one', async () => {
			const backend: RgbSealBackend = {
				commit: vi.fn().mockRejectedValue(new Error('boom')),
				witness: vi.fn().mockResolvedValue(makeSeal({ state: 'WAITING_CONFIRMATIONS' })),
				spend: vi.fn(),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);
			const failed = await queue.commit(COMMIT_INPUT);
			const succeeded = await queue.witness(WITNESS_INPUT);

			expect(failed.ok).toBe(false);
			expect(succeeded.ok).toBe(true);
			expect(succeeded.value?.state).toBe('WAITING_CONFIRMATIONS');
		});

		it('isolates failures per command when several are queued concurrently', async () => {
			const backend: RgbSealBackend = {
				commit: vi.fn().mockRejectedValue(new Error('commit failed')),
				witness: vi.fn().mockResolvedValue(makeSeal({ state: 'WAITING_CONFIRMATIONS' })),
				spend: vi.fn().mockRejectedValue(new Error('spend failed')),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);
			const [commitResult, witnessResult, spendResult] = await Promise.all([
				queue.commit(COMMIT_INPUT),
				queue.witness(WITNESS_INPUT),
				queue.spend(SPEND_INPUT)
			]);

			expect(commitResult).toEqual({ ok: false, error: 'commit failed' });
			expect(witnessResult.ok).toBe(true);
			expect(spendResult).toEqual({ ok: false, error: 'spend failed' });
		});

		it('wraps non-Error rejections into a string message', async () => {
			const backend: RgbSealBackend = {
				commit: vi.fn().mockRejectedValue('plain string rejection'),
				witness: vi.fn(),
				spend: vi.fn(),
				validateConsignment: vi.fn()
			};

			const queue = createRgbCommandQueue(backend);
			const result = await queue.commit(COMMIT_INPUT);

			expect(result).toEqual({ ok: false, error: 'plain string rejection' });
		});
	});

	describe('validateConsignment', () => {
		it('delegates to the backend and returns its result', async () => {
			const validation: ValidateConsignmentResult = { valid: true, seal: makeSeal() };
			const backend: RgbSealBackend = {
				commit: vi.fn(),
				witness: vi.fn(),
				spend: vi.fn(),
				validateConsignment: vi.fn().mockResolvedValue(validation)
			};

			const queue = createRgbCommandQueue(backend);
			const result = await queue.validateConsignment(VALIDATE_INPUT);

			expect(result.ok).toBe(true);
			expect(result.value).toEqual(validation);
			expect(backend.validateConsignment).toHaveBeenCalledWith(VALIDATE_INPUT);
		});
	});

	describe('UnimplementedRgbSealBackend (fail-closed default)', () => {
		it('rejects every command until a real backend is wired', async () => {
			const queue = createRgbCommandQueue(new UnimplementedRgbSealBackend());

			const commit = await queue.commit(COMMIT_INPUT);
			const witness = await queue.witness(WITNESS_INPUT);
			const spend = await queue.spend(SPEND_INPUT);
			const validate = await queue.validateConsignment(VALIDATE_INPUT);

			expect(commit.ok).toBe(false);
			expect(witness.ok).toBe(false);
			expect(spend.ok).toBe(false);
			expect(validate.ok).toBe(false);
		});
	});
});
