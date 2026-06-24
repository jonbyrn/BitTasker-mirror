import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServicePurchaseKey } from '$lib/utils/service-quote/accept';
import {
	createServiceAcceptanceSnapshot,
	getConfiguredRskChainId,
	getConfiguredRskContractAddress,
	getConfiguredVerificationRpcLabel
} from '$lib/utils/service-contract/acceptance-snapshot';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('service acceptance snapshot', () => {
	it('builds a deterministic quote snapshot payload', () => {
		const snapshot = createServiceAcceptanceSnapshot({
			clientRskAddress: '0x3333333333333333333333333333333333333333',
			clientFeeTier: 1,
			freelancerRskAddress: '0x1111111111111111111111111111111111111111',
			freelancerFeeTier: 1,
			chainId: 31,
			contractAddress: '0x2222222222222222222222222222222222222222',
			purchaseMode: 'quote',
			proposalId: 'proposal-123',
			btcUsdRateMicros: 105_125_000_000,
			weiAmount: '1250000000000000',
			sourceTimestamp: 1_763_000_000,
			confirmationsAtVerification: 3,
			verificationRpc: 'rsk:testnet'
		});

		expect(snapshot).toEqual({
			clientRskAddress: '0x3333333333333333333333333333333333333333',
			clientFeeTier: 1,
			freelancerRskAddress: '0x1111111111111111111111111111111111111111',
			freelancerFeeTier: 1,
			chainId: 31,
			contractAddress: '0x2222222222222222222222222222222222222222',
			conversionFormulaVersion: 'v1',
			conversionSnapshotId: createServicePurchaseKey('quote', 'proposal-123'),
			btcUsdRateMicros: 105_125_000_000,
			sourceTimestamp: 1_763_000_000,
			requiredConfirmations: 3,
			finalityPolicyVersion: 'rsk_rootstock_default_v1',
			sats: '125000',
			weiAmount: '1250000000000000',
			confirmationsAtVerification: 3,
			verificationRpc: 'rsk:testnet'
		});
	});

	it('fails closed when the purchase identifier is missing', () => {
		expect(() =>
			createServiceAcceptanceSnapshot({
				clientRskAddress: '0x3333333333333333333333333333333333333333',
				clientFeeTier: 1,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				chainId: 31,
				contractAddress: '0x2222222222222222222222222222222222222222',
				purchaseMode: 'quote',
				btcUsdRateMicros: 105_125_000_000,
				weiAmount: '1250000000000000',
				confirmationsAtVerification: 0,
				verificationRpc: 'rsk:testnet'
			})
		).toThrow('Service acceptance snapshot requires a stable purchase identifier.');
	});

	it('derives chain and contract config from the active RSK network', () => {
		vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_MAINNET', '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

		expect(getConfiguredRskChainId()).toBe(30);
		expect(getConfiguredRskContractAddress()).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
		expect(getConfiguredVerificationRpcLabel()).toBe('rsk:mainnet');
	});

	it('fails closed when the configured contract address is missing', () => {
		vi.stubEnv('VITE_RSK_NETWORK', 'regtest');
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '');

		expect(getConfiguredRskChainId()).toBe(33);
		expect(() => getConfiguredRskContractAddress()).toThrow(
			'RSK contract address is not configured for the current network.'
		);
		expect(getConfiguredVerificationRpcLabel()).toBe('rsk:regtest');
	});
});
