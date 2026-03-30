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
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { getProvider, getWallet } from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';
import type {
	CreatePaymentContractParams,
	V2CreationDisplay,
	V2GasEstimateResult,
	V2OrchestratorResult
} from './types';
import { EscrowStatus } from './escrow.enum';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import { GAS_REIMBURSEMENT_PER_OP, CANCELLATION_FEE_MVP, UPFRONT_DEPOSIT_MVP } from './types';
import v2Abi from './abi.json';
import type { NDKBid } from '$lib/nostr/events/bid';
import type { NDKTask } from '$lib/nostr/events/task';
import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const d = createDebug('escrow:v2:creation');

/** Default fee tier (tier 1 = 2.5%) — maps to v1 clientFeeTier/freelancerFeeTier */
const DEFAULT_FEE_TIER = 1;

/** Thrown when derived contract params fail validation (orchestrator maps this to `validationErrors`). */
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
 * Not exported — use {@link deriveContractCreationParams} or {@link deriveV2CreationDisplay}.
 */
function deriveV2BidState(
	bidContent: NostrBidContent,
	btcPrice: number
): { params: CreatePaymentContractParams; display: V2CreationDisplay } {
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

	const cancellationFee = CANCELLATION_FEE_MVP;
	const upfrontDeposit = UPFRONT_DEPOSIT_MVP;

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

	const display: V2CreationDisplay = {
		baseAmount,
		totalAmount: ethers.formatEther(totalValueWei),
		taskerFee: ethers.formatEther(taskerFeeWei),
		taskeeFee: ethers.formatEther(taskeeFeeWei),
		gasReimbursementAmount: ethers.formatEther(gasReimbursementWei),
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
		wasTimeAdjusted,
		taskee,
		taskerFeeTier,
		taskeeFeeTier
	};

	return { params, display };
}

/** Validated `createPaymentContract` arguments only. */
export function deriveContractCreationParams(
	bidContent: NostrBidContent,
	btcPrice: number
): CreatePaymentContractParams {
	return deriveV2BidState(bidContent, btcPrice).params;
}

