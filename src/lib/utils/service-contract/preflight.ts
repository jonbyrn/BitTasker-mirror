/**
 * @deprecated This module performs pre-creation validation for service contracts.
 *
 * In v2, this pattern is NOT used for tasks. Instead:
 * - BidAcceptanceFormV2 checks balance in the UI directly
 * - createContract() returns errors via the result object
 * - Gas estimation is done via estimateGasForCreatePaymentContract()
 *
 * Services should follow the same pattern:
 * - Check balance in UI before calling createServiceContract()
 * - Handle errors from the result object
 * - Use estimateGasForServiceContract() for gas estimation
 *
 * This file will be removed once all service UIs are updated.
 */

import { appStore } from '$lib/stores/app.store';
import { walletManager, walletStore } from '$lib/stores/wallet.store';
import { initContract } from '$lib/utils/contract';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import { ethers } from 'ethers';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';
import { FEE_TIERS } from '@bittasker/wallet-core';
import abi from '$lib/utils/contract/v2/abi.json';

const DEFAULT_CLIENT_FEE_TIER = 1;
const ESTIMATED_NETWORK_FEE_USD = 0.5;

export { DEFAULT_CLIENT_FEE_TIER, ESTIMATED_NETWORK_FEE_USD };

/**
 * Get the centralized pool instance from appStore
 */
function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('NDK pool is not initialized');
	}
	return pool;
}

/**
 * Check if any relay is reachable by querying it with a simple filter
 * Returns true if ANY relay responds, false otherwise
 */
