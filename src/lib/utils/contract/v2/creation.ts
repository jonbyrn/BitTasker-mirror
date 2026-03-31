/**
 * v2 Payment Contract Creation
 *
 * Implements the dry-run and (future) real creation flow for v2 escrow.
 * Phase 1: dryRun only — validation, gas estimation, staticCall, no broadcast.
 *
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import type { NostrBidContent } from '$lib/types/bid';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
import { normalizeRskAddress } from '@bittasker/wallet-core';
import { createDebug } from '$lib/utils/debug';
import {
	GAS_REIMBURSEMENT_PER_OP,
	type CreatePaymentContractParams,
	type CreatePaymentContractTxResult,
	type GasEstimateResult,
	type ContractCreationResult,
	type ContractCreationDisplay
} from '$lib/utils/contract/v2/types';
import { runParallelNamed } from '../parallelEffects';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import abi from './abi.json';
import type { NDKBid } from '$lib/nostr/events/bid';
import type { NDKTask } from '$lib/nostr/events/task';
import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { initContract } from '..';

const d = createDebug('contract:v2');

/** Default fee tier (tier 1 = 2.5%) — maps to v1 clientFeeTier/freelancerFeeTier */
const DEFAULT_FEE_TIER = 1;

/** Thrown when {@link deriveContractCreationParams} collects one or more validation failures. */
export class ContractCreationParamsError extends Error {
	readonly errors: string[];

	constructor(errors: string[]) {
		super(`Validation failed: ${errors.join(', ')}`);
		this.name = 'ContractCreationParamsError';
		this.errors = errors;
	}
}

function assertValidDerivationInputs(bidContent: NostrBidContent, btcPrice: number): void {
	if (!Number.isFinite(bidContent.amount) || bidContent.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be a finite number greater than 0');
	}
	if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
		throw new Error('Invalid BTC price: price must be a finite number greater than 0');
	}
	const taskee = bidContent.bidderWalletAddress || '';
	if (!taskee) {
		throw new Error('Bid must include bidder wallet address');
	}
}

function assertValidCreatePaymentContractParams(params: CreatePaymentContractParams): void {
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
		errors.push('Estimated start time must be in the future');
	}
	if (params.estimatedCompletionTime <= params.estimatedStartTime) {
		errors.push('Completion time must be after start time');
	}

	if (params.taskerFeeTier < 0 || params.taskeeFeeTier < 0) {
		errors.push('Invalid fee tier');
	}

	if (errors.length > 0) {
		throw new ContractCreationParamsError(errors);
	}
}

/**
 * Single derivation pass: validates inputs, builds contract params, validates params, builds display.
 * Not exported — use {@link deriveContractCreationParams}.
 */
