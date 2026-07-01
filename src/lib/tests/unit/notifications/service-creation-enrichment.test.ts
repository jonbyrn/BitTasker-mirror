import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

const mockPublish = vi.fn(() => Promise.resolve());
const mockEnrich = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		signer: {
			user: vi.fn(() => Promise.resolve({ pubkey: 'client-pubkey' }))
		},
		subscribe: vi.fn(),
		fetchEvents: vi.fn(() => Promise.resolve(new Set()))
	}
}));

vi.mock('$lib/nostr/events/contract', () => {
	class MockNDKPaymentContract {
		publish = mockPublish;
		publishReplaceable = vi.fn(() => Promise.resolve());
		author: any = null;
		dTag = '';
		taskId = '';
		taskeePubkey = '';
		network = '';
		version = '';
		status = '';
		messageType = '';
		taskTitle = '';
		taskDescription = '';
		amount = '';
		currency = '';
		estimatedStartTime = 0;
		estimatedCompletionTime = 0;
		transactionHash = '';
		contractAddress = '';
		ndk: any = {};
		tags: string[][] = [];
		id = 'event-id-789';
		agreementSnapshot: any = undefined;

		constructor(_ndk?: any) {}

		static from = vi.fn(() =>
			Promise.resolve({
				publishReplaceable: vi.fn(() => Promise.resolve()),
				paymentId: '',
				status: ''
			})
		);
	}
	return { NDKPaymentContract: MockNDKPaymentContract };
});

vi.mock('$lib/utils/contract/v2/blockchainWrites', () => ({
	createPaymentContract: vi.fn(() =>
		Promise.resolve({ tx: { hash: '0xabc123' }, estimatedCostFormatted: '0.001' })
	),
	estimateWrite: vi.fn(() =>
		Promise.resolve({
			success: true,
			estimatedGas: 100000n,
			estimatedCostWei: 1000000n,
			estimatedCostFormatted: '0.001'
		})
	)
}));

vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: vi.fn(() => '0x10169472537Cc354D9E24Aebe221aF15827e6378')
}));

vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: {
		enrich: (...args: unknown[]) => mockEnrich(...args)
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/utils/contract/parallelEffects', () => ({
	runParallelNamed: vi.fn((tasks: unknown[]) => {
		const failures: unknown[] = [];
		return Promise.resolve({ failures });
	})
}));

vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: { 1: { percentage: 250 } },
	normalizeRskAddress: (addr: string) => addr
}));

import { createServiceContract } from '$lib/utils/contract/v2/service-creation';
import { NDKPaymentContract } from '$lib/nostr/events/contract';

function makeInput() {
	return {
		freelancerPubkey: 'freelancer-pubkey',
		freelancerAddress: '0x64bF4B77D21E1849C42165f8558D681857933994',
		amountRbtc: '0.001',
		estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
		serviceId: 'service-123',
		serviceAddress: 'service-addr',
		serviceTitle: 'Brand Identity Sprint',
		serviceDescription: 'Logo and palette package.',
		contextVersionRef: 'evt-1',
		purchaseMode: 'instant_buy' as const,
		instantOrderId: 'order-1',
		pricingSnapshot: { serviceVersionRef: 'evt-1' }
	};
}

describe('createServiceContract enrichment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('afterConfirmed calls enrichment with contract_created action', async () => {
		const result = await createServiceContract(makeInput());
		if (!result.success) throw new Error(result.error);

		const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
		const iface = new ethers.Interface([
			'event PaymentContractCreated(uint32 indexed paymentContractId)'
		]);
		const eventFragment = iface.getEvent('PaymentContractCreated')!;
		const encodedData = iface.encodeEventLog(eventFragment, [99]);

		const receipt = {
			status: 1,
			logs: [
				{ address: contractAddress, topics: encodedData.topics as string[], data: encodedData.data }
			]
		} as any;

		await result.afterConfirmed(receipt);

		expect(mockEnrich).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'contract_created',
				escrowId: '99'
			})
		);
	});

	it('afterConfirmed enrichment includes taskTitle from serviceTitle', async () => {
		const result = await createServiceContract(makeInput());
		if (!result.success) throw new Error(result.error);

		const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
		const iface = new ethers.Interface([
			'event PaymentContractCreated(uint32 indexed paymentContractId)'
		]);
		const eventFragment = iface.getEvent('PaymentContractCreated')!;
		const encodedData = iface.encodeEventLog(eventFragment, [99]);

		const receipt = {
			status: 1,
			logs: [
				{ address: contractAddress, topics: encodedData.topics as string[], data: encodedData.data }
			]
		} as any;

		await result.afterConfirmed(receipt);

		expect(mockEnrich).toHaveBeenCalledWith(
			expect.objectContaining({
				taskTitle: 'Brand Identity Sprint'
			})
		);
	});

	it('afterConfirmed enrichment includes estimatedStartTime', async () => {
		const input = makeInput();
		const result = await createServiceContract(input);
		if (!result.success) throw new Error(result.error);

		const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
		const iface = new ethers.Interface([
			'event PaymentContractCreated(uint32 indexed paymentContractId)'
		]);
		const eventFragment = iface.getEvent('PaymentContractCreated')!;
		const encodedData = iface.encodeEventLog(eventFragment, [99]);

		const receipt = {
			status: 1,
			logs: [
				{ address: contractAddress, topics: encodedData.topics as string[], data: encodedData.data }
			]
		} as any;

		await result.afterConfirmed(receipt);

		expect(mockEnrich).toHaveBeenCalledWith(
			expect.objectContaining({
				estimatedStartTime: expect.any(Number)
			})
		);
	});

	it('afterConfirmed enrichment includes amount', async () => {
		const result = await createServiceContract(makeInput());
		if (!result.success) throw new Error(result.error);

		const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
		const iface = new ethers.Interface([
			'event PaymentContractCreated(uint32 indexed paymentContractId)'
		]);
		const eventFragment = iface.getEvent('PaymentContractCreated')!;
		const encodedData = iface.encodeEventLog(eventFragment, [99]);

		const receipt = {
			status: 1,
			logs: [
				{ address: contractAddress, topics: encodedData.topics as string[], data: encodedData.data }
			]
		} as any;

		await result.afterConfirmed(receipt);

		expect(mockEnrich).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: expect.any(String)
			})
		);
	});
});
