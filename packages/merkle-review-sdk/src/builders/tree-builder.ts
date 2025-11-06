/**
 * Merkle tree builder from blockchain events
 */

import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { CommitmentGenerator } from '../core/commitment.js';
import type {
	BuildTreeParams,
	TreeBuildResult,
	MerkleProof
} from '../types/index.js';
import type {
	BlockchainProvider,
	EscrowCreatedEvent,
	EscrowResolvedEvent
} from '../types/blockchain.js';
import type { HashFunction } from '../types/config.js';

/**
 * Merkle tree builder class
 */
export class MerkleTreeBuilder {
	private blockchainProvider: BlockchainProvider;
	private commitmentGenerator: CommitmentGenerator;
	private hashFunction: HashFunction;

	constructor(
		blockchainProvider: BlockchainProvider,
		hashFunction: HashFunction = 'sha256'
	) {
		this.blockchainProvider = blockchainProvider;
		this.hashFunction = hashFunction;
		this.commitmentGenerator = new CommitmentGenerator(hashFunction);
	}

	/**
	 * Build Merkle tree from blockchain events
	 */
	async build(params: BuildTreeParams = {}): Promise<TreeBuildResult> {
		// Query escrow creation events
		const createdEvents = await this.blockchainProvider.queryEscrowCreatedEvents({
			fromBlock: params.fromBlock,
			toBlock: params.toBlock
		});

		// Query escrow resolution events
		const resolvedEvents = await this.blockchainProvider.queryEscrowResolvedEvents({
			fromBlock: params.fromBlock,
			toBlock: params.toBlock
		});

		// Create commitments from resolved escrows
		const commitments = await this.createCommitmentsFromEvents(
			createdEvents,
			resolvedEvents
		);

		// Build Merkle tree
		const tree = this.buildTree(commitments);

		// Get root
		const root = tree.getHexRoot();

		return {
			root,
			commitmentCount: commitments.length,
			builtAt: Date.now(),
			version: this.generateVersion(root, commitments.length)
		};
	}

	/**
	 * Build tree incrementally from existing tree + new events
	 */
	async buildIncremental(
		existingRoot: string,
		existingCommitmentCount: number,
		params: BuildTreeParams = {}
	): Promise<TreeBuildResult> {
		// Query only new events since last build
		// This assumes we track the last block processed
		const newResolvedEvents = await this.blockchainProvider.queryEscrowResolvedEvents({
			fromBlock: params.fromBlock,
			toBlock: params.toBlock
		});

		if (newResolvedEvents.length === 0) {
			// No new events, return existing tree
			return {
				root: existingRoot,
				commitmentCount: existingCommitmentCount,
				builtAt: Date.now(),
				version: this.generateVersion(existingRoot, existingCommitmentCount)
			};
		}

		// Get corresponding creation events for new resolutions
		const escrowIds = new Set(newResolvedEvents.map(e => e.escrowId));
		const createdEvents = await this.blockchainProvider.queryEscrowCreatedEvents({
			fromBlock: params.fromBlock,
			toBlock: params.toBlock
		});

		// Filter to only events we need
		const relevantCreatedEvents = createdEvents.filter(e =>
			escrowIds.has(e.escrowId)
		);

		// Create new commitments
		await this.createCommitmentsFromEvents(
			relevantCreatedEvents,
			newResolvedEvents
		);

		// For incremental building, we'd need to retrieve existing commitments
		// For now, we'll rebuild the full tree (can be optimized later)
		// TODO: Implement true incremental building with existing commitments storage
		return this.build(params);
	}

	/**
	 * Get Merkle proof for a commitment
	 */
	getProof(tree: MerkleTree, commitment: string): MerkleProof {
		// Convert commitment to buffer
		const leaf = Buffer.from(commitment, 'hex');

		// Get proof from tree
		const proof = tree.getProof(leaf);

		// Convert proof to our format
		const proofHashes = proof.map(p => p.data.toString('hex'));
		const proofFlags = proof.map(p => p.position === 'right');

		return {
			root: tree.getHexRoot(),
			leaf: commitment,
			proof: proofHashes,
			proofFlags
		};
	}

	/**
	 * Create commitments from escrow events
	 */
	private async createCommitmentsFromEvents(
		createdEvents: EscrowCreatedEvent[],
		resolvedEvents: EscrowResolvedEvent[]
	): Promise<string[]> {
		// Create a map of escrow IDs to creation events
		const createdMap = new Map<string, EscrowCreatedEvent>();
		createdEvents.forEach(event => {
			createdMap.set(event.escrowId, event);
		});

		// Create commitments for resolved escrows
		const commitments: string[] = [];

		for (const resolvedEvent of resolvedEvents) {
			const createdEvent = createdMap.get(resolvedEvent.escrowId);
			if (!createdEvent) {
				// Skip if we don't have creation event
				continue;
			}

			// Get transaction receipt to ensure we have the correct tx hash
			const receipt = await this.blockchainProvider.getTransactionReceipt(
				resolvedEvent.transactionHash
			);

			if (!receipt || !receipt.status) {
				// Skip failed transactions
				continue;
			}

			// Create commitment
			const commitment = this.commitmentGenerator.create({
				escrowId: resolvedEvent.escrowId,
				escrowTxHash: resolvedEvent.transactionHash,
				taskerAddress: createdEvent.client,
				taskeeAddress: createdEvent.freelancer
			});

			commitments.push(commitment);
		}

		// Sort commitments for deterministic tree building
		return commitments.sort();
	}

	/**
	 * Build Merkle tree from commitments
	 */
	private buildTree(commitments: string[]): MerkleTree {
		if (commitments.length === 0) {
			throw new Error('Cannot build tree with no commitments');
		}

		// Convert commitments to buffers
		const leaves = commitments.map(c => Buffer.from(c, 'hex'));

		// Create hash function wrapper
		const hashFn = (data: Buffer): Buffer => {
			const hash = this.hash(data);
			return Buffer.from(hash);
		};

		// Build tree
		const tree = new MerkleTree(leaves, hashFn, {
			sortPairs: true,
			hashLeaves: false // Commitments are already hashes
		});

		return tree;
	}

	/**
	 * Hash data using configured hash function
	 */
	private hash(data: Buffer | Uint8Array): Uint8Array {
		const bytes = data instanceof Buffer ? new Uint8Array(data) : data;

		switch (this.hashFunction) {
			case 'sha256':
				return sha256(bytes);
			case 'keccak256':
				return keccak_256(bytes);
			default:
				throw new Error(`Unsupported hash function: ${this.hashFunction}`);
		}
	}

	/**
	 * Generate version identifier for tree
	 */
	private generateVersion(root: string, count: number): string {
		return `${root.substring(0, 16)}-${count}-${Date.now()}`;
	}
}

