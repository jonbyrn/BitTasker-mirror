import { ethers } from 'ethers';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import { createServicePurchaseKey } from '$lib/utils/service-quote/accept';
import {
	SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION,
	SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS
} from '$lib/utils/service-contract/finality';

const DEFAULT_CONVERSION_FORMULA_VERSION = 'v1' as const;

// Constants for sats calculation (formula v1)
// 10^8 sats per BTC
const SATS_PER_BTC = 100_000_000n;
// 10^18 wei per BTC
const WEI_PER_BTC = 10n ** 18n;

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

export function createServiceAcceptanceSnapshot(
	input: ServiceAcceptanceSnapshotInput
): ServiceAcceptanceSnapshot {
	const snapshotIdentifier =
		input.purchaseMode === 'quote' ? input.proposalId : input.instantOrderId;
	if (!snapshotIdentifier) {
		throw new Error('Service acceptance snapshot requires a stable purchase identifier.');
	}

	const weiAmount = BigInt(input.weiAmount);
	const btcUsdRateMicros = BigInt(input.btcUsdRateMicros);

	// Guard against division by zero
	if (btcUsdRateMicros <= 0n) {
		throw new Error('Invalid BTC price: btcUsdRateMicros must be positive');
	}

	/**
	 * Calculate sats using the v1 formula:
	 * 1. usdMicros = (weiAmount * btcUsdRateMicros) / 10^18
	 *    - Converts wei to RBTC (weiAmount / 10^18), then to USD micros
	 * 2. satsNumerator = usdMicros * 10^8
	 *    - Convert USD micros to sats numerator (multiplying by 10^8 sats per BTC)
	 * 3. sats = floor((satsNumerator + floor(btcUsdRateMicros / 2)) / btcUsdRateMicros)
	 *    - Divide by rate with rounding for proper floor division
	 *
	 * This ensures the sats value is correctly derived from the USD amount,
	 * using the BTC/USD rate that was used to convert USD to RBTC.
	 */
	const usdMicros = (weiAmount * btcUsdRateMicros) / WEI_PER_BTC;
	const satsNumerator = usdMicros * SATS_PER_BTC;
	const sats = (satsNumerator + btcUsdRateMicros / 2n) / btcUsdRateMicros;

	return {
		clientRskAddress: ethers.getAddress(input.clientRskAddress.toLowerCase()),
		clientFeeTier: input.clientFeeTier,
		freelancerRskAddress: ethers.getAddress(input.freelancerRskAddress.toLowerCase()),
		freelancerFeeTier: input.freelancerFeeTier,
		chainId: input.chainId,
		contractAddress: ethers.getAddress(input.contractAddress.toLowerCase()),
		conversionFormulaVersion: DEFAULT_CONVERSION_FORMULA_VERSION,
		conversionSnapshotId: createServicePurchaseKey(input.purchaseMode, snapshotIdentifier),
		btcUsdRateMicros: input.btcUsdRateMicros,
		sourceTimestamp: input.sourceTimestamp ?? Math.floor(Date.now() / 1000),
		sats: sats.toString(),
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