/** UI display fields only (same inputs as {@link deriveContractCreationParams}). */
export function deriveV2CreationDisplay(
	bidContent: NostrBidContent,
	btcPrice: number
): V2CreationDisplay {
	return deriveV2BidState(bidContent, btcPrice).display;
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
 * Read `paymentId` from mined tx logs (authoritative — not from staticCall).
 */
function parsePaymentContractCreatedPaymentId(
	receipt: ethers.TransactionReceipt,
	v2ContractAddress: string
): number {
	const iface = new ethers.Interface(v2Abi as ethers.InterfaceAbi);
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
 * Configure Kind 30006 on an existing `NDKPaymentContract` instance (same object for `publish()` then later `publishReplaceable()`).
 * `d` tag = task d-tag (NIP-33 replaceable identity). Omit `paymentId` until receipt is known.
 */
function prepareV2NostrPaymentContract(
	ndkPaymentContract: NDKPaymentContract,
	params: {
		taskDTag: string;
		taskeePubkey: string;
		taskTitle: string;
		taskDescription: string;
		amount: string;
		estimatedStartTime: number;
		estimatedCompletionTime: number;
		transactionHash: string;
		taskerPubkey: string;
		/** Set after `tx.wait()` before republish */
		paymentId?: string;
	}
): void {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const contractAddress =
		network === 'mainnet'
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;

	if (!contractAddress) {
		throw new Error(
			`V2 contract address not configured. Set VITE_RSK_CONTRACT_ADDRESS_V2_${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}`
		);
	}

	d.log('prepareV2NostrPaymentContract', {
		taskDTag: params.taskDTag,
		transactionHash: params.transactionHash,
		paymentId: params.paymentId ?? '(pending)'
	});

	(ndkPaymentContract as { pubkey?: string }).pubkey = params.taskerPubkey;

	ndkPaymentContract.dTag = params.taskDTag;
	ndkPaymentContract.taskId = params.taskDTag;
	ndkPaymentContract.taskeePubkey = params.taskeePubkey;
	ndkPaymentContract.network = network;
	ndkPaymentContract.version = 'v2';
	ndkPaymentContract.status = String(EscrowStatus.Funded);
	ndkPaymentContract.messageType = 'contract';

	ndkPaymentContract.taskTitle = params.taskTitle;
	ndkPaymentContract.taskDescription = params.taskDescription;
	ndkPaymentContract.amount = params.amount;
	ndkPaymentContract.currency = 'RBTC';
	ndkPaymentContract.estimatedStartTime = params.estimatedStartTime;
	ndkPaymentContract.estimatedCompletionTime = params.estimatedCompletionTime;
	ndkPaymentContract.transactionHash = params.transactionHash;
	ndkPaymentContract.contractAddress = contractAddress;

	if (params.paymentId !== undefined) {
		ndkPaymentContract.paymentId = params.paymentId;
	} else {
		ndkPaymentContract.removeTag('paymentId');
	}
}

/**
 * Escrow creation orchestrator.
 * Runs: validate → gas → staticCall (revert check only) → broadcast → sideEffects in parallel:
 * Nostr contract publish (tx hash only), DMs, task update, push, and tx.wait + republish with paymentId;
 * `onConfirmed` resolves when the chain receipt yields `paymentId` (same promise as the confirm branch).
 */
export interface CreateEscrowOrchestratorOptions {
	/** Additional notes for the taskee DM (locations/congrats message) */
	additionalNotes?: string;
}

export async function createEscrowFromBidOrchestrator(
	bid: NDKBid,
	task: NDKTask,
	btcPrice: number,
	options?: CreateEscrowOrchestratorOptions
): Promise<V2OrchestratorResult> {
	const additionalNotes = options?.additionalNotes ?? '';
	const bidContent = bid.bidContent;
	const taskContent = task.taskContent;
	const taskId = task.tagValue('d') ?? task.id ?? '';

	d.log('createEscrowFromBidOrchestrator start', { taskId, bidId: bid.id });

	try {
		d.log('orchestrator: step 1 — deriveContractCreationParams');
		const params = deriveContractCreationParams(bidContent, btcPrice);
		d.log('orchestrator: params derived', {
			taskee: params.taskee.slice(0, 10) + '…',
			totalWei: params.totalValueWei.toString().slice(0, 16) + '…',
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime
		});

		d.log('orchestrator: step 2 — check wallet connected');
		const walletState = get(walletStore);
		if (!walletState.rsk.connected) {
			d.warn('orchestrator: wallet not connected');
			return {
				success: false,
				error: 'RSK wallet not connected. Please connect your wallet first.'
			};
		}

		d.log('orchestrator: step 3 — ensureV2ContractReady (wallet + provider + contract)');
		const { contract, provider } = await ensureV2ContractReady();
		const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);
		const createPaymentContract = contract.createPaymentContract;

		d.log('orchestrator: step 4 — estimateGas');
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
		d.log('orchestrator: gas estimate done', {
			gasLimit: gasEstimate.toString(),
			estimatedCostFormatted
		});

		d.log('orchestrator: step 5 — staticCall (revert check only; paymentId not used)');
		await createPaymentContract.staticCall(
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit,
			{ value: params.totalValueWei, gasPrice }
		);
		d.log('orchestrator: staticCall ok');

		d.log('orchestrator: step 5b — Nostr prerequisites before broadcast');
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

		const v2ContractAddress = ethers.getAddress(getV2ContractAddress().toLowerCase());

		d.log('orchestrator: step 6 — broadcast createPaymentContract');
		const tx = await createPaymentContract(
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit,
			{ value: params.totalValueWei, gasPrice }
		);
		const transactionHash = tx.hash;
		d.log('orchestrator: broadcast success — tx hash (pending confirmation)', { transactionHash });

		const taskeeNpub = bid.author?.npub;
		const isRemote = taskContent.taskType === TaskTypeEnum.REMOTE;

		let resolveOnConfirmed!: (value: { paymentId: number }) => void;
		let rejectOnConfirmed!: (reason?: unknown) => void;
		const onConfirmed = new Promise<{ paymentId: number }>((resolve, reject) => {
			resolveOnConfirmed = resolve;
			rejectOnConfirmed = reject;
		});

		const sideEffects = (async () => {
			try {
				const ndkPaymentContract = new NDKPaymentContract(ndk);
				prepareV2NostrPaymentContract(ndkPaymentContract, {
					taskDTag: taskId,
					taskeePubkey,
					taskTitle: taskContent.title ?? '',
					taskDescription: taskContent.description ?? '',
					amount: String(bid.bidContent.amount),
					estimatedStartTime: params.estimatedStartTime,
					estimatedCompletionTime: params.estimatedCompletionTime,
					transactionHash,
					taskerPubkey
				});

				d.log(
					'orchestrator: side effects starting (parallel: publish, DM, task, push, confirm+republish)',
					{
						transactionHash,
						taskDTag: taskId
					}
				);

				const publishPromise = ndkPaymentContract.publish();

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

				const confirmRepublishPromise = (async () => {
					try {
						const receipt = await tx.wait();
						if (!receipt) {
							throw new Error('Transaction receipt not available');
						}
						const paymentId = parsePaymentContractCreatedPaymentId(receipt, v2ContractAddress);
						d.log('orchestrator: tx confirmed', { transactionHash, paymentId });
						resolveOnConfirmed({ paymentId });
						// Avoid mutating tags while the initial `publish()` may still be serializing the same instance.
						try {
							await publishPromise;
						} catch (e) {
							d.warn('orchestrator: initial contract publish failed; continuing to republish', e);
						}
						ndkPaymentContract.paymentId = String(paymentId);
						await ndkPaymentContract.publishReplaceable();
						d.log('orchestrator: contract event republished with paymentId', {
							transactionHash,
							paymentId
						});
					} catch (e) {
						rejectOnConfirmed(e);
						throw e;
					}
				})();

				const results = await Promise.allSettled([
					publishPromise,
					dmPromise,
					taskUpdatePromise,
					pushPromise,
					confirmRepublishPromise
				]);
				results.forEach((r, i) => {
					const names = [
						'publish',
						'sendLocations',
						'taskPublishReplaceable',
						'push',
						'confirmRepublish'
					];
					if (r.status === 'rejected') {
						d.warn(`orchestrator: ${names[i]} failed`, r.reason);
					}
				});
				d.log('orchestrator: side effects settled', { transactionHash });
			} catch (err) {
				rejectOnConfirmed(err);
				throw err;
			}
		})();

		d.log('orchestrator: returning after broadcast', { transactionHash });
		return {
			success: true,
			transactionHash,
			estimatedCostFormatted,
			tx,
			onConfirmed,
			sideEffects
		};
	} catch (error) {
		if (error instanceof ContractCreationParamsError) {
			d.error('validation failed', { validationErrors: error.errors });
			return {
				success: false,
				error: error.message,
				validationErrors: error.errors
			};
		}
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('createEscrowFromBidOrchestrator failed', { taskId }, err);
		return {
			success: false,
			error: err.message
		};
	}
}
