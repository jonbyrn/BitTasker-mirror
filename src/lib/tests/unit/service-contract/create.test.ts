import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';

const getCurrentPrice = vi.fn();
const createServiceContractV2 = vi.fn();
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

vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: (error: unknown) => ({
		userMessage: error instanceof Error ? error.message : 'unknown error',
		technicalMessage: error instanceof Error ? error.message : 'unknown error'
	})
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: (fn: unknown) => {
			(fn as (v: unknown) => void)({ rsk: { address: '0x123' } });
			return () => {};
		}
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('$lib/utils/contract/v2/service-creation', () => ({
	createServiceContract: (...args: unknown[]) => createServiceContractV2(...args)
}));

vi.mock('$lib/utils/service-contract/acceptance-snapshot', () => ({
	createServiceAcceptanceSnapshot: (...args: unknown[]) =>
		createServiceAcceptanceSnapshot(...(args as unknown as [Record<string, unknown>])),
	getConfiguredRskChainId: () => 31,
	getConfiguredRskContractAddress: () => '0x4444444444444444444444444444444444444444',
	getConfiguredVerificationRpcLabel: () => 'rsk:testnet'
}));

describe('service contract creation', () => {
	const buyerWalletAddress = '0xAbCdEf1234567890aBCdef1234567890AbCdEf12';
	const buyerWalletAddressLowercase = buyerWalletAddress.toLowerCase();

	const mockTx = { hash: '0xservicehash' };

	function defaultV2Success() {
		createServiceContractV2.mockResolvedValue({
			success: true,
			transactionHash: mockTx.hash,
			estimatedCostFormatted: '0.00001000',
			tx: mockTx,
			afterBroadcast: Promise.resolve({ failures: [] as { name: string; error: unknown }[] }),
			afterConfirmed: async () => ({ paymentId: 1 })
		});
	}

	function minimalCreateInput() {
		return {
			freelancerPubkey: 'f'.repeat(64),
			freelancerAddress: '0x1111111111111111111111111111111111111111',
			amountUsdt: '125.00',
			estimatedStartTime: 1_800_000_000,
			estimatedCompletionTime: 1_800_259_200,
			serviceId: `30402:${'a'.repeat(64)}:service-1234`,
			serviceAddress: `30402:${'a'.repeat(64)}:service-1234`,
			serviceTitle: 'Logo refresh',
			contextVersionRef: 'service-event-1',
			purchaseMode: 'quote' as const,
			clientRskAddress: buyerWalletAddress,
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		getCurrentPrice.mockResolvedValue(100000);
		defaultV2Success();
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
	}, 10000);

	it('delegates to v2 creation and returns transaction hash, amount, and acceptance snapshot', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');

		const result = await createServiceContract({
			...minimalCreateInput(),
			serviceDescription: 'A polished logo package',
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678',
			proposalEventId: 'proposal-event-id',
			selectedTierId: 'standard',
			agreementSnapshot: {
				selectedTierId: 'standard',
				deliverables: 'Migration plus redirect validation.'
			},
			freelancerFeeTier: 1
		});

		expect(result).toEqual(
			expect.objectContaining({
				success: true,
				transactionHash: '0xservicehash',
				amount: '0.00125000',
				clientRskAddress: buyerWalletAddressLowercase
			})
		);
		if (!result.success) {
			throw new Error('expected success');
		}
		expect(result.acceptanceSnapshot).toEqual(
			expect.objectContaining({
				clientRskAddress: buyerWalletAddressLowercase,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				confirmationsAtVerification: 0,
				weiAmount: '1250000000000000'
			})
		);

		expect(getCurrentPrice).toHaveBeenCalledWith('BTC');
		expect(createServiceContractV2).toHaveBeenCalledWith(
			expect.objectContaining({
				freelancerAddress: '0x1111111111111111111111111111111111111111',
				freelancerPubkey: 'f'.repeat(64),
				amountRbtc: '0.00125000',
				quoteRequestId: 'qr_12345678',
				proposalId: 'pr_12345678',
				proposalEventId: 'proposal-event-id',
				selectedTierId: 'standard',
				purchaseMode: 'quote'
			})
		);
		expect(createServiceAcceptanceSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				clientRskAddress: buyerWalletAddressLowercase
			})
		);
	});

	it('returns v2 failure errors without wrapping', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		createServiceContractV2.mockResolvedValueOnce({
			success: false,
			error: 'NDK signer not set. Please sign in.'
		});

		const result = await createServiceContract(minimalCreateInput());

		expect(result).toEqual({
			success: false,
			error: 'NDK signer not set. Please sign in.'
		});
	});

	it('maps unexpected errors through extractContractError', async () => {
		const { createServiceContract } = await import('$lib/utils/service-contract/create');
		createServiceContractV2.mockRejectedValueOnce(new Error('network flake'));

		const result = await createServiceContract(minimalCreateInput());

		expect(result).toEqual({
			success: false,
			error: 'network flake'
		});
	});

	it('passes schedule-normalized times into v2 input', async () => {
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
			...minimalCreateInput(),
			estimatedStartTime: originalStartTime,
			estimatedCompletionTime: originalCompletionTime
		});

		expect(createServiceContractV2).toHaveBeenCalledWith(
			expect.objectContaining({
				estimatedStartTime: normalizedSchedule.estimatedStartTime,
				estimatedCompletionTime: normalizedSchedule.estimatedCompletionTime
			})
		);
	});

	describe('normalizePlainRskAddress', () => {
		it('normalizes a valid address to lowercase checksum format', async () => {
			const { normalizePlainRskAddress } = await import('$lib/utils/service-contract/create');

			const result = normalizePlainRskAddress('0xAbCdEf1234567890aBCdef1234567890AbCdEf12');
			expect(result).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
		});

		it('throws on malformed address', async () => {
			const { normalizePlainRskAddress } = await import('$lib/utils/service-contract/create');

			expect(() => normalizePlainRskAddress('not-an-address')).toThrow();
			expect(() => normalizePlainRskAddress('0x123')).toThrow();
			expect(() => normalizePlainRskAddress('')).toThrow();
		});

		it('normalizes mixed case addresses correctly', async () => {
			const { normalizePlainRskAddress } = await import('$lib/utils/service-contract/create');

			const mixedCase = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
			const result = normalizePlainRskAddress(mixedCase);
			expect(result).toBe('0x742d35cc6634c0532925a3b844bc454e4438f44e');
		});
	});
});