async function checkRelayConnectivity(relays: string[]): Promise<boolean> {
	console.log('[preflight] ACTION: checkRelayConnectivity', { relayCount: relays.length, relays });
	const pool = getPool();
	for (const relay of relays) {
		try {
			const timeout = setTimeout(() => {}, 3000);
			const events = await pool.querySync([relay], { kinds: [0], limit: 1 }, { maxWait: 3000 });
			clearTimeout(timeout);
			if (events) {
				console.log('[preflight] RESULT: relay connected', { relay });
				return true;
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				console.log('[preflight] ERROR: relay timeout', { relay });
			} else {
				console.log('[preflight] ERROR: relay failed', {
					relay,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
	}
	console.log('[preflight] RESULT: no relays available', { triedRelays: relays.length });
	return false;
}

export type ServiceContractPreflightErrorCode =
	| 'wallet_not_connected'
	| 'wallet_not_ready'
	| 'wrong_network'
	| 'invalid_provider_wallet'
	| 'invalid_provider_pubkey'
	| 'invalid_service_amount'
	| 'invalid_fee_tier'
	| 'price_unavailable'
	| 'insufficient_funds'
	| 'relay_unavailable'
	| 'nostr_not_ready'
	| 'invalid_schedule'
	| 'preflight_failed';

export interface ServiceContractPreflightInput {
	freelancerAddress: string;
	freelancerPubkey: string;
	amountUsdt: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	freelancerFeeTier?: 1 | 2 | 3;
}

export interface ServiceContractPreflightSuccess {
	ok: true;
	amount: string;
	gasCost: string;
	totalRequired: string;
	walletAddress: string;
}

export interface ServiceContractPreflightFailure {
	ok: false;
	errorCode: ServiceContractPreflightErrorCode;
	error: string;
	totalRequired?: string;
	shortfallSats?: number;
	shortfallUsd?: number;
}

export type ServiceContractPreflightResult =
	| ServiceContractPreflightSuccess
	| ServiceContractPreflightFailure;

function fail(
	errorCode: ServiceContractPreflightErrorCode,
	error: string
): ServiceContractPreflightFailure {
	return {
		ok: false,
		errorCode,
		error
	};
}

function convertUsdAmountToRbtc(amountUsdt: string, btcPrice: number): string {
	const parsedAmount = Number(amountUsdt);
	if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
		throw new Error('Invalid service amount. Expected a positive USD value.');
	}

	if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
		throw new Error('Unable to determine the current BTC price.');
	}

	return (parsedAmount / btcPrice).toFixed(8);
}

function calculateTotalPayment(baseAmountWei: bigint, feeTier: number): bigint {
	const feePercentage = FEE_TIERS[feeTier as keyof typeof FEE_TIERS]?.percentage ?? 250;
	const feeWei = (baseAmountWei * BigInt(feePercentage)) / 10000n;
	return baseAmountWei + feeWei;
}

function getExpectedRskChainId(): bigint {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return network === 'mainnet' ? 30n : 31n;
}

function getExpectedRskNetworkLabel(): string {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return network === 'mainnet' ? 'RSK Mainnet' : 'RSK Testnet';
}

async function ensureServiceWalletReady(): Promise<
	ServiceContractPreflightFailure | { walletAddress: string }
> {
	let walletState = get(walletStore);

	// If wallet is already ready, return immediately
	if (walletState.rsk?.address && walletState.rsk?.wallet && walletState.rsk?.provider) {
		return {
			walletAddress: walletState.rsk.address
		};
	}

	// Start initialization if not already in progress
	let needsToWait = false;
	if (!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
		try {
			// If initialization is already in progress, this returns early
			// If not, it starts initialization
			await walletManager.initialize({ prompt: 'funding' });

			// Check if initialization completed synchronously
			walletState = get(walletStore);
			needsToWait =
				!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider;
		} catch {
			return fail('wallet_not_connected', 'Connect your wallet before continuing.');
		}
	}

	// If wallet is ready after initialize(), return
	if (walletState.rsk?.address && walletState.rsk?.wallet && walletState.rsk?.provider) {
		return {
			walletAddress: walletState.rsk.address
		};
	}

	// If initialization is still in progress (another caller triggered it), wait for it
	if (needsToWait || walletState.isInitializing) {
		const maxWaitTime = 5000; // 5 second timeout
		const pollInterval = 50;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWaitTime) {
			walletState = get(walletStore);
			if (walletState.rsk?.address && walletState.rsk?.wallet && walletState.rsk?.provider) {
				return {
					walletAddress: walletState.rsk.address
				};
			}
			// Break if no longer initializing and still no wallet (failed)
			if (!walletState.isInitializing && (!walletState.rsk?.address || !walletState.rsk?.wallet)) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}

	// Final check after waiting
	walletState = get(walletStore);
	if (!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
		return fail(
			'wallet_not_ready',
			'Your wallet is not ready yet. Retry after it finishes connecting.'
		);
	}

	return {
		walletAddress: walletState.rsk.address
	};
}

function normalizeRecipientPubkey(
	pubkey: string
): ServiceContractPreflightFailure | { pubkey: string } {
	if (!pubkey) {
		return fail('invalid_provider_pubkey', 'Provider public key is unavailable for this service.');
	}

	const trimmedPubkey = pubkey.trim();
	if (!trimmedPubkey) {
		return fail('invalid_provider_pubkey', 'Provider public key is unavailable for this service.');
	}

	try {
		if (trimmedPubkey.startsWith('npub')) {
			return {
				pubkey: nip19.decode(trimmedPubkey).data as string
			};
		}

		return {
			pubkey: ethers.hexlify(ethers.getBytes(`0x${trimmedPubkey.replace(/^0x/i, '')}`)).slice(2)
		};
	} catch {
		return fail('invalid_provider_pubkey', 'Provider public key is unavailable for this service.');
	}
}

async function ensureContractPublishReady(
	input: Pick<ServiceContractPreflightInput, 'freelancerPubkey'>
): Promise<ServiceContractPreflightFailure | { recipientPubkey: string }> {
	const normalizedRecipient = normalizeRecipientPubkey(input.freelancerPubkey);
	if ('ok' in normalizedRecipient) {
		return normalizedRecipient;
	}

	const appState = get(appStore);
	if (!appState?.pool || !Array.isArray(appState.relays) || appState.relays.length === 0) {
		return fail(
			'relay_unavailable',
			'Contract relays are unavailable right now. Retry in a moment.'
		);
	}

	// Verify relay connectivity before proceeding
	const relayConnected = await checkRelayConnectivity(appState.relays);
	if (!relayConnected) {
		return fail(
			'relay_unavailable',
			'Unable to connect to relays. Please check your network connection and retry.'
		);
	}

	try {
		const { npub, nsec } = await getNostrKeyPair();
		if (!npub || !nsec) {
			return fail(
				'nostr_not_ready',
				'Your signing keys are not ready yet. Unlock Nostr signing before continuing.'
			);
		}
	} catch (error) {
		return fail(
			'nostr_not_ready',
			extractContractError(error).userMessage ||
				'Your signing keys are not ready yet. Unlock Nostr signing before continuing.'
		);
	}

	return {
		recipientPubkey: normalizedRecipient.pubkey
	};
}

/**
 * @deprecated Use the v2 pattern instead:
 * - Check balance in UI via walletStore
 * - Call createServiceContract() and handle errors from result
 * - Use estimateGasForServiceContract() for gas display
 */
export async function preflightServiceContractCreation(
	input: ServiceContractPreflightInput,
	btcPrice: number
): Promise<ServiceContractPreflightResult> {
	if (!input.freelancerAddress || !input.freelancerAddress.trim()) {
		return fail('invalid_provider_wallet', 'Provider wallet is unavailable for this service.');
	}

	let normalizedFreelancerAddress: string;
	try {
		normalizedFreelancerAddress = ethers.getAddress(input.freelancerAddress.trim().toLowerCase());
	} catch {
		return fail('invalid_provider_wallet', 'Provider wallet is unavailable for this service.');
	}

	const validatedTier = input.freelancerFeeTier ?? 1;
	if (validatedTier < 1 || validatedTier > 3) {
		return fail('invalid_fee_tier', 'Invalid freelancer fee tier');
	}

	let amount: string;
	try {
		amount = convertUsdAmountToRbtc(input.amountUsdt, btcPrice);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to determine the service price.';
		return fail(
			message.includes('BTC price') ? 'price_unavailable' : 'invalid_service_amount',
			message
		);
	}

	const walletReady = await ensureServiceWalletReady();
	if ('ok' in walletReady) {
		return walletReady;
	}
	const { walletAddress } = walletReady;

	const publishReady = await ensureContractPublishReady({
		freelancerPubkey: input.freelancerPubkey
	});
	if ('ok' in publishReady && publishReady.ok === false) {
		return publishReady;
	}

	try {
		const contractAddress = getSecurePaymentContractAddress();
		const { contract, wallet, provider } = await initContract(
			contractAddress,
			'rsk',
			abi as ethers.InterfaceAbi
		);

		const network = await provider.getNetwork();
		const expectedChainId = getExpectedRskChainId();
		if (network.chainId !== expectedChainId) {
			return fail(
				'wrong_network',
				`Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`
			);
		}

		const baseAmountWei = ethers.parseEther(amount);
		const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
		const totalPaymentWei =
			calculateTotalPayment(baseAmountWei, DEFAULT_CLIENT_FEE_TIER) + gasReimbursementWei;
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice ?? 0n;

		const gasEstimate = await contract.createPaymentContract.estimateGas(
			normalizedFreelancerAddress,
			input.estimatedStartTime,
			input.estimatedCompletionTime,
			DEFAULT_CLIENT_FEE_TIER,
			input.freelancerFeeTier ?? 1,
			0n,
			0n,
			{
				value: totalPaymentWei,
				gasPrice
			}
		);
		const gasCostWei = gasEstimate * gasPrice;
		const balanceWei = await provider.getBalance(wallet.address);

		if (balanceWei < totalPaymentWei) {
			const shortfallWei = totalPaymentWei - balanceWei;
			const shortfallSats = Math.round(Number(ethers.formatEther(shortfallWei)) * 100_000_000);
			const shortfallUsd = Number(ethers.formatEther(shortfallWei)) * btcPrice;
			const formattedShortfallSats = shortfallSats.toLocaleString('en-US');
			const formattedShortfallUsd = `$${shortfallUsd.toFixed(2)}`;
			return {
				ok: false,
				errorCode: 'insufficient_funds',
				error: `Insufficient balance. You need an additional ${formattedShortfallSats} sats (${formattedShortfallUsd}) to complete this transaction.`,
				totalRequired: ethers.formatEther(totalPaymentWei),
				shortfallSats,
				shortfallUsd
			};
		}

		return {
			ok: true,
			amount,
			gasCost: ethers.formatEther(gasCostWei),
			totalRequired: ethers.formatEther(totalPaymentWei),
			walletAddress
		};
	} catch (error) {
		return fail('preflight_failed', extractContractError(error).userMessage);
	}
}
