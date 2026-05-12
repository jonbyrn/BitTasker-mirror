import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MerkleTreeBuilder } from '@/builders/tree-builder';
import type { BlockchainProvider, EscrowCreatedEvent, EscrowResolvedEvent } from '@/types/blockchain';

describe('MerkleTreeBuilder', () => {
	let mockProvider: BlockchainProvider;
	let builder: MerkleTreeBuilder;

	beforeEach(() => {
		mockProvider = {
			getEscrow: vi.fn(),
			queryEscrowCreatedEvents: vi.fn(),
			queryEscrowResolvedEvents: vi.fn(),
			getTransactionReceipt: vi.fn()
		};

		builder = new MerkleTreeBuilder(mockProvider, 'sha256');
	});

	describe('build', () => {
		it('should build tree from events', async () => {
			const createdEvents: EscrowCreatedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
					blockNumber: 100,
					timestamp: 1000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					type: 'EscrowCreated'
				}
			];

			const resolvedEvents: EscrowResolvedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					blockNumber: 200,
					timestamp: 2000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					freelancerAmount: '950000000000000000',
					platformFee: '50000000000000000',
					type: 'EscrowResolved'
				}
			];

			vi.mocked(mockProvider.queryEscrowCreatedEvents).mockResolvedValue(createdEvents);
			vi.mocked(mockProvider.queryEscrowResolvedEvents).mockResolvedValue(resolvedEvents);
			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				timestamp: 2000,
				status: true,
				events: []
			});

			const result = await builder.build();

			expect(result).toBeDefined();
			expect(result.root).toBeDefined();
			expect(result.root).toHaveLength(66); // 0x + 64 hex chars
			expect(result.commitmentCount).toBe(1);
			expect(result.builtAt).toBeGreaterThan(0);
			expect(result.version).toBeDefined();
		});

		it('should handle empty events', async () => {
			vi.mocked(mockProvider.queryEscrowCreatedEvents).mockResolvedValue([]);
			vi.mocked(mockProvider.queryEscrowResolvedEvents).mockResolvedValue([]);

			await expect(builder.build()).rejects.toThrow('Cannot build tree with no commitments');
		});

		it('should skip failed transactions', async () => {
			const createdEvents: EscrowCreatedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
					blockNumber: 100,
					timestamp: 1000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					type: 'EscrowCreated'
				}
			];

			const resolvedEvents: EscrowResolvedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					blockNumber: 200,
					timestamp: 2000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					freelancerAmount: '950000000000000000',
					platformFee: '50000000000000000',
					type: 'EscrowResolved'
				}
			];

			vi.mocked(mockProvider.queryEscrowCreatedEvents).mockResolvedValue(createdEvents);
			vi.mocked(mockProvider.queryEscrowResolvedEvents).mockResolvedValue(resolvedEvents);
			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				timestamp: 2000,
				status: false, // Failed transaction
				events: []
			});

			await expect(builder.build()).rejects.toThrow('Cannot build tree with no commitments');
		});
	});

	describe('getProof', () => {
		it('should generate valid Merkle proof', async () => {
			// Create a simple tree first
			const createdEvents: EscrowCreatedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
					blockNumber: 100,
					timestamp: 1000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					type: 'EscrowCreated'
				}
			];

			const resolvedEvents: EscrowResolvedEvent[] = [
				{
					escrowId: '1',
					transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					blockNumber: 200,
					timestamp: 2000,
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					amount: '1000000000000000000',
					freelancerAmount: '950000000000000000',
					platformFee: '50000000000000000',
					type: 'EscrowResolved'
				}
			];

			vi.mocked(mockProvider.queryEscrowCreatedEvents).mockResolvedValue(createdEvents);
			vi.mocked(mockProvider.queryEscrowResolvedEvents).mockResolvedValue(resolvedEvents);
			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				timestamp: 2000,
				status: true,
				events: []
			});

			const result = await builder.build();
			
			// Get commitment for the escrow
			const { CommitmentGenerator } = await import('@/core/commitment');
			const commitmentGenerator = new CommitmentGenerator('sha256');
			const commitment = commitmentGenerator.create({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			// Rebuild tree to get proof (in real usage, tree would be cached)
			const commitments = [commitment].sort();
			const leaves = commitments.map(c => Buffer.from(c, 'hex'));
			const { MerkleTree } = await import('merkletreejs');
			const { sha256 } = await import('@noble/hashes/sha256');
			const tree = new MerkleTree(leaves, (data: Buffer) => Buffer.from(sha256(data)), {
				sortPairs: true,
				hashLeaves: false
			});

			const proof = builder.getProof(tree, commitment);

			expect(proof).toBeDefined();
			expect(proof.root).toBeDefined();
			expect(proof.leaf).toBe(commitment);
			expect(proof.proof).toBeInstanceOf(Array);
			expect(proof.proofFlags).toBeInstanceOf(Array);
			expect(proof.proof.length).toBe(proof.proofFlags.length);
		});
	});

	describe('buildIncremental', () => {
		it('should return existing tree if no new events', async () => {
			vi.mocked(mockProvider.queryEscrowResolvedEvents).mockResolvedValue([]);

			const result = await builder.buildIncremental('0xroot', 10);

			expect(result.root).toBe('0xroot');
			expect(result.commitmentCount).toBe(10);
		});
	});
});

