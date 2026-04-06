import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';

const getCurrentPrice = vi.fn();
const createEscrow = vi.fn();
const registerPendingContractByTxHash = vi.fn();
const cleanupPendingContractByTxHash = vi.fn();
const preflightServiceContractCreation = vi.fn();
const createServiceAcceptanceSnapshot = vi.fn((input: Record<string, unknown>) => ({
	clientRskAddress: input.clientRskAddress,
	clientFeeTier: input.clientFeeTier,
	freelancerRskAddress: input.freelancerRskAddress,
	freelancerFeeTier: input.freelancerFeeTier,
	chainId: 31,
	contractAddress: '0x4444444444444444444444444444444444444444',
	conversionFormulaVersion: 'v1',
	conversionSnapshotId: 'snapshot-create-test',
	btcUsdRateMicros: input.btcUsdRateMicros,
	sourceTimestamp: 1_763_000_000,
	requiredConfirmations: 3,
	finalityPolicyVersion: 'rsk_rootstock_default_v1',
	sats: '125000',
	weiAmount: input.weiAmount,
	confirmationsAtVerification: input.confirmationsAtVerification,
	verificationRpc: 'rsk:testnet'
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: unknown[]) => getCurrentPrice(...args)
	}
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		escrowOps: {
			createEscrow: (...args: unknown[]) => createEscrow(...args)
		},
		eventOps: {
			registerPendingContractByTxHash: (...args: unknown[]) =>
				registerPendingContractByTxHash(...args),
			cleanupPendingContractByTxHash: (...args: unknown[]) =>
				cleanupPendingContractByTxHash(...args)
		}
	}
}));

vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: (error: unknown) => ({
		userMessage: error instanceof Error ? error.message : 'unknown error',
		technicalMessage: error instanceof Error ? error.message : 'unknown error'
	})
}));

vi.mock('$lib/utils/service-contract/preflight', () => ({
	preflightServiceContractCreation: (...args: unknown[]) =>
		preflightServiceContractCreation(...args)
}));

vi.mock('$lib/utils/service-contract/acceptance-snapshot', () => ({
	createServiceAcceptanceSnapshot: (...args: unknown[]) => createServiceAcceptanceSnapshot(...args),
	getConfiguredRskChainId: () => 31,
	getConfiguredRskContractAddress: () => '0x4444444444444444444444444444444444444444',
	getConfiguredVerificationRpcLabel: () => 'rsk:testnet'
}));

