import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
	currentContract: null as any,
	mockPublishPendingServiceAcceptanceUnknownByTxHash: vi.fn().mockResolvedValue(undefined),
	mockReplacePendingContractByTxHash: vi.fn(),
	mockCleanupPendingContractByTxHash: vi.fn(),
	mockHandleEscrowCreated: vi.fn(),
	mockFindPendingServiceContractByTransactionHashes: vi
		.fn()
		.mockReturnValue({ contextType: 'service' }),
	mockWallet: {
		address: '0x1111111111111111111111111111111111111111',
		signTransaction: vi.fn()
	},
	mockProvider: {
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice: BigInt('1000000000')
		}),
		getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000')),
		getTransactionReceipt: vi.fn()
	}
}));

vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' },
		2: { percentage: 200, label: '2.0%' },
		3: { percentage: 150, label: '1.5%' }
	},
	normalizeRskAddress: vi.fn((value: string) => value?.toLowerCase() ?? '')
}));

vi.mock('ethers', async () => {
	const actual = await vi.importActual<typeof import('ethers')>('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			Contract: vi.fn().mockImplementation(() => hoisted.currentContract)
		}
	};
});

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: vi.fn(() => hoisted.mockWallet),
	getProvider: vi.fn(() => hoisted.mockProvider),
	walletManager: {
		initialize: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showInfoToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	publishPendingServiceAcceptanceUnknownByTxHash:
		hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash,
	replacePendingContractByTxHash: hoisted.mockReplacePendingContractByTxHash,
	cleanupPendingContractByTxHash: hoisted.mockCleanupPendingContractByTxHash,
	handleEscrowCreated: hoisted.mockHandleEscrowCreated,
	findPendingServiceContractByTransactionHashes:
		hoisted.mockFindPendingServiceContractByTransactionHashes
}));