export function deriveContractCreationParams(
	bidContent: NostrBidContent,
	btcPrice: number
): { params: CreatePaymentContractParams; display: ContractCreationDisplay } {
	assertValidDerivationInputs(bidContent, btcPrice);

	const taskee = bidContent.bidderWalletAddress || '';

	const baseAmountRBTC = bidContent.amount / btcPrice;
	const baseAmount = baseAmountRBTC.toFixed(8);
	const baseAmountWei = ethers.parseEther(baseAmount);

	const taskerFeeTier = DEFAULT_FEE_TIER;
	const taskeeFeeTier = DEFAULT_FEE_TIER;
	const taskerFeePercentage = FEE_TIERS[taskerFeeTier]?.percentage ?? 250;
	const taskeeFeePercentage = FEE_TIERS[taskeeFeeTier]?.percentage ?? 250;

	const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;

	const cancellationFee = BigInt(bidContent.cancellationFee ?? 0);
	const upfrontDeposit = BigInt(bidContent.upfrontDeposit ?? 0);

	const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
	const totalValueWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;

	let startTime: number;
	let completionTime: number;

	if (bidContent.startDateTime && bidContent.endDateTime) {
		const startDate = parseDateWithLocalTime(bidContent.startDateTime);
		const endDate = parseDateWithLocalTime(bidContent.endDateTime);
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

	assertValidCreatePaymentContractParams(params);

	const display: ContractCreationDisplay = {
		chain: 'rsk',
		currency: 'RBTC',
		baseAmount,
		taskerFee: ethers.formatEther(taskerFeeWei),
		totalAmount: ethers.formatEther(totalValueWei),
		gasReimbursementAmount: ethers.formatEther(gasReimbursementWei),
		startTime,
		completionTime,
		wasTimeAdjusted
	};

	return { params, display };
}

/**
 * Get v2 contract address from env
 */
function getContractAddress(): string {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const address =
		network === 'mainnet'
			? ethers.getAddress(import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET).toLowerCase()
			: ethers.getAddress(import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET).toLowerCase();

	if (!address) {
		throw new Error(
			`V2 contract address not configured. Set VITE_RSK_CONTRACT_ADDRESS_V2_${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}`
		);
	}
	return address;
}

/**
 * Estimate gas for createPaymentContract. Call when form opens to show network fee before submit.
 * Requires wallet connected. Safe to call; returns error result instead of throwing.
 */
export async function estimateGasForCreatePaymentContract(
	params: CreatePaymentContractParams
): Promise<GasEstimateResult> {
	try {
		const { contract, provider } = await initContract(getContractAddress(), 'rsk', abi);
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
			estimatedCostWei: estimatedCostWei.toString(),
			estimatedCostFormatted: estimatedCostFormatted
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
 * Estimates network fee (RBTC) for `createPaymentContract` from bid content and BTC price.
 * Derives params via {@link deriveContractCreationParams}, then {@link estimateGasForCreatePaymentContract}.
 * @returns Formatted cost string, or `null` if gas estimation fails (wallet/network). Validation errors from derivation propagate.
 */
export async function estimateGasCostForCreatePaymentContract(
	bidContent: NostrBidContent,
	btcPrice: number
): Promise<string> {
	const { params } = deriveContractCreationParams(bidContent, btcPrice);
	const result = await estimateGasForCreatePaymentContract(params);
	if (!result.success) {
		return '';
	}
	return result.estimatedCostFormatted;
}

/**
 * Blockchain-only path: init v2 contract, estimate gas, staticCall (revert check), broadcast `createPaymentContract`.
 * Does not wait for confirmation — returns the pending transaction as soon as the wallet submits it.
 */
export async function createPaymentContract(
	params: CreatePaymentContractParams
): Promise<CreatePaymentContractTxResult> {
	assertValidCreatePaymentContractParams(params);

	const { contract, provider } = await initContract(getContractAddress(), 'rsk', abi);
	const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());
	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || BigInt(0);
	const createFn = contract.createPaymentContract;

	const gasEstimate = await createFn.estimateGas(
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

	d.log('createPaymentContract: gas estimate', {
		gasLimit: gasEstimate.toString(),
		estimatedCostFormatted
	});

	const overrides = { value: params.totalValueWei, gasPrice };

	await createFn.staticCall(
		taskeeEip55,
		params.estimatedStartTime,
		params.estimatedCompletionTime,
		params.taskerFeeTier,
		params.taskeeFeeTier,
		params.cancellationFee,
		params.upfrontDeposit,
		overrides
	);
	d.log('createPaymentContract: staticCall ok');

	const tx = await createFn(
		taskeeEip55,
		params.estimatedStartTime,
		params.estimatedCompletionTime,
		params.taskerFeeTier,
		params.taskeeFeeTier,
		params.cancellationFee,
		params.upfrontDeposit,
		overrides
	);

	d.log('createPaymentContract: broadcast', { hash: tx.hash });

	return { tx, estimatedCostFormatted };
}

/**
 * Read `paymentId` from mined tx logs (authoritative — not from staticCall).
 */
function parsePaymentContractCreatedPaymentId(
	receipt: ethers.TransactionReceipt,
	v2ContractAddress: string
): number {
	const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
	const expected = v2ContractAddress.toLowerCase();
	for (const log of receipt.logs) {
		if (!log.address || log.address.toLowerCase() !== expected) continue;
		try {
			const parsed = iface.parseLog({
				topics: log.topics as string[],
				data: log.data
			});
			if (parsed?.name === 'PaymentContractCreated') {
				const raw = parsed.args.paymentContractId;
				return typeof raw === 'bigint' ? Number(raw) : Number(raw);
			}
		} catch {
			continue;
		}
	}
	throw new Error('PaymentContractCreated event not found in transaction receipt');
}

/**
 * Mark task as bid-accepted + IN_PROGRESS and publish replaceable (kind 31000).
 * Uses NDKTask setters so tags/body stay aligned with the loaded event.
 */
async function publishTaskAcceptedBid(task: NDKTask, bidEventId: string): Promise<void> {
	if (!task.ndk) {
		throw new Error('NDK is required to publish task update');
	}
	task.acceptedBid = bidEventId;
	task.status = TaskStatusEnum.IN_PROGRESS;
	await task.publishReplaceable();
}

/**
 * Escrow creation orchestrator: validate → broadcast → parallel post-hash effects.
 * Does not call `tx.wait()` — the UI should await confirmation, then call `afterConfirmed(receipt)`.
 */
export async function createContract(
	bid: NDKBid,
	task: NDKTask,
	btcPrice: number,
	additionalNotes: string = ''
): Promise<ContractCreationResult> {
	const bidContent = bid.bidContent;
	const taskContent = task.taskContent;
	const taskId = task.tagValue('d') ?? task.id ?? '';

	d.log('createContract start', { taskId, bidId: bid.id });

	try {
		d.log('createContract: deriveContractCreationParams');
		const { params, display } = deriveContractCreationParams(bidContent, btcPrice);
		d.log('createContract: params derived', {
			taskee: params.taskee.slice(0, 10) + '…',
			totalWei: params.totalValueWei.toString().slice(0, 16) + '…',
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime
		});

		const taskeePubkey = bid.author?.pubkey;
		if (!taskeePubkey) {
			return {
				success: false,
				error: 'Could not determine Taskee pubkey from bid'
			};
		}

		const taskerPubkey = (await ndk.signer?.user())?.pubkey;
		if (!taskerPubkey) {
			return {
				success: false,
				error: 'NDK signer not set. Please sign in.'
			};
		}

		d.log('createContract: createPaymentContract (init, gas, staticCall, broadcast)');
		const { tx, estimatedCostFormatted } = await createPaymentContract(params);
		const transactionHash = tx.hash;
		d.log('createContract: broadcast ok — pending confirmation', { transactionHash });

		const taskeeNpub = bid.author?.npub;
		const isRemote = taskContent.taskType === TaskTypeEnum.REMOTE;

		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const paymentContractAddress = getContractAddress();

		const contractEvent = new NDKPaymentContract(ndk);
		contractEvent.author = task.author;
		contractEvent.dTag = taskId; // Contract event shares the same dtag as task event for tracking
		contractEvent.taskId = taskId;
		contractEvent.taskeePubkey = taskeePubkey;
		contractEvent.network = network;
		contractEvent.version = 'v2';
		contractEvent.status = 'pending';
		contractEvent.messageType = 'contract';
		contractEvent.taskTitle = taskContent.title ?? '';
		contractEvent.taskDescription = taskContent.description ?? '';
		contractEvent.amount = display.baseAmount;
		contractEvent.currency = 'RBTC';
		contractEvent.estimatedStartTime = params.estimatedStartTime;
		contractEvent.estimatedCompletionTime = params.estimatedCompletionTime;
		contractEvent.transactionHash = transactionHash;
		contractEvent.contractAddress = paymentContractAddress;

		d.log('createContract: NDK payment contract (kind 30006) prepared', {
			taskDTag: taskId,
			transactionHash
		});

		const publishPromise = contractEvent.publish();

		const dmPromise = sendLocationsToTaskee(
			taskContent.pickupLocation ?? null,
			taskContent.dropOffLocation ?? null,
			taskeePubkey,
			{
				taskId,
				taskTitle: taskContent.title ?? '',
				taskDescription: taskContent.description ?? '',
				isRemote,
				additionalNotes: additionalNotes.trim() || undefined
			}
		);

		const taskUpdatePromise = publishTaskAcceptedBid(task, bid.id);

		const pushPromise = taskeeNpub
			? pushNotificationService.sendNotificationToNpubs({
					npubs: [taskeeNpub],
					title: 'Bid Accepted',
					body: `Your bid on "${taskContent.title ?? 'Task'}" has been accepted`,
					type: 'bid_accepted',
					clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
					icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
				})
			: Promise.resolve();

		const afterBroadcast = runParallelNamed([
			{ name: 'nostrPublish', run: () => publishPromise },
			{ name: 'sendLocations', run: () => dmPromise },
			{ name: 'taskPublishReplaceable', run: () => taskUpdatePromise },
			{ name: 'push', run: () => pushPromise }
		]);

		const afterConfirmed = async (receipt: ethers.TransactionReceipt) => {
			const paymentId = parsePaymentContractCreatedPaymentId(receipt, getContractAddress());
			d.log('createContract: receipt confirmed', { transactionHash, paymentId });
			try {
				await publishPromise;
			} catch (e) {
				d.warn('createContract: initial Nostr publish failed before republish', e);
			}
			// Recreate NDKEvent to decrypt it before updating it and republishing
			const updatedContractEvent = await NDKPaymentContract.from(contractEvent);
			if (updatedContractEvent) {
				updatedContractEvent.paymentId = String(paymentId);
				updatedContractEvent.status = 'confirmed';
				await updatedContractEvent.publishReplaceable();
				d.log('createContract: contract event republished with paymentId', {
					transactionHash,
					paymentId
				});
			}
			return { paymentId };
		};

		return {
			success: true,
			transactionHash,
			estimatedCostFormatted,
			tx,
			afterBroadcast,
			afterConfirmed
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('createContract failed', { taskId }, err);
		return {
			success: false,
			error: err.message
		};
	}
}