describe('service contract creation', () => {
	const buyerWalletAddress = '0xAbCdEf1234567890aBCdef1234567890AbCdEf12';
	const buyerWalletAddressLowercase = buyerWalletAddress.toLowerCase();

	beforeEach(() => {
		vi.clearAllMocks();
		getCurrentPrice.mockResolvedValue(100000);
		preflightServiceContractCreation.mockResolvedValue({
			ok: true,
			amount: '0.00125000',
			gasCost: '0.00001000',
			totalRequired: '0.00126000',
			walletAddress: buyerWalletAddress
		});
		createEscrow.mockResolvedValue({
			hash: '0xservicehash',
			status: 'pending'
		});
	});

	it('converts USD amounts to RBTC deterministically', async () => {
		const { convertUsdAmountToRbtc } = await import('$lib/utils/service-contract/create');

		expect(convertUsdAmountToRbtc('125.00', 100000)).toBe('0.00125000');
		expect(() => convertUsdAmountToRbtc('0', 100000)).toThrow(
			'Invalid service amount. Expected a positive USD value.'
		);
		expect(() => convertUsdAmountToRbtc('125.00', 0)).toThrow(
			'Unable to determine the current BTC price.'
		);
	});

	it('creates escrow and registers a pending service contract snapshot', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');

		const result = await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			serviceDescription: 'A polished logo package',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678',
			proposalEventId: 'proposal-event-id',
			selectedTierId: 'standard',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1',
				tierId: 'standard'
			},
			agreementSnapshot: {
				selectedTierId: 'standard',
				deliverables: 'Migration plus redirect validation.'
			},
			freelancerFeeTier: 1
		});

		expect(result).toEqual({
			success: true,
			state: 'funding_submitted',
			transactionHash: '0xservicehash',
			amount: '0.00125000',
			clientRskAddress: buyerWalletAddressLowercase,
			acceptanceSnapshot: expect.objectContaining({
				clientRskAddress: buyerWalletAddressLowercase,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				confirmationsAtVerification: 0,
				weiAmount: '1250000000000000'
			})
		});
		expect(getCurrentPrice).toHaveBeenCalledWith('BTC');
		expect(preflightServiceContractCreation).toHaveBeenCalledWith(
			expect.objectContaining({
				freelancerAddress: '0x1111111111111111111111111111111111111111',
				freelancerPubkey: 'f'.repeat(64),
				amountUsdt: '125.00'
			}),
			100000
		);
		expect(createEscrow).toHaveBeenCalledWith(
			'0x1111111111111111111111111111111111111111',
			'0.00125000',
			1_800_000_000,
			1_800_259_200,
			1,
			1
		);
		expect(registerPendingContractByTxHash).toHaveBeenCalledWith(
			expect.objectContaining({
				bidEventId: 'proposal-event-id',
				transactionHash: '0xservicehash',
				contextType: 'service',
				clientRskAddress: buyerWalletAddressLowercase,
				purchaseMode: 'quote',
				proposalId: 'pr_12345678',
				acceptanceSnapshot: expect.objectContaining({
					clientRskAddress: buyerWalletAddressLowercase,
					clientFeeTier: 1,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1,
					btcUsdRateMicros: 100000000000,
					sats: '125000',
					weiAmount: '1250000000000000',
					requiredConfirmations: 3,
					confirmationsAtVerification: 0,
					sourceTimestamp: expect.any(Number),
					conversionSnapshotId: expect.any(String),
					verificationRpc: expect.any(String)
				})
			})
		);
		expect(createServiceAcceptanceSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				clientRskAddress: buyerWalletAddressLowercase
			})
		);
	});

	it('cleans up pending contract state when escrow creation throws after a tx hash exists', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		createEscrow.mockRejectedValueOnce(new Error('wallet rejected'));

		const result = await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(result).toEqual({
			success: false,
			state: 'funding_failed',
			error: 'wallet rejected'
		});
		expect(registerPendingContractByTxHash).not.toHaveBeenCalled();
		expect(cleanupPendingContractByTxHash).not.toHaveBeenCalled();
	});

	it('fails closed when escrow creation does not return a transaction hash', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		createEscrow.mockResolvedValueOnce({
			status: 'pending'
		});

		const result = await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(result).toEqual({
			success: false,
			state: 'funding_failed',
			error: 'Transaction failed: Missing transaction hash. Please try again.'
		});
	});

	it('fails closed when preflight rejects the transaction before submission', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		preflightServiceContractCreation.mockResolvedValueOnce({
			ok: false,
			errorCode: 'insufficient_funds',
			error: 'Insufficient RBTC balance.'
		});

		const result = await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(result).toEqual({
			success: false,
			state: 'preflight_failed',
			error: 'Insufficient RBTC balance.',
			errorCode: 'insufficient_funds'
		});
		expect(createEscrow).not.toHaveBeenCalled();
		expect(registerPendingContractByTxHash).not.toHaveBeenCalled();
	});

	it('adjusts past start times forward before preflight and escrow creation', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		const nowSeconds = Math.floor(Date.now() / 1000);
		const originalStartTime = nowSeconds - 7200;
		const originalCompletionTime = originalStartTime + 172800;
		const normalizedSchedule = normalizeServiceContractSchedule(
			originalStartTime,
			originalCompletionTime,
			nowSeconds
		);

		await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: originalStartTime,
			estimatedCompletionTime: originalCompletionTime,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(preflightServiceContractCreation).toHaveBeenCalledWith(
			expect.objectContaining({
				estimatedStartTime: normalizedSchedule.estimatedStartTime,
				estimatedCompletionTime: normalizedSchedule.estimatedCompletionTime
			}),
			100000
		);
		expect(createEscrow).toHaveBeenCalledWith(
			'0x1111111111111111111111111111111111111111',
			'0.00125000',
			normalizedSchedule.estimatedStartTime,
			normalizedSchedule.estimatedCompletionTime,
			1,
			1
		);
		expect(registerPendingContractByTxHash).toHaveBeenCalledWith(
			expect.objectContaining({
				estimatedStartTime: normalizedSchedule.estimatedStartTime,
				estimatedCompletionTime: normalizedSchedule.estimatedCompletionTime
			})
		);
	});

	it('keeps the funding submission recoverable when pending-contract registration fails', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		registerPendingContractByTxHash.mockImplementationOnce(() => {
			throw new Error('register failed');
		});

		const result = await createServiceContract({
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote',
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(result).toEqual({
			success: true,
			state: 'funding_submitted',
			transactionHash: '0xservicehash',
			amount: '0.00125000',
			clientRskAddress: buyerWalletAddressLowercase,
			acceptanceSnapshot: expect.objectContaining({
				clientRskAddress: buyerWalletAddressLowercase,
				weiAmount: '1250000000000000'
			})
		});
		expect(cleanupPendingContractByTxHash).not.toHaveBeenCalled();
	});
});
