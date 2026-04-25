import { appStore } from '$lib/stores/app.store';
import { walletManager, walletStore } from '$lib/stores/wallet.store';
import { ensureEscrowReady, calculateTotalPayment } from '$lib/utils/escrow/v1/escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import { convertUsdAmountToRbtc } from '$lib/utils/currency';
import { ethers } from 'ethers';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { RELAY_CONNECTIVITY_TIMEOUT_MS } from '$lib/utils/nostr';

const DEFAULT_CLIENT_FEE_TIER = 1;
const GAS_BUFFER_DIVISOR = 10n;
const ESTIMATED_NETWORK_FEE_USD = 0.5;
const DEFAULT_CLIENT_FEE_TIER = 1;
const GAS_BUFFER_DIVISOR = 10n;
const ESTIMATED_NETWORK_FEE_USD = 0.5;

/**
 * Check relay connectivity by attempting to query a minimal event from at least one relay.
 * Returns true if at least one relay responds within the timeout, false otherwise.
 */
async function checkRelayConnectivity(relays: string[]): Promise<boolean> {
	if (relays.length === 0) {
		return false;
	}

	const pool = get(appStore)?.pool;
	if (!pool) {
		return false;
	}

	// Try each relay with a short timeout - success if any relay responds
	for (const relay of relays) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), RELAY_CONNECTIVITY_TIMEOUT_MS);

			// Use querySync with a minimal filter to test connectivity
			// kind 0 is metadata, limit 1 - very lightweight query
			const events = await pool.querySync([relay], { kinds: [0], limit: 1 }, { signal: controller.signal });
			clearTimeout(timeoutId);

			if (events) {
				// Query succeeded (empty array is OK, means relay is reachable)
				return true;
			}
		} catch {
			// This relay failed, try next one
			continue;
		}
	}

	// All relays failed
	return false;
}

export { DEFAULT_CLIENT_FEE_TIER, ESTIMATED_NETWORK_FEE_USD, checkRelayConnectivity };

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
}

export type ServiceContractPreflightResult =
	| ServiceContractPreflightSuccess
	| ServiceContractPreflightFailure;

function getExpectedRskChainId(): bigint {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	if (configuredNetwork === 'mainnet') {
		return 30n;
	}
	if (configuredNetwork === 'regtest') {
		return 33n;
	}
	return 31n;
}

function getExpectedRskNetworkLabel(): string {
	const configuredNetwork = import.meta.env.VITE_RSK_NETWORK;
	if (configuredNetwork === 'mainnet') {
		return 'Rootstock Mainnet';
	}
	if (configuredNetwork === 'regtest') {
		return 'Rootstock Regtest';
	}
	return 'Rootstock Testnet';
}

/**
 * Gets the current chain ID from the wallet provider.
 * Returns null if provider is not available.
 */
export async function getCurrentChainId(): Promise<bigint | null> {
	const walletState = get(walletStore);
	const provider = walletState.rsk?.provider;
	if (!provider) {
		return null;
	}
	try {
		const network = await provider.getNetwork();
		return network.chainId;
	} catch {
		return null;
	}
}

/**
 * Validates that the current network matches the expected network.
 * Should be called before critical operations like createEscrow.
 */
export async function validateNetworkForTransaction(): Promise<{
	ok: true;
	chainId: bigint;
} | {
	ok: false;
	errorCode: ServiceContractPreflightErrorCode;
	error: string;
}> {
	const currentChainId = await getCurrentChainId();
	if (currentChainId === null) {
		return {
			ok: false,
			errorCode: 'wallet_not_ready',
			error: 'Unable to verify network. Wallet may not be connected.'
		};
	}

	const expectedChainId = getExpectedRskChainId();
	if (currentChainId !== expectedChainId) {
		return {
			ok: false,
			errorCode: 'wrong_network',
			error: `Network changed during transaction. Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`
		};
	}

	return {
		ok: true,
		chainId: currentChainId
	};
}

