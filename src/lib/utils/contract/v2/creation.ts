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
import { coerceUnixSeconds } from '$lib/utils/helpers/dateFormatter';
import { createDebug } from '$lib/utils/debug';
import {
	GAS_REIMBURSEMENT_PER_OP,
	MINIMUM_START_BUFFER_SECONDS,
	type CreatePaymentContractParams,
	type GasEstimateResult,
	type ContractCreationResult,
	type ContractCreationDisplay
} from '$lib/utils/contract/v2/types';
import { assertValidCreatePaymentContractParams } from './createPaymentContractParams';
import { runParallelNamed } from '../parallelEffects';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import abi from './abi.json';
import type { NDKBid } from '$lib/nostr/events/bid';
import type { NDKTask } from '$lib/nostr/events/task';
import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { createPaymentContract, estimateWrite } from './blockchainWrites';
import { getSecurePaymentContractAddress } from './contractAddress';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
import { getProvider, getWallet } from '$lib/utils/contract';
import {
	FundEscrowTimeoutError,
	decideFundRetry,
	isFundSendInFlight,
	loadFundGuardSnapshot,
	logFundEscrow,
	readFundAttempt,
	rememberFundAttempt
} from './fundEscrowGuard';

const d = createDebug('contract:v2');

/** Default fee tier (tier 1 = 2.5%) — maps to v1 clientFeeTier/freelancerFeeTier */
const DEFAULT_FEE_TIER = 1;

export { ContractCreationParamsError } from './createPaymentContractParams';

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

/**
 * Single derivation pass: validates inputs, builds contract params, validates params, builds display.
 * Not exported — use {@link deriveContractCreationParams}.
 */
