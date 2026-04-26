import { appStore } from '$lib/stores/app.store';
import { walletManager, walletStore } from '$lib/stores/wallet.store';
import { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import { convertUsdAmountToRbtc } from '$lib/utils/currency';
import { ethers } from 'ethers';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';

const DEFAULT_CLIENT_FEE_TIER = 1;
const GAS_BUFFER_DIVISOR = 10n;

export { DEFAULT_CLIENT_FEE_TIER };

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
		console.log('[preflight] SUBACTION: attempting relay', { relay });
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3000);
			const events = await pool.querySync(
				[relay],
				{ kinds: [0], limit: 1 },
				{ signal: controller.signal }
			);
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
	/** Real wallet balance at time of check (RBTC string via ethers.formatEther) */
	balance?: string;
	/** Shortfall between balance and required amount (RBTC string via ethers.formatEther) */
	shortfall?: string;
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
export async function validateNetworkForTransaction(): Promise<
	| {
			ok: true;
			chainId: bigint;
	  }
	| {
			ok: false;
			errorCode: ServiceContractPreflightErrorCode;
			error: string;
	  }
> {
	console.log('[preflight] ACTION: validateNetworkForTransaction');
	const currentChainId = await getCurrentChainId();
	if (currentChainId === null) {
		console.log('[preflight] RESULT: chainId is null - wallet not ready');
		return {
			ok: false,
			errorCode: 'wallet_not_ready',
			error: 'Unable to verify network. Wallet may not be connected.'
		};
	}

	const expectedChainId = getExpectedRskChainId();
	if (currentChainId !== expectedChainId) {
		console.log('[preflight] RESULT: chainId mismatch', {
			currentChainId: currentChainId.toString(),
			expectedChainId: expectedChainId.toString(),
			expectedNetwork: getExpectedRskNetworkLabel()
		});
		return {
			ok: false,
			errorCode: 'wrong_network',
			error: `Network changed during transaction. Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`
		};
	}

	console.log('[preflight] RESULT: network validated', { chainId: currentChainId.toString() });
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
	console.log('[preflight] ACTION: ensureServiceWalletReady');
	let walletState = get(walletStore);

	// If wallet is already ready, return immediately
	if (walletState.rsk?.address && walletState.rsk?.wallet && walletState.rsk?.provider) {
		console.log('[preflight] RESULT: wallet already ready', {
			walletAddress: walletState.rsk.address
		});
		return {
			walletAddress: walletState.rsk.address
		};
	}

	// Start initialization if not already in progress
	let needsToWait = false;
	if (!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
		try {
			console.log('[preflight] SUBACTION: calling walletManager.initialize()');
			// If initialization is already in progress, this returns early
			// If not, it starts initialization
			await walletManager.initialize();

			// Check if initialization completed synchronously
			walletState = get(walletStore);
			needsToWait =
				!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider;
		} catch (err) {
			console.log('[preflight] ERROR: walletManager.initialize() threw', {
				error: err instanceof Error ? err.message : String(err)
			});
			return fail('wallet_not_connected', 'Connect your wallet before continuing.');
		}
	}

	// If wallet is ready after initialize(), return
	if (walletState.rsk?.address && walletState.rsk?.wallet && walletState.rsk?.provider) {
		console.log('[preflight] RESULT: wallet ready after initialize', {
			walletAddress: walletState.rsk.address
		});
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
				console.log('[preflight] RESULT: wallet ready after polling', {
					walletAddress: walletState.rsk.address
				});
				return {
					walletAddress: walletState.rsk.address
				};
			}
			// Break if no longer initializing and still no wallet (failed)
			if (!walletState.isInitializing && (!walletState.rsk?.address || !walletState.rsk?.wallet)) {
				break;
			}
			console.log('[preflight] SUBACTION: waiting for wallet', {
				elapsedMs: Date.now() - startTime,
				maxWaitTime,
				hasAddress: !!walletState.rsk?.address,
				hasWallet: !!walletState.rsk?.wallet,
				isInitializing: walletState.isInitializing
			});
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}

	// Final check after waiting
	walletState = get(walletStore);
	if (!walletState.rsk?.address || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
		console.log('[preflight] RESULT: wallet_not_ready - giving up', {
			hasAddress: !!walletState.rsk?.address,
			hasWallet: !!walletState.rsk?.wallet,
			hasProvider: !!walletState.rsk?.provider,
			isInitializing: walletState.isInitializing
		});
		return fail(
			'wallet_not_ready',
			'Your wallet is not ready yet. Retry after it finishes connecting.'
		);
	}

	console.log('[preflight] RESULT: wallet ready', { walletAddress: walletState.rsk.address });
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
	} catch (error) {
		console.log('[preflight] ERROR: normalizeRecipientPubkey threw', {
			error: error instanceof Error ? error.message : String(error),
			pubkey: pubkey?.slice(0, 8)
		});
		return fail('invalid_provider_pubkey', 'Provider public key is unavailable for this service.');
	}
}

