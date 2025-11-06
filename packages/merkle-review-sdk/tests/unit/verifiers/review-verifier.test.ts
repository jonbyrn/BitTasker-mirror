import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewVerifier } from '@/verifiers/review-verifier';
import { MerkleTreeBuilder } from '@/builders/tree-builder';
import { CommitmentGenerator } from '@/core/commitment';
import type { VerifiedReview, MerkleProof } from '@/types/index';
import type { BlockchainProvider, EscrowCreatedEvent, EscrowResolvedEvent } from '@/types/blockchain';

describe('ReviewVerifier', () => {
	let verifier: ReviewVerifier;
	let mockProvider: BlockchainProvider;
	let builder: MerkleTreeBuilder;
	let commitmentGenerator: CommitmentGenerator;

	beforeEach(() => {
		verifier = new ReviewVerifier('sha256');
		commitmentGenerator = new CommitmentGenerator('sha256');

		mockProvider = {
			getEscrow: async () => null,
			queryEscrowCreatedEvents: async () => [],
			queryEscrowResolvedEvents: async () => [],
			getTransactionReceipt: async () => null
		};

		builder = new MerkleTreeBuilder(mockProvider, 'sha256');
	});

	describe('verify', () => {
		it('should verify a valid review proof', async () => {
			// Create test escrow events
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

			// Mock provider methods
			const mockQueryCreated = async () => createdEvents;
			const mockQueryResolved = async () => resolvedEvents;
			const mockGetReceipt = async () => ({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				timestamp: 2000,
				status: true,
				events: []
			});

			mockProvider.queryEscrowCreatedEvents = mockQueryCreated;
			mockProvider.queryEscrowResolvedEvents = mockQueryResolved;
			mockProvider.getTransactionReceipt = mockGetReceipt;

			// Build tree
			const treeResult = await builder.build();

			// Create commitment
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

			// Get proof
			const proof = builder.getProof(tree, commitment);

			// Create review
			const review: VerifiedReview = {
				commitment,
				merkleProof: proof,
				reviewerPubkey: 'npub1test123',
				revieweePubkey: 'npub1test456',
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					},
					comment: 'Great work!'
				},
				createdAt: Date.now()
			};

			// Verify review
			const result = verifier.verify(review, treeResult.root);

			expect(result.valid).toBe(true);
			expect(result.details?.commitmentExists).toBe(true);
			expect(result.details?.proofValid).toBe(true);
			expect(result.details?.rootMatches).toBe(true);
		});

		it('should reject review with invalid commitment format', () => {
			const review: VerifiedReview = {
				commitment: 'invalid',
				merkleProof: {
					root: '0x' + 'a'.repeat(64),
					leaf: 'invalid',
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub1test123',
				revieweePubkey: 'npub1test456',
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					},
					comment: 'Test'
				},
				createdAt: Date.now()
			};

			const result = verifier.verify(review, '0x' + 'a'.repeat(64));

			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid commitment format');
		});

		it('should reject review with invalid proof structure', () => {
			const review: VerifiedReview = {
				commitment: 'a'.repeat(64),
				merkleProof: {
					root: '0x' + 'a'.repeat(64),
					leaf: 'a'.repeat(64),
					proof: ['a'.repeat(64)],
					proofFlags: [] // Mismatched length
				},
				reviewerPubkey: 'npub1test123',
				revieweePubkey: 'npub1test456',
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					},
					comment: 'Test'
				},
				createdAt: Date.now()
			};

			const result = verifier.verify(review, '0x' + 'a'.repeat(64));

			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid proof structure');
		});

		it('should reject review when leaf does not match commitment', () => {
			const review: VerifiedReview = {
				commitment: 'a'.repeat(64),
				merkleProof: {
					root: '0x' + 'a'.repeat(64),
					leaf: 'b'.repeat(64), // Different from commitment
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub1test123',
				revieweePubkey: 'npub1test456',
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					},
					comment: 'Test'
				},
				createdAt: Date.now()
			};

			const result = verifier.verify(review, '0x' + 'a'.repeat(64));

			expect(result.valid).toBe(false);
			expect(result.error).toContain('Proof leaf does not match commitment');
		});

		it('should reject review when root does not match', async () => {
			// Create a valid proof first
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

			mockProvider.queryEscrowCreatedEvents = async () => createdEvents;
			mockProvider.queryEscrowResolvedEvents = async () => resolvedEvents;
			mockProvider.getTransactionReceipt = async () => ({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				timestamp: 2000,
				status: true,
				events: []
			});

			const treeResult = await builder.build();

			const commitment = commitmentGenerator.create({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			// Rebuild tree to get proof
			const commitments = [commitment].sort();
			const leaves = commitments.map(c => Buffer.from(c, 'hex'));
			const { MerkleTree } = await import('merkletreejs');
			const { sha256 } = await import('@noble/hashes/sha256');
			const tree = new MerkleTree(leaves, (data: Buffer) => Buffer.from(sha256(data)), {
				sortPairs: true,
				hashLeaves: false
			});

			const proof = builder.getProof(tree, commitment);

			// Create review with wrong expected root
			const review: VerifiedReview = {
				commitment,
				merkleProof: proof,
				reviewerPubkey: 'npub1test123',
				revieweePubkey: 'npub1test456',
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					},
					comment: 'Test'
				},
				createdAt: Date.now()
			};

			// Verify with wrong root
			const result = verifier.verify(review, '0x' + 'f'.repeat(64));

			expect(result.valid).toBe(false);
			expect(result.error).toContain('Computed root does not match expected root');
			expect(result.details?.rootMatches).toBe(false);
		});
	});

	describe('verifyBatch', () => {
		it('should verify multiple reviews', async () => {
			// Create two escrow events
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
				},
				{
					escrowId: '2',
					transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
					blockNumber: 101,
					timestamp: 1001,
					client: '0xcccccccccccccccccccccccccccccccccccccccc',
					freelancer: '0xdddddddddddddddddddddddddddddddddddddddd',
					amount: '2000000000000000000',
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
				},
				{
					escrowId: '2',
					transactionHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
					blockNumber: 201,
					timestamp: 2001,
					client: '0xcccccccccccccccccccccccccccccccccccccccc',
					freelancer: '0xdddddddddddddddddddddddddddddddddddddddd',
					amount: '2000000000000000000',
					freelancerAmount: '1900000000000000000',
					platformFee: '100000000000000000',
					type: 'EscrowResolved'
				}
			];

			mockProvider.queryEscrowCreatedEvents = async () => createdEvents;
			mockProvider.queryEscrowResolvedEvents = async () => resolvedEvents;
			mockProvider.getTransactionReceipt = async (hash: string) => ({
				hash,
				blockNumber: 200,
				timestamp: 2000,
				status: true,
				events: []
			});

			const treeResult = await builder.build();

			// Create two commitments
			const commitment1 = commitmentGenerator.create({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			const commitment2 = commitmentGenerator.create({
				escrowId: '2',
				escrowTxHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
				taskerAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
				taskeeAddress: '0xdddddddddddddddddddddddddddddddddddddddd'
			});

			// Rebuild tree to get proofs
			const commitments = [commitment1, commitment2].sort();
			const leaves = commitments.map(c => Buffer.from(c, 'hex'));
			const { MerkleTree } = await import('merkletreejs');
			const { sha256 } = await import('@noble/hashes/sha256');
			const tree = new MerkleTree(leaves, (data: Buffer) => Buffer.from(sha256(data)), {
				sortPairs: true,
				hashLeaves: false
			});

			const proof1 = builder.getProof(tree, commitment1);
			const proof2 = builder.getProof(tree, commitment2);

			const reviews: VerifiedReview[] = [
				{
					commitment: commitment1,
					merkleProof: proof1,
					reviewerPubkey: 'npub1test123',
					revieweePubkey: 'npub1test456',
					content: {
						overallRating: 5,
						categoryRatings: {
							quality: 5,
							professionalism: 5,
							timeliness: 5
						},
						comment: 'Great!'
					},
					createdAt: Date.now()
				},
				{
					commitment: commitment2,
					merkleProof: proof2,
					reviewerPubkey: 'npub1test789',
					revieweePubkey: 'npub1test012',
					content: {
						overallRating: 4,
						categoryRatings: {
							quality: 4,
							professionalism: 4,
							timeliness: 4
						},
						comment: 'Good work'
					},
					createdAt: Date.now()
				}
			];

			const result = verifier.verifyBatch(reviews, treeResult.root);

			expect(result.total).toBe(2);
			expect(result.valid).toBe(2);
			expect(result.invalid).toBe(0);
			expect(result.results.length).toBe(2);
			expect(result.verificationTime).toBeGreaterThanOrEqual(0);
			expect(result.results[0].result.valid).toBe(true);
			expect(result.results[1].result.valid).toBe(true);
		});

		it('should handle mixed valid and invalid reviews', () => {
			const reviews: VerifiedReview[] = [
				{
					commitment: 'a'.repeat(64),
					merkleProof: {
						root: '0x' + 'a'.repeat(64),
						leaf: 'a'.repeat(64),
						proof: [],
						proofFlags: []
					},
					reviewerPubkey: 'npub1test123',
					revieweePubkey: 'npub1test456',
					content: {
						overallRating: 5,
						categoryRatings: {
							quality: 5,
							professionalism: 5,
							timeliness: 5
						},
						comment: 'Valid'
					},
					createdAt: Date.now()
				},
				{
					commitment: 'invalid',
					merkleProof: {
						root: '0x' + 'a'.repeat(64),
						leaf: 'invalid',
						proof: [],
						proofFlags: []
					},
					reviewerPubkey: 'npub1test789',
					revieweePubkey: 'npub1test012',
					content: {
						overallRating: 4,
						categoryRatings: {
							quality: 4,
							professionalism: 4,
							timeliness: 4
						},
						comment: 'Invalid'
					},
					createdAt: Date.now()
				}
			];

			const result = verifier.verifyBatch(reviews, '0x' + 'a'.repeat(64));

			expect(result.total).toBe(2);
			expect(result.valid).toBe(1);
			expect(result.invalid).toBe(1);
		});
	});

	describe('setHashFunction', () => {
		it('should change hash function', () => {
			expect(verifier).toBeDefined();
			verifier.setHashFunction('keccak256');
			// Should not throw
			expect(verifier).toBeDefined();
		});
	});
});