function formatRbtcAmount(value: bigint): string {
	return Number.parseFloat(ethers.formatEther(value)).toFixed(6);
}

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
			await walletManager.initialize();

			// Check if initialization completed synchronously
			walletState = get(walletStore);
			needsToWait = !walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider;
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
	if ('ok' in normalizedRecipient && normalizedRecipient.ok === false) {
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
	if ('ok' in walletReady && walletReady.ok === false) {
		return walletReady;
	}

	const publishReady = await ensureContractPublishReady({
		freelancerPubkey: input.freelancerPubkey
	});
	if ('ok' in publishReady && publishReady.ok === false) {
		return publishReady;
	}

	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);
		const network = await provider.getNetwork();
		const expectedChainId = getExpectedRskChainId();
		if (network.chainId !== expectedChainId) {
			return fail(
				'wrong_network',
				`Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`
			);
		}

		const baseAmountWei = ethers.parseEther(amount);
		const totalPaymentWei = calculateTotalPayment(baseAmountWei, DEFAULT_CLIENT_FEE_TIER);
		const feeData = await provider.getFeeData();
		if (!feeData.gasPrice) {
			return fail('preflight_failed', 'Unable to determine network gas price. Please try again.');
		}
		const gasPrice = feeData.gasPrice;

		if (input.estimatedStartTime >= input.estimatedCompletionTime) {
			return fail('invalid_schedule', 'Start time must be before completion time');
		}

		const gasEstimate = await contract.createEscrow.estimateGas(
			normalizedFreelancerAddress,
			input.estimatedStartTime,
			input.estimatedCompletionTime,
			DEFAULT_CLIENT_FEE_TIER,
			validatedTier,
			{
				value: totalPaymentWei,
				gasPrice
			}
		);
		const gasLimit = gasEstimate + gasEstimate / GAS_BUFFER_DIVISOR;
		// Use fixed $0.50 fee for totalRequired since sponsor covers actual gas
		const estimatedFeeWei = ethers.parseEther((ESTIMATED_NETWORK_FEE_USD / btcPrice).toFixed(8));
		const totalRequiredWei = totalPaymentWei + estimatedFeeWei;
		const gasCostWei = gasLimit * gasPrice;
		const balanceWei = await provider.getBalance(wallet.address);

		if (balanceWei < totalRequiredWei) {
			const shortfallWei = totalRequiredWei - balanceWei;
			return {
				ok: false,
				errorCode: 'insufficient_funds',
				error: `Insufficient RBTC balance. You have ${formatRbtcAmount(balanceWei)} RBTC but need ${formatRbtcAmount(totalRequiredWei)} RBTC (including gas). Shortfall: ${formatRbtcAmount(shortfallWei)} RBTC.`,
				totalRequired: ethers.formatEther(totalRequiredWei)
			};
		}

		return {
			ok: true,
			amount,
			gasCost: ethers.formatEther(gasCostWei),
			totalRequired: ethers.formatEther(totalRequiredWei),
			walletAddress: walletReady.walletAddress
		};
	} catch (error) {
		return fail('preflight_failed', extractContractError(error).userMessage);
	}
}

export interface BalanceRevalidationInput {
	amountRbtc: string;
	btcPrice: number;
}

export interface BalanceRevalidationResult {
	ok: true;
	currentBalanceWei: bigint;
	totalRequiredWei: bigint;
}

export interface BalanceRevalidationFailure {
	ok: false;
	error: string;
}

export type BalanceRevalidationResult = BalanceRevalidationResult | BalanceRevalidationFailure;

export async function revalidateWalletBalance(
	input: BalanceRevalidationInput
): Promise<BalanceRevalidationResult> {
	try {
		const { provider } = await ensureEscrowReady(undefined, false);

		const currentChainId = await getCurrentChainId();
		if (currentChainId === null || currentChainId !== getExpectedRskChainId()) {
			return {
				ok: false,
				error: 'Network changed. Please switch to ' + getExpectedRskNetworkLabel() + ' before continuing.'
			};
		}

		const walletState = get(walletStore);

		if (!walletState.rsk?.address) {
			return {
				ok: false,
				error: 'Wallet address unavailable for balance revalidation.'
			};
		}

		const baseAmountWei = ethers.parseEther(input.amountRbtc);
		const totalPaymentWei = calculateTotalPayment(baseAmountWei, DEFAULT_CLIENT_FEE_TIER);
		const estimatedFeeWei = ethers.parseEther(
			(ESTIMATED_NETWORK_FEE_USD / input.btcPrice).toFixed(8)
		);
		const totalRequiredWei = totalPaymentWei + estimatedFeeWei;

		let currentBalanceWei: bigint;
		try {
			currentBalanceWei = await provider.getBalance(walletState.rsk.address);
		} catch (balanceError) {
			return {
				ok: false,
				error:
					'Unable to verify wallet balance at transaction time. Please try again.'
			};
		}

		if (currentBalanceWei < totalRequiredWei) {
			const shortfallWei = totalRequiredWei - currentBalanceWei;
			return {
				ok: false,
				error: `Insufficient funds at transaction time. Balance changed since initial check. Shortfall: ${formatRbtcAmount(shortfallWei)} RBTC. Please add funds and retry.`
			};
		}

		return {
			ok: true,
			currentBalanceWei,
			totalRequiredWei
		};
	} catch (error) {
		return {
			ok: false,
			error:
				'Unable to verify wallet balance at transaction time. Please try again.'
		};
	}
}