async function ensureContractPublishReady(
	input: Pick<ServiceContractPreflightInput, 'freelancerPubkey'>
): Promise<ServiceContractPreflightFailure | { recipientPubkey: string }> {
	console.log('[preflight] ACTION: ensureContractPublishReady', {
		freelancerPubkey: input.freelancerPubkey?.slice(0, 8) + '...'
	});
	const normalizedRecipient = normalizeRecipientPubkey(input.freelancerPubkey);
	if ('ok' in normalizedRecipient && normalizedRecipient.ok === false) {
		return normalizedRecipient;
	}

	const appState = get(appStore);
	if (!appState?.pool || !Array.isArray(appState.relays) || appState.relays.length === 0) {
		console.log('[preflight] ERROR: pool/relays unavailable', {
			hasPool: !!appState?.pool,
			relays: appState?.relays
		});
		return fail(
			'relay_unavailable',
			'Contract relays are unavailable right now. Retry in a moment.'
		);
	}

	// Verify relay connectivity before proceeding
	const relayConnected = await checkRelayConnectivity(appState.relays);
	if (!relayConnected) {
		console.log('[preflight] ERROR: relay connectivity check failed');
		return fail(
			'relay_unavailable',
			'Unable to connect to relays. Please check your network connection and retry.'
		);
	}

	try {
		const { npub, nsec } = await getNostrKeyPair();
		if (!npub || !nsec) {
			console.log('[preflight] ERROR: getNostrKeyPair returned empty keys');
			return fail(
				'nostr_not_ready',
				'Your signing keys are not ready yet. Unlock Nostr signing before continuing.'
			);
		}
	} catch (error) {
		console.log('[preflight] ERROR: getNostrKeyPair threw', {
			error: error instanceof Error ? error.message : String(error)
		});
		return fail(
			'nostr_not_ready',
			extractContractError(error).userMessage ||
				'Your signing keys are not ready yet. Unlock Nostr signing before continuing.'
		);
	}

	console.log('[preflight] RESULT: contract publish ready', {
		recipientPubkey: normalizedRecipient.pubkey.slice(0, 8) + '...'
	});
	return {
		recipientPubkey: normalizedRecipient.pubkey
	};
}