describe('escrow.createEscrow acceptance ambiguity handling', () => {
	function buildVerifiedEscrowData(overrides: Record<string, unknown> = {}) {
		return {
			client: '0x1111111111111111111111111111111111111111',
			freelancer: '0x2222222222222222222222222222222222222222',
			amount: BigInt('1000000000000000000'),
			state: 0,
			estimatedStartTime: BigInt(1_700_000_000),
			estimatedCompletionTime: BigInt(1_700_003_600),
			timelockEnd: BigInt(1_700_100_000),
			clientFeeTier: 2,
			freelancerFeeTier: 2,
			createdAt: BigInt(1_700_000_000),
			...overrides
		};
	}

	async function loadEscrowModule() {
		return await import('$lib/utils/escrow/v1/escrow');
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useRealTimers();
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0x3333333333333333333333333333333333333333');
		hoisted.mockProvider.getTransactionReceipt = vi.fn().mockResolvedValue({
			confirmations: 3
		});

		hoisted.currentContract = {
			interface: {
				parseLog: vi.fn(() => {
					throw new Error('EscrowCreated event not found');
				})
			},
			createEscrow: vi.fn(),
			getEscrow: vi.fn().mockResolvedValue(buildVerifiedEscrowData())
		};

		const { escrow } = await loadEscrowModule();
		escrow.resetCachedContract();
	}, 30_000);

	it(
		'waits for the required confirmation threshold before publishing the funded service contract',
		async () => {
			vi.useFakeTimers();
			const { escrow } = await loadEscrowModule();

			hoisted.currentContract.interface.parseLog = vi.fn(() => ({
				name: 'EscrowCreated',
				args: [
					'svc-escrow-finality',
					'0x1111111111111111111111111111111111111111',
					'0x2222222222222222222222222222222222222222',
					BigInt('1000000000000000000')
				]
			}));
			hoisted.currentContract.getEscrow = vi.fn().mockResolvedValue(buildVerifiedEscrowData());
			hoisted.mockProvider.getTransactionReceipt = vi
				.fn()
				.mockResolvedValueOnce({ confirmations: 1 })
				.mockResolvedValueOnce({ confirmations: 2 })
				.mockResolvedValueOnce({ confirmations: 3, hash: '0xservice-finality', logs: [{ topics: [], data: '0x' }], gasUsed: BigInt(100000), status: 1 });

			const createEscrowMethod = vi.fn().mockResolvedValue({
				hash: '0xservice-finality',
				wait: vi.fn().mockResolvedValue({
					hash: '0xservice-finality',
					status: 1,
					gasUsed: BigInt(100000),
					logs: [{ topics: [], data: '0x' }]
				})
			}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
			(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
			hoisted.currentContract.createEscrow = createEscrowMethod;

			const result = await escrow.createEscrow(
				'0x2222222222222222222222222222222222222222',
				'1.0',
				1_700_000_000,
				1_700_003_600,
				2,
				2
			);

			expect(result.status).toBe('pending');
			await vi.runOnlyPendingTimersAsync();
			await vi.runOnlyPendingTimersAsync();

			expect(hoisted.mockHandleEscrowCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId: 'svc-escrow-finality',
					transactionHash: '0xservice-finality'
				})
			);
			expect(hoisted.mockProvider.getTransactionReceipt).toHaveBeenCalledTimes(3);
		},
		30_000
	);

	it(
		'publishes the service contract only after getEscrow verification succeeds',
		async () => {
			const { escrow } = await loadEscrowModule();

			hoisted.currentContract.interface.parseLog = vi.fn(() => ({
				name: 'EscrowCreated',
				args: [
					'svc-escrow-verified',
					'0x1111111111111111111111111111111111111111',
					'0x2222222222222222222222222222222222222222',
					BigInt('1000000000000000000')
				]
			}));
			hoisted.currentContract.getEscrow = vi
				.fn()
				.mockResolvedValue(buildVerifiedEscrowData());

			const createEscrowMethod = vi.fn().mockResolvedValue({
				hash: '0xservice-verified',
				wait: vi.fn().mockResolvedValue({
					hash: '0xservice-verified',
					status: 1,
					gasUsed: BigInt(100000),
					logs: [{ topics: [], data: '0x' }]
				})
			}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
			(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
			hoisted.currentContract.createEscrow = createEscrowMethod;

			const result = await escrow.createEscrow(
				'0x2222222222222222222222222222222222222222',
				'1.0',
				1_700_000_000,
				1_700_003_600,
				2,
				2
			);

			expect(result.status).toBe('pending');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(hoisted.mockHandleEscrowCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					escrowId: 'svc-escrow-verified',
					transactionHash: '0xservice-verified'
				})
			);
			expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).not.toHaveBeenCalled();
		},
		30_000
	);

	it(
		'publishes accept_unknown with reconciliation_deferred when receipt verification mismatches chain state',
		async () => {
			const { escrow } = await loadEscrowModule();

			hoisted.currentContract.interface.parseLog = vi.fn(() => ({
				name: 'EscrowCreated',
				args: [
					'svc-escrow-mismatch',
					'0x1111111111111111111111111111111111111111',
					'0x2222222222222222222222222222222222222222',
					BigInt('1000000000000000000')
				]
			}));
			hoisted.currentContract.getEscrow = vi.fn().mockResolvedValue(
				buildVerifiedEscrowData({
					freelancer: '0x3333333333333333333333333333333333333333'
				})
			);

			const createEscrowMethod = vi.fn().mockResolvedValue({
				hash: '0xservice-mismatch',
				wait: vi.fn().mockResolvedValue({
					hash: '0xservice-mismatch',
					status: 1,
					gasUsed: BigInt(100000),
					logs: [{ topics: [], data: '0x' }]
				})
			}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
			(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
			hoisted.currentContract.createEscrow = createEscrowMethod;

			const result = await escrow.createEscrow(
				'0x2222222222222222222222222222222222222222',
				'1.0',
				1_700_000_000,
				1_700_003_600,
				2,
				2
			);

			expect(result.status).toBe('pending');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
				'0xservice-mismatch',
				'reconciliation_deferred',
				'0xservice-mismatch'
			);
			expect(hoisted.mockHandleEscrowCreated).not.toHaveBeenCalled();
		},
		30_000
	);

	it(
		'publishes accept_unknown with rpc_unavailable when receipt verification cannot query getEscrow',
		async () => {
			const { escrow } = await loadEscrowModule();

			hoisted.currentContract.interface.parseLog = vi.fn(() => ({
				name: 'EscrowCreated',
				args: [
					'svc-escrow-rpc',
					'0x1111111111111111111111111111111111111111',
					'0x2222222222222222222222222222222222222222',
					BigInt('1000000000000000000')
				]
			}));
			hoisted.currentContract.getEscrow = vi
				.fn()
				.mockRejectedValue(new Error('RPC connection lost while loading escrow details'));

			const createEscrowMethod = vi.fn().mockResolvedValue({
				hash: '0xservice-verify-rpc',
				wait: vi.fn().mockResolvedValue({
					hash: '0xservice-verify-rpc',
					status: 1,
					gasUsed: BigInt(100000),
					logs: [{ topics: [], data: '0x' }]
				})
			}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
			(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
			hoisted.currentContract.createEscrow = createEscrowMethod;

			const result = await escrow.createEscrow(
				'0x2222222222222222222222222222222222222222',
				'1.0',
				1_700_000_000,
				1_700_003_600,
				2,
				2
			);

			expect(result.status).toBe('pending');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
				'0xservice-verify-rpc',
				'rpc_unavailable',
				'0xservice-verify-rpc'
			);
			expect(hoisted.mockHandleEscrowCreated).not.toHaveBeenCalled();
		},
		30_000
	);

	it(
		'publishes accept_unknown when confirmation times out',
		async () => {
		const { escrow } = await loadEscrowModule();

		const createEscrowMethod = vi.fn().mockResolvedValue({
			hash: '0xservice-timeout',
			wait: vi.fn().mockRejectedValue(new Error('Transaction wait timeout after 5 minutes'))
		}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
		(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
		hoisted.currentContract.createEscrow = createEscrowMethod;

		const result = await escrow.createEscrow(
			'0x2222222222222222222222222222222222222222',
			'1.0',
			1_700_000_000,
			1_700_003_600,
			2,
			2
		);

		expect(result.status).toBe('pending');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
			'0xservice-timeout',
			'pending_timeout'
		);
		expect(hoisted.mockCleanupPendingContractByTxHash).not.toHaveBeenCalledWith(
			'0xservice-timeout'
		);
		},
		30_000
	);

	it(
		'publishes accept_unknown and rekeys pending contracts when the wallet replaces the transaction',
		async () => {
		const { escrow } = await loadEscrowModule();

		const createEscrowMethod = vi.fn().mockResolvedValue({
			hash: '0xservice-original',
			wait: vi.fn().mockRejectedValue({
				code: 'TRANSACTION_REPLACED',
				cancelled: false,
				replacement: {
					hash: '0xservice-replacement'
				},
				receipt: {
					hash: '0xservice-replacement',
					status: 1,
					gasUsed: BigInt(100000),
					logs: []
				}
			})
		}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
		(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
		hoisted.currentContract.createEscrow = createEscrowMethod;

		const result = await escrow.createEscrow(
			'0x2222222222222222222222222222222222222222',
			'1.0',
			1_700_000_000,
			1_700_003_600,
			2,
			2
		);

		expect(result.status).toBe('pending');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
			'0xservice-original',
			'tx_replaced',
			'0xservice-replacement'
		);
		expect(hoisted.mockReplacePendingContractByTxHash).toHaveBeenCalledWith(
			'0xservice-original',
			'0xservice-replacement'
		);
		},
		30_000
	);

	it(
		'publishes accept_unknown with rpc_unavailable when confirmation cannot be verified due to RPC failure',
		async () => {
		const { escrow } = await loadEscrowModule();

		const createEscrowMethod = vi.fn().mockResolvedValue({
			hash: '0xservice-rpc',
			wait: vi.fn().mockRejectedValue(new Error('RPC connection lost while waiting for receipt'))
		}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
		(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
		hoisted.currentContract.createEscrow = createEscrowMethod;

		const result = await escrow.createEscrow(
			'0x2222222222222222222222222222222222222222',
			'1.0',
			1_700_000_000,
			1_700_003_600,
			2,
			2
		);

		expect(result.status).toBe('pending');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
			'0xservice-rpc',
			'rpc_unavailable'
		);
		expect(hoisted.mockCleanupPendingContractByTxHash).not.toHaveBeenCalledWith('0xservice-rpc');
		},
		30_000
	);

	it(
		'publishes accept_unknown with nonce_conflict when the wallet reports a nonce race after broadcast',
		async () => {
		const { escrow } = await loadEscrowModule();

		const createEscrowMethod = vi.fn().mockResolvedValue({
			hash: '0xservice-nonce',
			wait: vi.fn().mockRejectedValue(new Error('Nonce too low for replacement transaction'))
		}) as unknown as { estimateGas: ReturnType<typeof vi.fn>; };
		(createEscrowMethod as any).estimateGas = vi.fn().mockResolvedValue(BigInt(100000));
		hoisted.currentContract.createEscrow = createEscrowMethod;

		const result = await escrow.createEscrow(
			'0x2222222222222222222222222222222222222222',
			'1.0',
			1_700_000_000,
			1_700_003_600,
			2,
			2
		);

		expect(result.status).toBe('pending');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hoisted.mockPublishPendingServiceAcceptanceUnknownByTxHash).toHaveBeenCalledWith(
			'0xservice-nonce',
			'nonce_conflict'
		);
		expect(hoisted.mockCleanupPendingContractByTxHash).not.toHaveBeenCalledWith(
			'0xservice-nonce'
		);
		},
		30_000
	);

	it('downgrades a published funded accept when confirmations drop below the required threshold', async () => {
		const { reverifyPublishedServiceAcceptance } = await loadEscrowModule();

		hoisted.mockProvider.getTransactionReceipt = vi.fn().mockResolvedValue({
			confirmations: 1
		});

		await expect(
			reverifyPublishedServiceAcceptance({
				escrowId: 'svc-reverify-low-confirmations',
				transactionHash: '0xservice-low-confirmations',
				acceptanceSnapshot: {
					clientRskAddress: '0x1111111111111111111111111111111111111111',
					clientFeeTier: 2,
					freelancerRskAddress: '0x2222222222222222222222222222222222222222',
					freelancerFeeTier: 2,
					chainId: 31,
					contractAddress: '0x3333333333333333333333333333333333333333',
					conversionFormulaVersion: 'v1',
					conversionSnapshotId: 'snapshot-low-confirmations',
					btcUsdRateMicros: 100_000_000_000,
					sourceTimestamp: 1_763_000_000,
					requiredConfirmations: 3,
					finalityPolicyVersion: 'rsk_rootstock_default_v1',
					sats: '100000',
					weiAmount: '1000000000000000000',
					confirmationsAtVerification: 3,
					verificationRpc: 'rsk:testnet'
				}
			})
		).resolves.toEqual({
			status: 'downgraded',
			reasonCode: 'reconciliation_deferred'
		});
	});

	it('defers published funded accept revalidation when RPC verification fails', async () => {
		const { reverifyPublishedServiceAcceptance } = await loadEscrowModule();

		hoisted.mockProvider.getTransactionReceipt = vi.fn().mockRejectedValue(new Error('rpc offline'));

		await expect(
			reverifyPublishedServiceAcceptance({
				escrowId: 'svc-reverify-rpc',
				transactionHash: '0xservice-rpc',
				acceptanceSnapshot: {
					clientRskAddress: '0x1111111111111111111111111111111111111111',
					clientFeeTier: 2,
					freelancerRskAddress: '0x2222222222222222222222222222222222222222',
					freelancerFeeTier: 2,
					chainId: 31,
					contractAddress: '0x3333333333333333333333333333333333333333',
					conversionFormulaVersion: 'v1',
					conversionSnapshotId: 'snapshot-rpc',
					btcUsdRateMicros: 100_000_000_000,
					sourceTimestamp: 1_763_000_000,
					requiredConfirmations: 3,
					finalityPolicyVersion: 'rsk_rootstock_default_v1',
					sats: '100000',
					weiAmount: '1000000000000000000',
					confirmationsAtVerification: 3,
					verificationRpc: 'rsk:testnet'
				}
			})
		).resolves.toEqual({
			status: 'deferred',
			reasonCode: 'rpc_unavailable'
		});
	});
});
