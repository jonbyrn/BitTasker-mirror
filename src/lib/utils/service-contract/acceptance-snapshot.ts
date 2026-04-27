import { ethers } from 'ethers';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import { createServicePurchaseKey } from '$lib/utils/service-quote/accept';
import {
	SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION,
	SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS
} from '$lib/utils/service-contract/finality';

const WEI_PER_SAT = 10_000_000_000n;
const DEFAULT_CONVERSION_FORMULA_VERSION = 'v1' as const;

export interface ServiceAcceptanceSnapshotInput {
	clientRskAddress: string;
	clientFeeTier: 0 | 1 | 2;
	freelancerRskAddress: string;
	freelancerFeeTier: 0 | 1 | 2;
	chainId: number;
	contractAddress: string;
	purchaseMode: 'quote' | 'instant_buy';
	proposalId?: string;
	instantOrderId?: string;
	btcUsdRateMicros: number;
	weiAmount: string;
	sourceTimestamp?: number;
	confirmationsAtVerification: number;
	verificationRpc: string;
}

function normalizeAddress(address: string): string {
	if (!address || !ethers.isAddress(address)) {
		return '';
	}
	return ethers.getAddress(address.toLowerCase());
}

export function createServiceAcceptanceSnapshot(
	input: ServiceAcceptanceSnapshotInput
): ServiceAcceptanceSnapshot {
	const snapshotIdentifier =
		input.purchaseMode === 'quote' ? input.proposalId : input.instantOrderId;
	if (!snapshotIdentifier) {
		throw new Error('Service acceptance snapshot requires a stable purchase identifier.');
	}

	const weiAmount = BigInt(input.weiAmount);

	return {
		clientRskAddress: normalizeAddress(input.clientRskAddress),
		clientFeeTier: input.clientFeeTier,
		freelancerRskAddress: normalizeAddress(input.freelancerRskAddress),
		freelancerFeeTier: input.freelancerFeeTier,
		chainId: input.chainId,
		contractAddress: ethers.getAddress(input.contractAddress.toLowerCase()),
		conversionFormulaVersion: DEFAULT_CONVERSION_FORMULA_VERSION,
		conversionSnapshotId: createServicePurchaseKey(input.purchaseMode, snapshotIdentifier),
		btcUsdRateMicros: input.btcUsdRateMicros,
		sourceTimestamp: input.sourceTimestamp ?? Math.floor(Date.now() / 1000),
		sats: (weiAmount / WEI_PER_SAT).toString(),
		weiAmount: weiAmount.toString(),
		requiredConfirmations: SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS,
		finalityPolicyVersion: SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION,
		confirmationsAtVerification: input.confirmationsAtVerification,
		verificationRpc: input.verificationRpc
	};
}

export function getConfiguredRskChainId(): number {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	if (configuredNetwork === 'mainnet') {
		return 30;
	}
	if (configuredNetwork === 'regtest') {
		return 33;
	}
	return 31;
}

export function getConfiguredRskContractAddress(): string {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	const contractAddress =
		configuredNetwork === 'mainnet'
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

	if (!contractAddress) {
		throw new Error('RSK contract address is not configured for the current network.');
	}

	return contractAddress;
}

export function getConfiguredVerificationRpcLabel(): string {
	return `rsk:${import.meta.env.VITE_RSK_NETWORK || 'testnet'}`;
}
