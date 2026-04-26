/**
 * v2 Contract Utilities
 *
 * Common utility functions for v2 contract operations:
 * - Wallet and contract readiness checks
 * - Fee calculations
 * - Network configuration helpers
 *
 * These utilities replace the equivalent functions from escrow/v1/escrow.ts
 * and provide a clean, v2-native implementation.
 */

import { ethers, type JsonRpcProvider } from 'ethers';
import { FEE_TIERS, type FeeTier } from '@bittasker/wallet-core';
import { createDebug } from '$lib/utils/debug';
import {
	getWallet as walletFromStore,
	getProvider as providerFromStore,
	walletManager
} from '$lib/stores/wallet.store';
import { getSecurePaymentContractAddress } from './contractAddress';
import abi from './abi.json';
import type { ContractChain, InitializedContract } from '../types';

const d = createDebug('contract:v2:utils');

/**
 * Check if a JsonRpcProvider instance has been destroyed.
 */
function isProviderDestroyed(provider: JsonRpcProvider): boolean {
	const p = provider as JsonRpcProvider & { destroyed?: boolean; _destroyed?: boolean };
	return p._destroyed === true || p.destroyed === true;
}

/**
 * Get the expected chain ID for the configured RSK network.
 */
export function getExpectedRskChainId(): bigint {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	if (configuredNetwork === 'mainnet') return 30n;
	if (configuredNetwork === 'regtest') return 33n;
	return 31n;
}

/**
 * Get a human-readable network label.
 */
export function getExpectedRskNetworkLabel(): string {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	if (configuredNetwork === 'mainnet') return 'Rootstock Mainnet';
	if (configuredNetwork === 'regtest') return 'Rootstock Regtest';
	return 'Rootstock Testnet';
}

/**
 * Calculate the fee amount for a given base amount and fee tier.
 * Fee tiers: 0 = 0%, 1 = 2.5%, 2 = 5%
 */
export function calculateFeeAmount(baseAmount: bigint, feeTier: FeeTier): bigint {
	const tierConfig = FEE_TIERS[feeTier];
	if (!tierConfig) {
		throw new Error(`Invalid fee tier: ${feeTier}`);
	}
	return (baseAmount * BigInt(tierConfig.percentage)) / 10000n;
}

/**
 * Calculate the total payment amount including the client fee.
 * This is what the tasker needs to send (base amount + client fee).
 */
export function calculateTotalPayment(baseAmount: bigint, clientFeeTier: FeeTier): bigint {
	const clientFee = calculateFeeAmount(baseAmount, clientFeeTier);
	return baseAmount + clientFee;
}

/**
 * Format an RBTC amount to a fixed number of decimal places.
 */
export function formatRbtcAmount(value: bigint, decimals = 6): string {
	return Number.parseFloat(ethers.formatEther(value)).toFixed(decimals);
}

export interface ContractReadyResult {
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
}

export interface ContractNotReadyResult {
	error: string;
	errorCode:
		| 'wallet_not_connected'
		| 'wallet_not_ready'
		| 'provider_not_ready'
		| 'wrong_network'
		| 'insufficient_funds'
		| 'contract_error';
}

export type EnsureContractReadyResult =
	| { ok: true; result: ContractReadyResult }
	| { ok: false } & ContractNotReadyResult;

/**
 * Ensure wallet, provider, and v2 contract are ready for operations.
 *
 * This is the v2 equivalent of ensureEscrowReady from escrow/v1/escrow.ts.
 * It performs all necessary checks and returns a ready-to-use contract instance.
 *
 * @param requireBalance - Whether to verify the wallet has a non-zero balance (default: true for write operations)
 * @param chain - The blockchain to connect to (default: 'rsk')
 */
export async function ensureContractReady(
	requireBalance = true,
	chain: ContractChain = 'rsk'
): Promise<EnsureContractReadyResult> {
	let wallet = walletFromStore(chain);
	if (!wallet) {
		try {
			d.log('ensureContractReady: wallet not found, initializing');
			await walletManager.initialize();
			wallet = walletFromStore(chain);
		} catch (error) {
			d.error('ensureContractReady: wallet initialization failed', error);
			return {
				ok: false,
				error: 'Connect your wallet before continuing.',
				errorCode: 'wallet_not_connected'
			};
		}
	}

	if (!wallet || !wallet.address) {
		return {
			ok: false,
			error: 'Your wallet is not ready yet. Retry after it finishes connecting.',
			errorCode: 'wallet_not_ready'
		};
	}

	let provider = providerFromStore(chain);
	if (!provider || isProviderDestroyed(provider)) {
		try {
			d.log('ensureContractReady: provider not found or destroyed, initializing');
			await walletManager.initialize();
			provider = providerFromStore(chain);
		} catch (error) {
			d.error('ensureContractReady: provider initialization failed', error);
		}
	}

	if (!provider || isProviderDestroyed(provider)) {
		return {
			ok: false,
			error: 'Network provider is not available. Please try again.',
			errorCode: 'provider_not_ready'
		};
	}

	// Verify network
	try {
		const network = await provider.getNetwork();
		const expectedChainId = getExpectedRskChainId();
		if (network.chainId !== expectedChainId) {
			return {
				ok: false,
				error: `Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`,
				errorCode: 'wrong_network'
			};
		}
	} catch (error) {
		d.error('ensureContractReady: network check failed', error);
		return {
			ok: false,
			error: 'Could not verify network. Please check your connection.',
			errorCode: 'provider_not_ready'
		};
	}

	// Check balance if required
	if (requireBalance) {
		try {
			const balance = await provider.getBalance(wallet.address);
			if (balance === 0n) {
				return {
					ok: false,
					error: 'Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.',
					errorCode: 'insufficient_funds'
				};
			}
		} catch (error) {
			d.error('ensureContractReady: balance check failed', error);
			return {
				ok: false,
				error: 'Could not check wallet balance. Please try again.',
				errorCode: 'provider_not_ready'
			};
		}
	}

	// Initialize the v2 contract
	try {
		const contractAddress = getSecurePaymentContractAddress();
		const checksummed = ethers.getAddress(contractAddress.toLowerCase());
		const contract = new ethers.Contract(checksummed, abi as ethers.InterfaceAbi, wallet);

		d.log('ensureContractReady: ready', { chain, contractAddress: checksummed });

		return {
			ok: true,
			result: {
				contract,
				wallet,
				provider
			}
		};
	} catch (error) {
		d.error('ensureContractReady: contract initialization failed', error);
		return {
			ok: false,
			error: 'Could not connect to the payment contract. Please try again.',
			errorCode: 'contract_error'
		};
	}
}

/**
 * Check if the wallet has sufficient balance for a transaction.
 *
 * @param totalRequired - Total amount required in wei
 * @param walletAddress - The wallet address to check
 * @param provider - The provider to use for the balance check
 */
export async function checkSufficientBalance(
	totalRequired: bigint,
	walletAddress: string,
	provider: ethers.JsonRpcProvider
): Promise<{
	hasSufficientFunds: boolean;
	balance: bigint;
	shortfall: bigint;
}> {
	const balance = await provider.getBalance(walletAddress);
	const hasSufficientFunds = balance >= totalRequired;
	const shortfall = hasSufficientFunds ? 0n : totalRequired - balance;

	return {
		hasSufficientFunds,
		balance,
		shortfall
	};
}
