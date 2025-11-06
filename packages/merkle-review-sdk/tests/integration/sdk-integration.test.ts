import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MerkleReviewSDK } from '@/sdk';
import { EthersBlockchainProvider } from '@/providers/ethers';
import { LocalStorageProvider } from '@/storage/local';
import type { SDKConfig } from '@/types/config';
import type { VerifiedReview, CommitmentParams } from '@/types/index';
import type { Contract, JsonRpcProvider } from 'ethers';

// Mock IndexedDB (reuse pattern from SDK tests)
const mockDB = new Map<string, any>();

class MockIDBRequest<T> {
	result: T | null = null;
	error: DOMException | null = null;
	onsuccess: ((event: Event) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	readyState: 'pending' | 'done' = 'pending';

	constructor(resultValue?: T) {
		if (resultValue !== undefined) {
			this.result = resultValue;
			setTimeout(() => {
				if (this.onsuccess) {
					this.readyState = 'done';
					this.onsuccess(new Event('success'));
				}
			}, 0);
		}
	}
}

class MockIDBCursor {
	value: any;
	continue: () => void;
	key: any;

	constructor(value: any) {
		this.value = value;
		this.continue = vi.fn();
		this.key = value?.root || null;
	}
}

class MockIDBIndex {
	private storeName: string;
	private indexName: string;

	constructor(storeName: string, indexName: string) {
		this.storeName = storeName;
		this.indexName = indexName;
	}

