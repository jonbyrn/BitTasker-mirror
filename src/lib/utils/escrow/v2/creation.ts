/**
 * v2 Payment Contract Creation
 *
 * Implements the dry-run and (future) real creation flow for v2 escrow.
 * Phase 1: dryRun only — validation, gas estimation, staticCall, no broadcast.
 *
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import type { NostrBidContent } from '$lib/types/bid';
import type { Task } from '$lib/types/task';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
import { normalizeRskAddress } from '@bittasker/wallet-core';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { getProvider, getWallet } from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';
import type {
	CreatePaymentContractParams,
	V2CreationDisplay,
	V2DerivationResult,
	V2DryRunResult,
	V2GasEstimateResult
} from './types';
import { GAS_REIMBURSEMENT_PER_OP, CANCELLATION_FEE_MVP, UPFRONT_DEPOSIT_MVP } from './types';
import v2Abi from './abi.json';
import type { NDKBid } from '$lib/nostr/events/bid';
import type { NDKTask } from '$lib/nostr/events/task';

const d = createDebug('escrow:v2:creation');

/** Default fee tier (tier 1 = 2.5%) — maps to v1 clientFeeTier/freelancerFeeTier */
const DEFAULT_FEE_TIER = 1;

/**
 * Derive v2 creation params and display data from bid + task + btcPrice.
 * Pure function — no wallet/contract access. Used by UI for display and by creation for params.
 */
export function deriveV2CreationParams(
	bid: NostrBidContent,
	task: Task,
	btcPrice: number
): V2DerivationResult {
	if (bid.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be greater than 0');
	}
	if (!btcPrice || btcPrice <= 0) {
		throw new Error('Invalid BTC price: price must be greater than 0');
	}

	const taskee = bid.bidderWalletAddress || '';
	if (!taskee) {
		throw new Error('Bid must include bidder wallet address');
	}

	// Base amount: USD → RBTC
	const baseAmountRBTC = bid.amount / btcPrice;
	const baseAmount = baseAmountRBTC.toFixed(8);
	const baseAmountWei = ethers.parseEther(baseAmount);

	// Fee tiers (MVP: tier 1)
	const taskerFeeTier = DEFAULT_FEE_TIER;
	const taskeeFeeTier = DEFAULT_FEE_TIER;
	const taskerFeePercentage = FEE_TIERS[taskerFeeTier]?.percentage ?? 250;
	const taskeeFeePercentage = FEE_TIERS[taskeeFeeTier]?.percentage ?? 250;

	const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;

	// MVP: cancellationFee = 0, upfrontDeposit = 0
	const cancellationFee = CANCELLATION_FEE_MVP;
	const upfrontDeposit = UPFRONT_DEPOSIT_MVP;

	// Total value = base + taskerFee + taskeeFee + upfrontDeposit + (2 × GAS_REIMBURSEMENT_PER_OP)
	const totalValueWei =
		baseAmountWei + taskerFeeWei + taskeeFeeWei + upfrontDeposit + 2n * GAS_REIMBURSEMENT_PER_OP;

	// Timing
	let startTime: number;
	let completionTime: number;

	if (bid.startDateTime && bid.endDateTime) {
		const startDate = parseDateWithLocalTime(bid.startDateTime);
		const endDate = parseDateWithLocalTime(bid.endDateTime);
		if (startDate && endDate) {
			startTime = Math.floor(startDate.getTime() / 1000);
			completionTime = Math.floor(endDate.getTime() / 1000);
		} else {
			startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
			completionTime = startTime + 3600;
		}
	} else {
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = startTime + 3600;
	}

	const now = Math.floor(Date.now() / 1000);
	let wasTimeAdjusted = false;

	if (startTime <= now) {
		const newStartTime = now + 3600;
		const timeShift = newStartTime - startTime;
		startTime = newStartTime;
		completionTime = completionTime + timeShift;
		wasTimeAdjusted = true;
	}

	if (completionTime <= startTime) {
		throw new Error('Completion time must be after start time');
	}

	// uint32 range check
	if (
		startTime < 0 ||
		startTime > 0xffff_ffff ||
		completionTime < 0 ||
		completionTime > 0xffff_ffff
	) {
		throw new Error('Estimated times must be within uint32 range');
	}

	const params: CreatePaymentContractParams = {
		taskee,
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
		taskerFeeTier,
		taskeeFeeTier,
		cancellationFee,
		upfrontDeposit,
		totalValueWei,
		baseAmountWei,
		taskerFeeWei,
		taskeeFeeWei
	};

	const display: V2CreationDisplay = {
		baseAmount,
		totalAmount: ethers.formatEther(totalValueWei),
		taskerFee: ethers.formatEther(taskerFeeWei),
		taskeeFee: ethers.formatEther(taskeeFeeWei),
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
		wasTimeAdjusted,
		taskee,
		taskerFeeTier,
		taskeeFeeTier
	};

	return { params, display };
}

/**
 * Validate params before contract call.
 * Returns validation errors; empty array means valid.
 */
function validateParams(params: CreatePaymentContractParams): string[] {
	const errors: string[] = [];

	try {
		normalizeRskAddress(params.taskee);
	} catch {
		errors.push('Invalid taskee address format');
	}

	if (!params.taskee || params.taskee === ethers.ZeroAddress) {
		errors.push('Taskee address is required');
	}

	if (params.totalValueWei <= 0n) {
		errors.push('Total value must be positive');
	}

	const now = Math.floor(Date.now() / 1000);
	if (params.estimatedStartTime <= now) {
		// Adjusted in derivation; should not happen if derivation ran
		errors.push('Estimated start time must be in the future');
	}
	if (params.estimatedCompletionTime <= params.estimatedStartTime) {
		errors.push('Completion time must be after start time');
	}

	if (params.taskerFeeTier < 0 || params.taskeeFeeTier < 0) {
		errors.push('Invalid fee tier');
	}

	return errors;
}