export async function preflightServiceContractCreation(
	input: ServiceContractPreflightInput,
	btcPrice: number
): Promise<ServiceContractPreflightResult> {
	console.log('[preflight] ACTION: starting preflight validation');
	console.log('[preflight] SUBACTION: validating input parameters', {
		freelancerAddress: input.freelancerAddress,
		freelancerPubkey: input.freelancerPubkey?.slice(0, 8) + '...',
		amountUsdt: input.amountUsdt,
		estimatedStartTime: input.estimatedStartTime,
		estimatedCompletionTime: input.estimatedCompletionTime,
		freelancerFeeTier: input.freelancerFeeTier,
		btcPrice: btcPrice
	});

	if (!input.freelancerAddress || !input.freelancerAddress.trim()) {
		console.log('[preflight] ERROR: invalid_provider_wallet - Provider wallet is unavailable');
		return fail('invalid_provider_wallet', 'Provider wallet is unavailable for this service.');
	}

	let normalizedFreelancerAddress: string;
	try {
		normalizedFreelancerAddress = ethers.getAddress(input.freelancerAddress.trim().toLowerCase());
		console.log('[preflight] SUBACTION: freelancer address normalized', {
			normalizedFreelancerAddress
		});
	} catch {
		console.log('[preflight] ERROR: invalid_provider_wallet - Invalid freelancer address format');
		return fail('invalid_provider_wallet', 'Provider wallet is unavailable for this service.');
	}

	const validatedTier = input.freelancerFeeTier ?? 1;
	if (validatedTier < 1 || validatedTier > 3) {
		console.log('[preflight] ERROR: invalid_fee_tier - tier out of range', { validatedTier });
		return fail('invalid_fee_tier', 'Invalid freelancer fee tier');
	}
	console.log('[preflight] SUBACTION: fee tier validated', { validatedTier });

	let amount: string;
	try {
		amount = convertUsdAmountToRbtc(input.amountUsdt, btcPrice);
		console.log('[preflight] SUBACTION: USD to RBTC conversion', {
			amountUsdt: input.amountUsdt,
			amountRbtc: amount,
			btcPrice: btcPrice
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to determine the service price.';
		console.log('[preflight] ERROR: conversion failed', {
			errorCode: message.includes('BTC price') ? 'price_unavailable' : 'invalid_service_amount',
			message: message
		});
		return fail(
			message.includes('BTC price') ? 'price_unavailable' : 'invalid_service_amount',
			message
		);
	}

	console.log('[preflight] ACTION: checking wallet readiness');
	const walletReady = await ensureServiceWalletReady();
	if ('ok' in walletReady && walletReady.ok === false) {
		console.log('[preflight] ERROR: wallet not ready', {
			errorCode: walletReady.errorCode,
			error: walletReady.error
		});
		return walletReady;
	}
	console.log('[preflight] RESULT: wallet ready', { walletAddress: walletReady.walletAddress });

	console.log('[preflight] ACTION: checking contract publish readiness');
	const publishReady = await ensureContractPublishReady({
		freelancerPubkey: input.freelancerPubkey
	});
	if ('ok' in publishReady && publishReady.ok === false) {
		console.log('[preflight] ERROR: publish not ready', {
			errorCode: publishReady.errorCode,
			error: publishReady.error
		});
		return publishReady;
	}
	console.log('[preflight] RESULT: publish ready');

	try {
		console.log('[preflight] ACTION: checking escrow and network');
		console.log('[preflight] SUBACTION: calling ensureEscrowReady');
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);
		console.log('[preflight] RESULT: ensureEscrowReady succeeded');
		const network = await provider.getNetwork();
		const expectedChainId = getExpectedRskChainId();
		if (network.chainId !== expectedChainId) {
			console.log('[preflight] ERROR: wrong_network', {
				currentChainId: network.chainId.toString(),
				expectedChainId: expectedChainId.toString(),
				expectedNetwork: getExpectedRskNetworkLabel()
			});
			return fail(
				'wrong_network',
				`Switch your wallet to ${getExpectedRskNetworkLabel()} before continuing.`
			);
		}
		console.log('[preflight] SUBACTION: network validated', {
			chainId: network.chainId.toString(),
			expectedChainId: expectedChainId.toString()
		});

		const baseAmountWei = ethers.parseEther(amount);
		// V2 fee calculation for msg.value: base + taskerFee + 2*gasReimbursement
		// Note: taskeeFee is deducted from freelancer payout inside contract, not added to msg.value
		const taskerFeePercentage = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER]?.percentage ?? 250;
		const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
		const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
		const totalPaymentWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;
		console.log('[preflight] SUBACTION: fee calculation', {
			baseAmountWei: baseAmountWei.toString(),
			taskerFeePercentage: taskerFeePercentage,
			taskerFeeWei: taskerFeeWei.toString(),
			gasReimbursementWei: gasReimbursementWei.toString(),
			totalPaymentWei: totalPaymentWei.toString()
		});
		const feeData = await provider.getFeeData();
		if (!feeData.gasPrice) {
			console.log('[preflight] ERROR: gas price unavailable');
			return fail('preflight_failed', 'Unable to determine network gas price. Please try again.');
		}
		const gasPrice = feeData.gasPrice;
		console.log('[preflight] SUBACTION: gas price retrieved', { gasPrice: gasPrice.toString() });

		if (input.estimatedStartTime >= input.estimatedCompletionTime) {
			console.log('[preflight] ERROR: invalid_schedule', {
				estimatedStartTime: input.estimatedStartTime,
				estimatedCompletionTime: input.estimatedCompletionTime
			});
			return fail('invalid_schedule', 'Start time must be before completion time');
		}

		console.log('[preflight] ACTION: estimating gas for createEscrow');
		let gasEstimate: bigint;
		try {
			gasEstimate = await contract.createEscrow.estimateGas(
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
		} catch (estimateError) {
			console.log('[preflight] ERROR: estimateGas failed', {
				error: estimateError instanceof Error ? estimateError.message : String(estimateError)
			});
			throw estimateError;
		}
		const gasLimit = gasEstimate + gasEstimate / GAS_BUFFER_DIVISOR;
		// Sponsor covers actual gas costs — user only needs balance for msg.value (totalPaymentWei)
		const totalRequiredWei = totalPaymentWei;
		const gasCostWei = gasLimit * gasPrice;
		const balanceWei = await provider.getBalance(wallet.address);

		console.log('[preflight] RESULT: balance check', {
			walletAddress: wallet.address,
			balanceWei: balanceWei.toString(),
			balanceRbtc: Number(ethers.formatEther(balanceWei)).toFixed(8),
			balanceUsd: (Number(ethers.formatEther(balanceWei)) * btcPrice).toFixed(2),
			totalPaymentWei: totalPaymentWei.toString(),
			totalRequiredWei: totalRequiredWei.toString(),
			totalRequiredUsd: (Number(ethers.formatEther(totalRequiredWei)) * btcPrice).toFixed(2),
			gasEstimate: gasEstimate.toString(),
			gasLimit: gasLimit.toString(),
			gasCostWei: gasCostWei.toString(),
			btcPrice: btcPrice
		});

		if (balanceWei < totalRequiredWei) {
			const shortfallWei = totalRequiredWei - balanceWei;
			const shortfallUsd = Number(ethers.formatEther(shortfallWei)) * btcPrice;
			console.log('[preflight] ERROR: insufficient_funds', {
				balanceWei: balanceWei.toString(),
				totalRequiredWei: totalRequiredWei.toString(),
				shortfallWei: shortfallWei.toString(),
				balanceRbtc: formatRbtcAmount(balanceWei),
				totalRequiredRbtc: formatRbtcAmount(totalRequiredWei),
				shortfallRbtc: formatRbtcAmount(shortfallWei),
				shortfallUsd: shortfallUsd.toFixed(2)
			});
			return {
				ok: false,
				errorCode: 'insufficient_funds',
				error: `Insufficient RBTC balance. You have ${formatRbtcAmount(balanceWei)} RBTC but need ${formatRbtcAmount(totalRequiredWei)} RBTC (including gas). Shortfall: ${formatRbtcAmount(shortfallWei)} RBTC.`,
				totalRequired: ethers.formatEther(totalRequiredWei),
				balance: ethers.formatEther(balanceWei),
				shortfall: ethers.formatEther(shortfallWei)
			};
		}

		console.log('[preflight] RESULT: preflight passed - returning success', {
			amount: amount,
			gasCost: ethers.formatEther(gasCostWei),
			totalRequired: ethers.formatEther(totalRequiredWei),
			walletAddress: walletReady.walletAddress
		});
		return {
			ok: true,
			amount,
			gasCost: ethers.formatEther(gasCostWei),
			totalRequired: ethers.formatEther(totalRequiredWei),
			walletAddress: walletReady.walletAddress
		};
	} catch (error) {
		console.log('[preflight] ERROR: preflight threw exception', {
			error: error instanceof Error ? error.message : String(error)
		});
		return fail('preflight_failed', extractContractError(error).userMessage);
	}
}

export interface BalanceRevalidationInput {
	amountRbtc: string;
	btcPrice: number;
	freelancerFeeTier?: 1 | 2 | 3;
}

export interface BalanceRevalidationResult {
	ok: true;
	currentBalanceWei: bigint;
	totalRequiredWei: bigint;
}

export interface BalanceRevalidationFailure {
	ok: false;
	error: string;
	balance?: string;
	shortfall?: string;
}

export type BalanceRevalidationResult = BalanceRevalidationSuccess | BalanceRevalidationFailure;

export async function revalidateWalletBalance(
	input: BalanceRevalidationInput
): Promise<BalanceRevalidationResult> {
	console.log('[preflight] ACTION: revalidating wallet balance (TOCTOU protection)');
	console.log('[preflight] SUBACTION: input parameters', {
		amountRbtc: input.amountRbtc,
		btcPrice: input.btcPrice,
		freelancerFeeTier: input.freelancerFeeTier
	});

	try {
		console.log('[preflight] ACTION: getting escrow provider');
		const { provider } = await ensureEscrowReady(undefined, false);

		console.log('[preflight] SUBACTION: validating current chain id');
		const currentChainId = await getCurrentChainId();
		if (currentChainId === null || currentChainId !== getExpectedRskChainId()) {
			console.log('[preflight] ERROR: network changed during revalidation', {
				currentChainId: currentChainId?.toString() ?? 'null',
				expectedChainId: getExpectedRskChainId().toString(),
				expectedNetwork: getExpectedRskNetworkLabel()
			});
			return {
				ok: false,
				error:
					'Network changed. Please switch to ' +
					getExpectedRskNetworkLabel() +
					' before continuing.'
			};
		}
		console.log('[preflight] RESULT: chain id validated', { chainId: currentChainId.toString() });

		const walletState = get(walletStore);

		if (!walletState.rsk?.address) {
			console.log('[preflight] ERROR: wallet address unavailable');
			return {
				ok: false,
				error: 'Wallet address unavailable for balance revalidation.'
			};
		}

		// Normalize address to proper EIP-55 checksum format before using
		// First lowercase to strip any invalid checksum casing, ethers will return proper checksum
		let normalizedAddress: string;
		try {
			normalizedAddress = ethers.getAddress(walletState.rsk.address.toLowerCase());
			console.log('[preflight] SUBACTION: address normalized', { normalizedAddress });
		} catch (addrError) {
			console.log('[preflight] ERROR: invalid wallet address format', {
				error: addrError instanceof Error ? addrError.message : String(addrError)
			});
			return {
				ok: false,
				error:
					'Invalid wallet address format: ' +
					(addrError instanceof Error ? addrError.message : String(addrError))
			};
		}

		let baseAmountWei: bigint;
		try {
			baseAmountWei = ethers.parseEther(input.amountRbtc);
			console.log('[preflight] SUBACTION: amount parsed', {
				amountRbtc: input.amountRbtc,
				baseAmountWei: baseAmountWei.toString()
			});
		} catch (amountError) {
			console.log('[preflight] ERROR: invalid amount format', {
				error: amountError instanceof Error ? amountError.message : String(amountError)
			});
			return {
				ok: false,
				error:
					'Invalid amount format: ' +
					(amountError instanceof Error ? amountError.message : String(amountError))
			};
		}

		// V2 fee calculation for msg.value: base + taskerFee + 2*gasReimbursement
		const freelancerFeeTier = input.freelancerFeeTier ?? 1;
		const taskerFeePercentage = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER]?.percentage ?? 250;
		const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
		const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
		const totalPaymentWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;
		// Sponsor covers actual gas costs — user only needs balance for msg.value
		const totalRequiredWei = totalPaymentWei;

		console.log('[preflight] SUBACTION: TOCTOU fee calculation', {
			baseAmountWei: baseAmountWei.toString(),
			taskerFeePercentage: taskerFeePercentage,
			taskerFeeWei: taskerFeeWei.toString(),
			gasReimbursementWei: gasReimbursementWei.toString(),
			totalPaymentWei: totalPaymentWei.toString(),
			totalRequiredWei: totalRequiredWei.toString(),
			totalRequiredUsd: (Number(ethers.formatEther(totalRequiredWei)) * input.btcPrice).toFixed(2),
			btcPrice: input.btcPrice,
			freelancerFeeTier: freelancerFeeTier
		});

		let currentBalanceWei: bigint;
		try {
			console.log('[preflight] ACTION: fetching current balance from provider');
			currentBalanceWei = await provider.getBalance(normalizedAddress);
			console.log('[preflight] RESULT: balance fetched', {
				currentBalanceWei: currentBalanceWei.toString(),
				currentBalanceRbtc: Number(ethers.formatEther(currentBalanceWei)).toFixed(8),
				currentBalanceUsd: (Number(ethers.formatEther(currentBalanceWei)) * input.btcPrice).toFixed(
					2
				),
				walletAddress: normalizedAddress
			});
		} catch (balanceError) {
			console.log('[preflight] ERROR: failed to fetch balance', {
				error: balanceError instanceof Error ? balanceError.message : String(balanceError)
			});
			return {
				ok: false,
				error: 'Unable to verify wallet balance at transaction time. Please try again.'
			};
		}

		console.log('[preflight] SUBACTION: comparing balance to required', {
			currentBalanceWei: currentBalanceWei.toString(),
			totalRequiredWei: totalRequiredWei.toString(),
			isSufficient: currentBalanceWei >= totalRequiredWei,
			differenceWei: (currentBalanceWei - totalRequiredWei).toString()
		});

		if (currentBalanceWei < totalRequiredWei) {
			const shortfallWei = totalRequiredWei - currentBalanceWei;
			console.log('[preflight] ERROR: insufficient_funds (TOCTOU)', {
				currentBalanceWei: currentBalanceWei.toString(),
				totalRequiredWei: totalRequiredWei.toString(),
				shortfallWei: shortfallWei.toString(),
				currentBalanceRbtc: formatRbtcAmount(currentBalanceWei),
				totalRequiredRbtc: formatRbtcAmount(totalRequiredWei),
				shortfallRbtc: formatRbtcAmount(shortfallWei)
			});
			return {
				ok: false,
				error: `Insufficient funds at transaction time. Balance changed since initial check. Shortfall: ${formatRbtcAmount(shortfallWei)} RBTC. Please add funds and retry.`,
				balance: ethers.formatEther(currentBalanceWei),
				shortfall: ethers.formatEther(shortfallWei)
			};
		}

		console.log('[preflight] RESULT: balance revalidation passed', {
			currentBalanceWei: currentBalanceWei.toString(),
			totalRequiredWei: totalRequiredWei.toString()
		});

		return {
			ok: true,
			currentBalanceWei,
			totalRequiredWei
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log('[preflight] ERROR: revalidation threw exception', {
			error: errorMessage
		});
		// Check if this is an ensureEscrowReady failure
		if (errorMessage.includes('escrow') || errorMessage.includes('Escrow')) {
			console.log('[preflight] ERROR: ensureEscrowReady threw in revalidateWalletBalance', {
				error: errorMessage
			});
		}
		// Don't use extractContractError for revalidation errors - return raw message
		// to help diagnose where the failure occurred
		return {
			ok: false,
			error: 'Balance revalidation failed: ' + errorMessage
		};
	}
}