	get(key: any): MockIDBRequest<any> {
		const request = new MockIDBRequest<any>();
		setTimeout(() => {
			for (const value of mockDB.values()) {
				if (value.metadata?.version === key) {
					request.result = value;
					break;
				}
			}
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	}

	openCursor(range: IDBValidKey | IDBKeyRange | null, direction: IDBCursorDirection = 'next'): MockIDBRequest<IDBCursor> {
		const request = new MockIDBRequest<IDBCursor>();
		setTimeout(() => {
			const values: any[] = [];
			for (const [key, value] of mockDB.entries()) {
				if (key.startsWith(`${this.storeName}:`)) {
					values.push(value);
				}
			}
			
			const sorted = direction === 'prev' 
				? values.sort((a: any, b: any) => (b.metadata?.builtAt || 0) - (a.metadata?.builtAt || 0))
				: values.sort((a: any, b: any) => (a.metadata?.builtAt || 0) - (b.metadata?.builtAt || 0));
			
			const cursor = sorted.length > 0 ? new MockIDBCursor(sorted[0]) : null;
			request.result = cursor as any;
			
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	}
}

class MockIDBObjectStore {
	private storeName: string;

	constructor(storeName: string) {
		this.storeName = storeName;
	}

	get(key: any): MockIDBRequest<any> {
		const request = new MockIDBRequest<any>();
		setTimeout(() => {
			request.result = mockDB.get(`${this.storeName}:${key}`) || null;
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	}

	put(value: any): MockIDBRequest<IDBValidKey> {
		const request = new MockIDBRequest<IDBValidKey>();
		setTimeout(() => {
			mockDB.set(`${this.storeName}:${value.root}`, value);
			request.result = value.root;
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	}

	clear(): MockIDBRequest<undefined> {
		const request = new MockIDBRequest<undefined>();
		setTimeout(() => {
			const keysToDelete: string[] = [];
			for (const key of mockDB.keys()) {
				if (key.startsWith(`${this.storeName}:`)) {
					keysToDelete.push(key);
				}
			}
			keysToDelete.forEach(key => mockDB.delete(key));
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	}

	index(name: string): MockIDBIndex {
		return new MockIDBIndex(this.storeName, name);
	}
}

class MockIDBTransaction {
	private stores: Map<string, MockIDBObjectStore> = new Map();

	constructor(storeNames: string[], mode: IDBTransactionMode) {
		storeNames.forEach(name => {
			this.stores.set(name, new MockIDBObjectStore(name));
		});
	}

	objectStore(name: string): MockIDBObjectStore {
		return this.stores.get(name)!;
	}
}

class MockIDBDatabase {
	private stores: Map<string, MockIDBObjectStore> = new Map();

	transaction(storeNames: string[], mode: IDBTransactionMode): MockIDBTransaction {
		return new MockIDBTransaction(storeNames, mode);
	}
}

const mockIndexedDB = {
	open: vi.fn((name: string, version?: number) => {
		const request = new MockIDBRequest<IDBDatabase>();
		setTimeout(() => {
			const db = new MockIDBDatabase() as any;
			request.result = db;
			if (request.onsuccess) {
				request.onsuccess(new Event('success'));
			}
		}, 0);
		return request;
	})
};

describe('SDK Integration Tests', () => {
	let mockContract: Partial<Contract>;
	let mockProvider: Partial<JsonRpcProvider>;
	let blockchainProvider: EthersBlockchainProvider;
	let storageProvider: LocalStorageProvider;
	let config: SDKConfig;
	let sdk: MerkleReviewSDK;

	beforeEach(() => {
		// Reset mock DB
		mockDB.clear();
		global.indexedDB = mockIndexedDB as any;

		mockProvider = {
			getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 }),
			getTransactionReceipt: vi.fn().mockResolvedValue({
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				status: 1,
				logs: [],
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			})
		};

		mockContract = {
			getEscrow: vi.fn(),
			filters: {
				EscrowCreated: vi.fn().mockReturnValue({}),
				EscrowResolved: vi.fn().mockReturnValue({})
			},
			queryFilter: vi.fn()
		};

		blockchainProvider = new EthersBlockchainProvider({
			contract: mockContract as Contract,
			provider: mockProvider as JsonRpcProvider
		});

		storageProvider = new LocalStorageProvider('test-integration-db', 'test-integration-store');
		(storageProvider as any).db = null;

		config = {
			blockchainProvider,
			storageProviders: [storageProvider],
			hashFunction: 'sha256'
		};

		sdk = new MerkleReviewSDK(config);
	});

	describe('Complete Review Workflow', () => {
		it('should complete full workflow: build tree, create commitment, get proof, verify review', async () => {
			// Step 1: Mock blockchain events
			const mockCreatedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000')
				],
				transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				blockNumber: 100,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
			};

			const mockResolvedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000'),
					BigInt('950000000000000000'),
					BigInt('50000000000000000')
				],
				transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			};

			vi.mocked(mockContract.queryFilter)
				.mockResolvedValueOnce([mockCreatedEvent] as any)
				.mockResolvedValueOnce([mockResolvedEvent] as any);

			// Step 2: Build tree
			const treeResult = await sdk.buildTree();
			expect(treeResult).toBeDefined();
			expect(treeResult.root).toBeDefined();
			expect(treeResult.commitmentCount).toBe(1);

			// Step 3: Create commitment manually (simulating what user would do)
			const commitmentParams: CommitmentParams = {
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			};

			const commitment = sdk.createCommitment(commitmentParams);
			expect(commitment).toBeDefined();
			expect(sdk.validateCommitment(commitment)).toBe(true);

			// Step 4: Get proof using SDK method
			// Store tree data first
			const treeData = {
				root: treeResult.root,
				commitments: [commitment],
				metadata: {
					version: treeResult.version,
					builtAt: treeResult.builtAt,
					commitmentCount: treeResult.commitmentCount
				}
			};

			const proof = await sdk.getProof(commitment, treeData);
			expect(proof).toBeDefined();
			if (!proof) {
				throw new Error('Failed to get proof');
			}
			expect(proof.root).toBe(treeResult.root);
			expect(proof.leaf).toBe(commitment);

			// Step 5: Create verified review
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
					comment: 'Excellent work!'
				},
				createdAt: Date.now()
			};

			// Step 6: Verify review
			const verificationResult = sdk.verifyReview(review, treeResult.root);
			expect(verificationResult.valid).toBe(true);
			expect(verificationResult.details?.commitmentExists).toBe(true);
			expect(verificationResult.details?.proofValid).toBe(true);
			expect(verificationResult.details?.rootMatches).toBe(true);
		});

		it('should store and retrieve tree', async () => {
			// Build tree
			const mockCreatedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000')
				],
				transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				blockNumber: 100,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
			};

			const mockResolvedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000'),
					BigInt('950000000000000000'),
					BigInt('50000000000000000')
				],
				transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			};

			vi.mocked(mockContract.queryFilter)
				.mockResolvedValueOnce([mockCreatedEvent] as any)
				.mockResolvedValueOnce([mockResolvedEvent] as any);

			const treeResult = await sdk.buildTree();

			// Create commitment to include in stored tree
			const commitment = sdk.createCommitment({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			// Store tree with commitments
			const treeData = {
				root: treeResult.root,
				commitments: [commitment],
				metadata: {
					version: treeResult.version,
					builtAt: treeResult.builtAt,
					commitmentCount: treeResult.commitmentCount
				}
			};

			const storeResult = await sdk.storeTree(treeData);
			expect(storeResult.success).toBe(true);

			// Retrieve tree
			const retrieved = await sdk.retrieveTree(treeResult.root);
			expect(retrieved).toBeDefined();
			if (retrieved) {
				expect(retrieved.root).toBe(treeResult.root);
				expect(retrieved.metadata.version).toBe(treeResult.version);
			}
		});

		it('should handle multiple escrows and batch verification', async () => {
			// Create multiple escrow events
			const mockCreatedEvents = [
				{
					args: [
						BigInt('1'),
						'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
						'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
						BigInt('1000000000000000000')
					],
					transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
					hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
					blockNumber: 100,
					getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
				},
				{
					args: [
						BigInt('2'),
						'0xcccccccccccccccccccccccccccccccccccccccc',
						'0xdddddddddddddddddddddddddddddddddddddddd',
						BigInt('2000000000000000000')
					],
					transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
					hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
					blockNumber: 101,
					getBlock: vi.fn().mockResolvedValue({ timestamp: 1001 })
				}
			];

			const mockResolvedEvents = [
				{
					args: [
						BigInt('1'),
						'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
						'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
						BigInt('1000000000000000000'),
						BigInt('950000000000000000'),
						BigInt('50000000000000000')
					],
					transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					blockNumber: 200,
					getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
				},
				{
					args: [
						BigInt('2'),
						'0xcccccccccccccccccccccccccccccccccccccccc',
						'0xdddddddddddddddddddddddddddddddddddddddd',
						BigInt('2000000000000000000'),
						BigInt('1900000000000000000'),
						BigInt('100000000000000000')
					],
					transactionHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
					hash: '0x4444444444444444444444444444444444444444444444444444444444444444',
					blockNumber: 201,
					getBlock: vi.fn().mockResolvedValue({ timestamp: 2001 })
				}
			];

			vi.mocked(mockContract.queryFilter)
				.mockResolvedValueOnce(mockCreatedEvents as any)
				.mockResolvedValueOnce(mockResolvedEvents as any);

			vi.mocked(mockProvider.getTransactionReceipt)
				.mockResolvedValueOnce({
					hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
					blockNumber: 200,
					status: 1,
					logs: [],
					getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
				} as any)
				.mockResolvedValueOnce({
					hash: '0x4444444444444444444444444444444444444444444444444444444444444444',
					blockNumber: 201,
					status: 1,
					logs: [],
					getBlock: vi.fn().mockResolvedValue({ timestamp: 2001 })
				} as any);

			// Build tree with multiple commitments
			const treeResult = await sdk.buildTree();
			expect(treeResult.commitmentCount).toBe(2);

			// Create commitments and proofs
			const commitment1 = sdk.createCommitment({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			const commitment2 = sdk.createCommitment({
				escrowId: '2',
				escrowTxHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
				taskerAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
				taskeeAddress: '0xdddddddddddddddddddddddddddddddddddddddd'
			});

			// Get proofs using SDK method
			// Important: commitments must be sorted the same way as when tree was built
			const sortedCommitments = [commitment1, commitment2].sort();
			const treeData = {
				root: treeResult.root,
				commitments: sortedCommitments,
				metadata: {
					version: treeResult.version,
					builtAt: treeResult.builtAt,
					commitmentCount: treeResult.commitmentCount
				}
			};
			const proof1 = await sdk.getProof(commitment1, treeData);
			const proof2 = await sdk.getProof(commitment2, treeData);
			expect(proof1).toBeDefined();
			expect(proof2).toBeDefined();
			if (!proof1 || !proof2) {
				throw new Error('Failed to get proofs');
			}
			// Verify proof roots match tree root
			expect(proof1.root).toBe(treeResult.root);
			expect(proof2.root).toBe(treeResult.root);

			// Create reviews
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

			// Batch verify
			const batchResult = sdk.verifyBatch(reviews, treeResult.root);
			expect(batchResult.total).toBe(2);
			expect(batchResult.valid).toBe(2);
			expect(batchResult.invalid).toBe(0);
			expect(batchResult.verificationTime).toBeGreaterThanOrEqual(0);
		});

		it('should handle buildAndStoreTree workflow', async () => {
			const mockCreatedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000')
				],
				transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				blockNumber: 100,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
			};

			const mockResolvedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000'),
					BigInt('950000000000000000'),
					BigInt('50000000000000000')
				],
				transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			};

			vi.mocked(mockContract.queryFilter)
				.mockResolvedValueOnce([mockCreatedEvent] as any)
				.mockResolvedValueOnce([mockResolvedEvent] as any);

			const result = await sdk.buildAndStoreTree();

			expect(result.treeResult).toBeDefined();
			expect(result.treeResult.root).toBeDefined();
			expect(result.storageResult.success).toBe(true);
		});

		it('should verify review with automatic root retrieval', async () => {
			// Build and store tree
			const mockCreatedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000')
				],
				transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				blockNumber: 100,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
			};

			const mockResolvedEvent = {
				args: [
					BigInt('1'),
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					BigInt('1000000000000000000'),
					BigInt('950000000000000000'),
					BigInt('50000000000000000')
				],
				transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			};

			vi.mocked(mockContract.queryFilter)
				.mockResolvedValueOnce([mockCreatedEvent] as any)
				.mockResolvedValueOnce([mockResolvedEvent] as any);

			const treeResult = await sdk.buildTree();
			const commitment = sdk.createCommitment({
				escrowId: '1',
				escrowTxHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				taskerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				taskeeAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
			});

			// Store tree
			const treeData = {
				root: treeResult.root,
				commitments: [commitment],
				metadata: {
					version: treeResult.version,
					builtAt: treeResult.builtAt,
					commitmentCount: treeResult.commitmentCount
				}
			};

			await sdk.storeTree(treeData);

			// Get proof using SDK method
			const proof = await sdk.getProof(commitment, treeData);
			expect(proof).toBeDefined();
			if (!proof) {
				throw new Error('Failed to get proof');
			}

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
					comment: 'Excellent!'
				},
				createdAt: Date.now()
			};

			// Verify with automatic root retrieval
			const result = await sdk.verifyReviewWithRoot(review, treeResult.root);
			expect(result.valid).toBe(true);
		});
	});

	describe('Error Handling', () => {
		it('should handle invalid review gracefully', () => {
			const review: VerifiedReview = {
				commitment: 'invalid',
				merkleProof: {
					root: '0x' + 'a'.repeat(64),
					leaf: 'invalid',
					proof: [],
					proofFlags: []
				},
				reviewerPubkey: 'npub1test',
				revieweePubkey: 'npub1test2',
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

			const result = sdk.verifyReview(review, '0x' + 'a'.repeat(64));
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('should handle storage failures gracefully', async () => {
			const sdkNoStorage = new MerkleReviewSDK({
				blockchainProvider,
				storageProviders: []
			});

			const treeData = {
				root: '0x' + 'a'.repeat(64),
				commitments: [],
				metadata: {
					version: 'v1',
					builtAt: Date.now(),
					commitmentCount: 0
				}
			};

			const result = await sdkNoStorage.storeTree(treeData);
			expect(result.success).toBe(false);
			expect(result.error).toContain('No storage providers');
		});
	});
});