export function deriveContractCreationParams(
	bidContent: NostrBidContent,
	btcPrice: number,
	/** Current time in seconds. Pass RSK block timestamp for on-chain accuracy; falls back to Date.now(). */
	nowSeconds?: number,
	/** Poster-chosen start. Used when the bid start is inside the 5 minute funding buffer. */
	startOverrideSeconds?: number
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

	if (bidContent.startDateTime != null && bidContent.endDateTime != null) {
		const startSeconds = coerceUnixSeconds(bidContent.startDateTime);
		const endSeconds = coerceUnixSeconds(bidContent.endDateTime);
		if (startSeconds != null && endSeconds != null) {
			startTime = startSeconds;
			completionTime = endSeconds;
		} else {
			startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
			completionTime = startTime + 3600;
		}
	} else {
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = startTime + 3600;
	}

	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	let wasTimeAdjusted = false;
	const originalStart = startTime;

	if (startOverrideSeconds != null) {
		startTime = startOverrideSeconds;
		wasTimeAdjusted = startTime !== originalStart;
	} else if (startTime < now + MINIMUM_START_BUFFER_SECONDS) {
		startTime = now + MINIMUM_START_BUFFER_SECONDS;
		wasTimeAdjusted = true;
	}

	if (completionTime <= startTime) {
		throw new Error(
			'Completion time must be after start time. The task window is too short to create a contract with the required safety buffer.'
		);
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

	assertValidCreatePaymentContractParams(params, nowSeconds);

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
 * Estimate gas for createPaymentContract. Call when form opens to show network fee before submit.
 * Requires wallet connected. Safe to call; returns error result instead of throwing.
 */
export async function estimateGasForCreatePaymentContract(
	params: CreatePaymentContractParams
): Promise<GasEstimateResult> {
	const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

	return estimateWrite({
		method: 'createPaymentContract',
		args: [
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit
		],
		overrides: { value: params.totalValueWei }
	});
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
 * Read `paymentId` from mined tx logs (authoritative — not from staticCall).
 */
export function parsePaymentContractCreatedPaymentId(
	receipt: ethers.TransactionReceipt,
	contractAddress: string
): number {
	const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
	const expected = contractAddress.toLowerCase();
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
 * Mark kind 31000 task bid-accepted + IN_PROGRESS and publish replaceable (kind 31000).
 * Uses NDKTask setters so tags/body stay aligned with the loaded event.
 * @param adjustedStartTimeSeconds - If the contract start time was adjusted by the safety buffer,
 *   the task's `dateRange.start` is updated to match (ISO string, unix → Date → ISO).
 */
async function publishTaskAcceptedBid(
	task: NDKTask,
	bidEventId: string,
	adjustedStartTimeSeconds?: number
): Promise<void> {
	if (!task.ndk) {
		throw new Error('NDK is required to publish task update');
	}
	task.acceptedBid = bidEventId;
	task.status = TaskStatusEnum.IN_PROGRESS;

	if (adjustedStartTimeSeconds != null) {
		const body = task.taskContent;
		if (body.dateRange) {
			body.dateRange.start = new Date(adjustedStartTimeSeconds * 1000).toISOString();
		} else {
			body.dateRange = {
				start: new Date(adjustedStartTimeSeconds * 1000).toISOString(),
				end: ''
			};
		}
		task.content = JSON.stringify(body);
	}

	await task.publishReplaceable();
}

/**
 * Mark kind 31000 task **COMPLETED** (replaceable) after tasker accepts work / funds released.
 * Same pattern as {@link publishTaskAcceptedBid}; task event is owned by the tasker.
 */
export async function publishTaskCompletedForEscrow(task: NDKTask): Promise<void> {
	if (!task.ndk) {
		task.ndk = ndk;
	}
	if (!task.ndk) {
		throw new Error('NDK is required to publish task update');
	}
	task.status = TaskStatusEnum.COMPLETED;
	await task.publishReplaceable();
}

/**
 * Escrow creation orchestrator: validate → broadcast.
 * Does not call `tx.wait()`. The UI should show the tx hash, await confirmation,
 * then call `afterConfirmed(receipt)`. Nostr contract, bid acceptance, and the
 * task's in-progress status are written only inside `afterConfirmed`.
 */
export async function createContract(
	bid: NDKBid,
	task: NDKTask,
	btcPrice: number,
	additionalNotes: string = '',
	startOverrideSeconds?: number
): Promise<ContractCreationResult> {
	const bidContent = bid.bidContent;
	const taskContent = task.taskContent;
	const taskId = task.tagValue('d') ?? task.id ?? '';

	d.log('createContract start', { taskId, bidId: bid.id });

	try {
		d.log('createContract: deriveContractCreationParams');
		// Use RSK block timestamp for the safety buffer to avoid client/miner clock skew
		let blockTimestampSeconds: number | undefined;
		try {
			const provider = await getProvider('rsk');
			const latestBlock = await provider.getBlock('latest');
			if (latestBlock) blockTimestampSeconds = latestBlock.timestamp;
		} catch (e) {
			d.warn('createContract: failed to fetch block timestamp, falling back to Date.now()', e);
		}
		const { params, display } = deriveContractCreationParams(
			bidContent,
			btcPrice,
			blockTimestampSeconds,
			startOverrideSeconds
		);
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
		const wallet = await getWallet('rsk');
		const sender = ethers.getAddress(await wallet.getAddress());
		const fundingProvider = await getProvider('rsk');
		const snapshot = await loadFundGuardSnapshot({
			reader: fundingProvider,
			attempt: readFundAttempt(taskId),
			localSendInFlight: isFundSendInFlight(taskId)
		});
		const decision = decideFundRetry(snapshot);
		logFundEscrow('guard', {
			taskId,
			sender,
			action: decision.action,
			...(decision.action === 'block' ? { reason: decision.reason } : {})
		});
		if (decision.action === 'block') {
			return {
				success: false,
				error: decision.reason,
				errorCode: decision.reason
			};
		}

		const nonce = await fundingProvider.getTransactionCount(sender, 'pending');
		const fromBlock = await fundingProvider.getBlockNumber();
		rememberFundAttempt(taskId, {
			sender,
			nonce,
			txHash: null,
			contractAddress: getSecurePaymentContractAddress(),
			fromBlock,
			taskee: params.taskee.toLowerCase()
		});

		let tx: Awaited<ReturnType<typeof createPaymentContract>>['tx'];
		let estimatedCostFormatted: string;
		try {
			const sent = await createPaymentContract(params, { fundTaskId: taskId, nonce });
			tx = sent.tx;
			estimatedCostFormatted = sent.estimatedCostFormatted;
		} catch (sendError) {
			if (sendError instanceof FundEscrowTimeoutError) {
				logFundEscrow('timeout', { taskId, sender, nonce });
				return {
					success: false,
					error: sendError.message,
					errorCode: 'timeout'
				};
			}
			throw sendError;
		}
		const transactionHash = tx.hash;
		d.log('createContract: broadcast ok — pending confirmation', { transactionHash });

		const isRemote = taskContent.taskType === TaskTypeEnum.REMOTE;

		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const paymentContractAddress = getSecurePaymentContractAddress();

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

		// Nothing is written to Nostr until the funding transaction confirms.
		const afterBroadcast = runParallelNamed([]);
		const statusBeforeFunding = task.status;
		const contentBeforeFunding = task.content;
		const acceptedBidBeforeFunding = task.acceptedBid;
		let contractPublished = false;

		const afterConfirmed = async (receipt: ethers.TransactionReceipt) => {
			if (receipt.status === 0) {
				d.warn('createContract: tx reverted on-chain', { transactionHash });
				throw new Error('Transaction reverted on-chain');
			}
			const paymentId = parsePaymentContractCreatedPaymentId(
				receipt,
				getSecurePaymentContractAddress()
			);
			d.log('createContract: receipt confirmed', { transactionHash, paymentId });

			contractEvent.paymentId = String(paymentId);
			contractEvent.status = 'confirmed';
			await contractEvent.publish();
			contractPublished = true;
			d.log('createContract: contract event published after confirmation', {
				transactionHash,
				paymentId
			});

			await publishTaskAcceptedBid(
				task,
				bid.id,
				display.wasTimeAdjusted ? params.estimatedStartTime : undefined
			);

			try {
				await sendLocationsToTaskee(
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
			} catch (e) {
				d.warn('createContract: location message failed after confirmation', e);
			}

			try {
				await sendBidStatusUpdate(
					bid.id,
					taskId,
					taskeePubkey,
					BidStatusEnum.ACCEPTED,
					undefined,
					undefined,
					transactionHash
				);
			} catch (e) {
				d.warn('createContract: bid status update failed after confirmation', e);
			}

			try {
				await notificationCenterService.enrich({
					action: 'contract_created',
					escrowId: String(paymentId),
					bidEventId: bid.id,
					taskId,
					recipientNpub: taskeePubkey,
					estimatedStartTime: params.estimatedStartTime,
					amount: display.baseAmount?.toString(),
					taskTitle: taskContent.title ?? undefined
				});
			} catch (e) {
				d.warn('createContract: enrichment failed (non-blocking)', e);
			}

			return { paymentId };
		};

		const afterFailed = async (txHash: string): Promise<void> => {
			d.log('createContract: afterFailed cleanup', { txHash, contractPublished });

			if (contractPublished) {
				const failedContractEvent = await NDKPaymentContract.from(contractEvent);
				if (failedContractEvent) {
					failedContractEvent.status = 'failed';
					await failedContractEvent.publishReplaceable();
					d.log('createContract: contract event republished with status failed', { txHash });
				}
			}

			const taskMoved =
				task.status !== statusBeforeFunding || task.content !== contentBeforeFunding;
			if (!taskMoved) return;

			try {
				task.content = contentBeforeFunding;
				task.status = statusBeforeFunding;
				if (acceptedBidBeforeFunding) {
					task.acceptedBid = acceptedBidBeforeFunding;
				} else {
					task.tags = task.tags.filter((tag) => tag[0] !== 'acceptedBid');
				}
				await task.publishReplaceable();
				d.log('createContract: task restored to pre-funding state', { txHash });
			} catch (e) {
				d.warn('createContract: failed to revert task status', e);
			}
		};

		return {
			success: true,
			transactionHash,
			estimatedCostFormatted,
			tx,
			afterBroadcast,
			afterConfirmed,
			afterFailed
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