/**
 * Get v2 contract address from env
 */
function getV2ContractAddress(): string {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const address =
		network === 'mainnet'
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;

	if (!address) {
		throw new Error(
			`V2 contract address not configured. Set VITE_RSK_CONTRACT_ADDRESS_V2_${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}`
		);
	}
	return address;
}

/**
 * Ensure wallet and v2 contract are ready.
 */
async function ensureV2ContractReady(): Promise<{
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
}> {
	let wallet = getWallet('rsk');
	if (!wallet) {
		const { walletManager } = await import('$lib/stores/wallet.store');
		await walletManager.initialize();
		wallet = getWallet('rsk');
		if (!wallet) {
			throw new Error('Failed to initialize wallet');
		}
	}

	let provider = getProvider('rsk');
	if (!provider) {
		const { walletManager } = await import('$lib/stores/wallet.store');
		await walletManager.initialize();
		provider = getProvider('rsk');
		if (!provider) {
			throw new Error('Failed to get provider');
		}
	}

	const contractAddress = getV2ContractAddress();
	const checksummedAddress = ethers.getAddress(contractAddress.toLowerCase());
	const contract = new ethers.Contract(checksummedAddress, v2Abi as ethers.InterfaceAbi, wallet);

	return { contract, wallet, provider };
}

/**
 * Estimate gas for createPaymentContract. Call when form opens to show network fee before submit.
 * Requires wallet connected. Safe to call; returns error result instead of throwing.
 */
export async function estimateGasForCreatePaymentContract(
	params: CreatePaymentContractParams
): Promise<V2GasEstimateResult> {
	try {
		const walletState = get(walletStore);
		if (!walletState.rsk.connected) {
			return { success: false, error: 'Wallet not connected' };
		}

		const { contract, provider } = await ensureV2ContractReady();
		const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);

		const gasEstimate = await contract.createPaymentContract.estimateGas(
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit,
			{ value: params.totalValueWei, gasPrice }
		);

		const estimatedCostWei = gasEstimate * gasPrice;
		const estimatedCostFormatted = ethers.formatEther(estimatedCostWei);

		d.log('gas estimate (preview)', {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			estimatedCostWei: estimatedCostWei.toString()
		});

		return {
			success: true,
			estimatedGas: gasEstimate,
			estimatedCostWei,
			estimatedCostFormatted
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('estimateGasForCreatePaymentContract failed', err);
		return {
			success: false,
			error: err.message
		};
	}
}

/**
 * Create escrow from bid — Phase 1: dryRun only (validation + gas + staticCall, no broadcast).
 *
 * @param bid - Nostr bid event (NDKBid or NostrEventWithFollowup)
 * @param task - Nostr task event (NDKTask or NostrEvent)
 * @param btcPrice - Current BTC price in USD
 * @param options.dryRun - When true, run validation + gas + staticCall and return without broadcasting
 */
export async function createEscrowFromBid(
	bid: NDKBid,
	task: NDKTask,
	btcPrice: number,
	options?: { dryRun?: boolean }
): Promise<V2DryRunResult> {
	const dryRun = options?.dryRun ?? true;

	// Extract content (bid/task can be NDKEvent with parsed content or raw NostrEvent)
	const bidContent = bid.bidContent;
	const taskContent = task.taskContent;
	const taskId = task.dTag;

	d.log('createEscrowFromBid start', { taskId, bidId: bid.id, dryRun });

	try {
		const { params } = deriveV2CreationParams(bidContent, taskContent, btcPrice);

		d.log('params derived', {
			taskee: params.taskee.slice(0, 10) + '…',
			totalWei: params.totalValueWei.toString(),
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime
		});

		const validationErrors = validateParams(params);
		if (validationErrors.length > 0) {
			d.error('validation failed', { validationErrors });
			return {
				success: false,
				error: `Validation failed: ${validationErrors.join(', ')}`,
				validationErrors
			};
		}

		const walletState = get(walletStore);
		if (!walletState.rsk.connected) {
			return {
				success: false,
				error: 'RSK wallet not connected. Please connect your wallet first.'
			};
		}

		const { contract, provider } = await ensureV2ContractReady();
		d.log('contract ready', { address: getV2ContractAddress().slice(0, 10) + '…' });

		const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);

		const createPaymentContract = contract.createPaymentContract;

		const gasEstimate = await createPaymentContract.estimateGas(
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit,
			{ value: params.totalValueWei, gasPrice }
		);

		const estimatedCostWei = gasEstimate * gasPrice;
		const estimatedCostFormatted = ethers.formatEther(estimatedCostWei);

		d.log('gas estimate', {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			estimatedCostWei: estimatedCostWei.toString()
		});

		const simulatedPaymentId = await createPaymentContract.staticCall(
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit,
			{ value: params.totalValueWei, gasPrice }
		);

		d.log('staticCall result', { simulatedPaymentId: Number(simulatedPaymentId) });

		if (dryRun) {
			d.log('dryRun: skipping broadcast');
			return {
				success: true,
				estimatedGas: gasEstimate,
				estimatedCostWei,
				estimatedCostFormatted,
				simulatedPaymentId: Number(simulatedPaymentId),
				params
			};
		}

		// Phase 2: broadcast — not implemented yet
		return {
			success: false,
			error: 'Transaction broadcast not yet implemented (Phase 2)'
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('createEscrowFromBid failed', { taskId }, err);
		return {
			success: false,
			error: err.message
		};
	}
}
