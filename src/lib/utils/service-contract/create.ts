import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { ethers } from 'ethers';
import { createServiceContractFromSnapshot } from '$lib/utils/service-contract/create-from-snapshot';
import {
	preflightServiceContractCreation,
	revalidateWalletBalance,
	validateNetworkForTransaction,
	type ServiceContractPreflightErrorCode
} from '$lib/utils/service-contract/preflight';
import { escrow } from '$lib/utils/escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import {
	createServiceAcceptanceSnapshot,
	getConfiguredRskChainId,
	getConfiguredRskContractAddress,
	getConfiguredVerificationRpcLabel
} from '$lib/utils/service-contract/acceptance-snapshot';
import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
import { createPaymentContract } from '$lib/utils/contract/v2/blockchainWrites';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';
import { handleEscrowCreated, type EscrowCreatedEvent } from '$lib/utils/escrow/v1/escrowEvents';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';
import type { CreatePaymentContractParams } from '$lib/utils/contract/v2/types';

const DEFAULT_CLIENT_FEE_TIER = 1;

export function normalizePlainRskAddress(address: string): string {
	return ethers.getAddress(address.trim().toLowerCase()).toLowerCase();
}

export interface ServiceContractCreationInput {
	freelancerPubkey: string;
	freelancerAddress: string;
	amountUsdt: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	serviceId: string;
	serviceAddress: string;
	serviceTitle: string;
	serviceDescription?: string;
	contextVersionRef: string;
	purchaseMode: 'quote' | 'instant_buy';
	quoteRequestId?: string;
	proposalId?: string;
	proposalEventId?: string;
	instantOrderId?: string;
	selectedTierId?: string;
	pricingSnapshot: ServiceContractPricingSnapshot;
	agreementSnapshot?: ServiceContractAgreementSnapshot;
	freelancerFeeTier?: 0 | 1 | 2;
}

export type ServiceContractCreationState =
	| 'preflight_failed'
	| 'funding_failed'
	| 'funding_submitted';

export type ServiceContractCreationResult =
	| {
			success: true;
			state: 'funding_submitted';
			transactionHash: string;
			amount: string;
			clientRskAddress: string;
			acceptanceSnapshot: ReturnType<typeof createServiceAcceptanceSnapshot>;
			/** Set if confirmation succeeded and escrowId was resolved */
			escrowId?: string;
			/** True if confirmation failed but transaction was broadcast */
			confirmationFailed?: boolean;
			needsCleanup?: boolean;
			registrationWarning?: string;
	  }
	| {
			success: false;
			state: 'preflight_failed' | 'funding_failed';
			transactionHash?: string;
			amount?: string;
			clientRskAddress?: string;
			acceptanceSnapshot?: ReturnType<typeof createServiceAcceptanceSnapshot>;
			error?: string;
			errorCode?: ServiceContractPreflightErrorCode;
	  };

export async function createServiceContract(
	input: ServiceContractCreationInput
): Promise<ServiceContractCreationResult> {
	console.log('[createServiceContract] ACTION: starting contract creation');
	console.log('[createServiceContract] ACTION: input parameters', {
		freelancerAddress: input.freelancerAddress,
		freelancerPubkey: input.freelancerPubkey?.slice(0, 8) + '...',
		amountUsdt: input.amountUsdt,
		serviceId: input.serviceId,
		serviceAddress: input.serviceAddress,
		purchaseMode: input.purchaseMode,
		freelancerFeeTier: input.freelancerFeeTier
	});

	let transactionHash: string | null = null;
	let amount: string | undefined;
	let clientRskAddress: string | undefined;
	let acceptanceSnapshot: ReturnType<typeof createServiceAcceptanceSnapshot> | undefined;
	const schedule = normalizeServiceContractSchedule(
		input.estimatedStartTime,
		input.estimatedCompletionTime
	);
	console.log('[createServiceContract] SUBACTION: schedule normalized', {
		estimatedStartTime: schedule.estimatedStartTime,
		estimatedCompletionTime: schedule.estimatedCompletionTime
	});

	try {
		console.log('[createServiceContract] ACTION: fetching BTC price from cryptoPriceService');
		const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		console.log('[createServiceContract] RESULT: btcPrice=' + btcPrice);

		console.log('[createServiceContract] ACTION: running preflight validation');
		const preflight = await preflightServiceContractCreation(
			{
				freelancerAddress: input.freelancerAddress,
				freelancerPubkey: input.freelancerPubkey,
				amountUsdt: input.amountUsdt,
				estimatedStartTime: schedule.estimatedStartTime,
				estimatedCompletionTime: schedule.estimatedCompletionTime,
				freelancerFeeTier: input.freelancerFeeTier
			},
			btcPrice
		);
		console.log('[createServiceContract] RESULT: preflight ok=' + preflight.ok);
		if (!preflight.ok) {
			console.log('[createServiceContract] ERROR: preflight failed', {
				errorCode: preflight.errorCode,
				error: preflight.error
			});
			return {
				success: false,
				state: 'preflight_failed',
				error: preflight.error,
				errorCode: preflight.errorCode
			};
		}
		console.log('[createServiceContract] SUBACTION: preflight passed, proceeding', {
			amount: preflight.amount,
			walletAddress: preflight.walletAddress
		});
		amount = preflight.amount;
		clientRskAddress = normalizePlainRskAddress(preflight.walletAddress);
		const freelancerFeeTier = input.freelancerFeeTier ?? 1;

		console.log('[createServiceContract] SUBACTION: building acceptance snapshot', {
			clientRskAddress,
			freelancerRskAddress: input.freelancerAddress,
			weiAmount: ethers.parseEther(amount).toString(),
			btcUsdRateMicros: Math.round(btcPrice * 1_000_000),
			purchaseMode: input.purchaseMode
		});
		acceptanceSnapshot = createServiceAcceptanceSnapshot({
			clientRskAddress,
			clientFeeTier: DEFAULT_CLIENT_FEE_TIER,
			freelancerRskAddress: input.freelancerAddress,
			freelancerFeeTier: input.freelancerFeeTier ?? 1,
			chainId: getConfiguredRskChainId(),
			contractAddress: getConfiguredRskContractAddress(),
			purchaseMode: input.purchaseMode,
			proposalId: input.proposalId,
			instantOrderId: input.instantOrderId,
			btcUsdRateMicros: Math.round(btcPrice * 1_000_000),
			weiAmount: ethers.parseEther(amount).toString(),
			confirmationsAtVerification: 0,
			verificationRpc: getConfiguredVerificationRpcLabel()
		});
		console.log('[createServiceContract] RESULT: acceptance snapshot created');

		console.log('[createServiceContract] ACTION: TOCTOU balance revalidation');
		// TOCTOU protection: re-validate balance before escrow creation
		// Another transaction could have drained funds between preflight and now
		const balanceCheck = await revalidateWalletBalance({
			amountRbtc: amount,
			btcPrice,
			freelancerFeeTier
		});
		console.log('[createServiceContract] RESULT: balance revalidation ok=' + balanceCheck.ok);
		if (!balanceCheck.ok) {
			console.log('[createServiceContract] ERROR: balance check failed - ' + balanceCheck.error);
			return {
				success: false,
				state: 'preflight_failed',
				error: balanceCheck.error,
				errorCode: 'insufficient_funds'
			};
		}
		console.log('[createServiceContract] SUBACTION: balance revalidation passed', {
			currentBalanceWei: balanceCheck.currentBalanceWei?.toString(),
			totalRequiredWei: balanceCheck.totalRequiredWei?.toString()
		});

		console.log('[createServiceContract] ACTION: validating network for transaction');
		// Network change protection: verify network hasn't changed before transaction
		const networkValidation = await validateNetworkForTransaction();
		if (!networkValidation.ok) {
			console.log('[createServiceContract] ERROR: network validation failed', {
				errorCode: networkValidation.errorCode,
				error: networkValidation.error
			});
			return {
				success: false,
				state: 'preflight_failed',
				error: networkValidation.error,
				errorCode: networkValidation.errorCode
			};
		}
		console.log(
			'[createServiceContract] RESULT: network validated, chainId=' + networkValidation.chainId
		);

		// Build V2 createPaymentContract params
		// V2 uses a different fee calculation: baseAmount + taskerFee + 2*gasReimbursement
		console.log('[createServiceContract] ACTION: building V2 params');
		const baseAmountWei = ethers.parseEther(amount);
		const taskerFeePercentage = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER]?.percentage ?? 250;
		const taskeeFeePercentage = FEE_TIERS[freelancerFeeTier]?.percentage ?? 250;
		const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
		const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;
		const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
		const totalValueWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;
		console.log('[createServiceContract] RESULT: V2 fee calculation', {
			baseAmountWei: baseAmountWei.toString(),
			taskerFeeWei: taskerFeeWei.toString(),
			taskeeFeeWei: taskeeFeeWei.toString(),
			gasReimbursementWei: gasReimbursementWei.toString(),
			totalValueWei: totalValueWei.toString()
		});

		const v2Params: CreatePaymentContractParams = {
			taskee: input.freelancerAddress,
			estimatedStartTime: schedule.estimatedStartTime,
			estimatedCompletionTime: schedule.estimatedCompletionTime,
			taskerFeeTier: DEFAULT_CLIENT_FEE_TIER,
			taskeeFeeTier: freelancerFeeTier,
			cancellationFee: 0n,
			upfrontDeposit: 0n,
			totalValueWei,
			baseAmountWei,
			taskerFeeWei,
			taskeeFeeWei
		};
		console.log('[createServiceContract] RESULT: V2 params built', {
			totalValueWei: totalValueWei.toString(),
			baseAmountWei: baseAmountWei.toString(),
			taskerFeeWei: taskerFeeWei.toString(),
			taskeeFeeWei: taskeeFeeWei.toString()
		});

		// Use V2 createPaymentContract for gasless meta-transaction support
		let writeResult;
		try {
			console.log('[createServiceContract] ACTION: calling createPaymentContract');
			writeResult = await createPaymentContract(v2Params);
			console.log('[createServiceContract] RESULT: createPaymentContract returned', {
				txHash: writeResult.tx?.hash ?? 'null'
			});
		} catch (writeError) {
			console.error('[createServiceContract] ERROR: createPaymentContract threw', {
				error: writeError instanceof Error ? writeError.message : String(writeError)
			});
			throw writeError;
		}

		// Check for rejection BEFORE checking hash - hash may exist even when rejected
		if (writeResult.tx === null || writeResult.tx.hash === undefined) {
			console.log('[createServiceContract] ERROR: missing transaction hash');
			return {
				success: false,
				state: 'funding_failed',
				error: 'Transaction failed: Missing transaction hash. Please try again.'
			};
		}

		transactionHash = writeResult.tx.hash;
		console.log('[createServiceContract] RESULT: transaction hash received', {
			transactionHash: transactionHash
		});

		// Register pending contract BEFORE confirmation wait so handleEscrowCreated can find it
		// This mirrors the v1 escrow flow which registers before waiting for confirmation
		console.log('[createServiceContract] SUBACTION: creating pending contract from snapshot');
		console.log('[createServiceContract] ACTION: acceptanceSnapshot fields', {
			clientRskAddress: acceptanceSnapshot.clientRskAddress,
			clientFeeTier: acceptanceSnapshot.clientFeeTier,
			freelancerRskAddress: acceptanceSnapshot.freelancerRskAddress,
			freelancerFeeTier: acceptanceSnapshot.freelancerFeeTier,
			chainId: acceptanceSnapshot.chainId,
			contractAddress: acceptanceSnapshot.contractAddress,
			purchaseMode: acceptanceSnapshot.purchaseMode,
			proposalId: acceptanceSnapshot.proposalId,
			instantOrderId: acceptanceSnapshot.instantOrderId,
			btcUsdRateMicros: acceptanceSnapshot.btcUsdRateMicros,
			weiAmount: acceptanceSnapshot.weiAmount,
			confirmationsAtVerification: acceptanceSnapshot.confirmationsAtVerification,
			verificationRpc: acceptanceSnapshot.verificationRpc
		});
		const pendingContract = createServiceContractFromSnapshot({
			escrowId: 'pending', // Will be updated after confirmation
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress,
			amount,
			estimatedStartTime: schedule.estimatedStartTime,
			estimatedCompletionTime: schedule.estimatedCompletionTime,
			serviceId: input.serviceId,
			serviceAddress: input.serviceAddress,
			serviceTitle: input.serviceTitle,
			serviceDescription: input.serviceDescription,
			contextVersionRef: input.contextVersionRef,
			purchaseMode: input.purchaseMode,
			quoteRequestId: input.quoteRequestId,
			proposalId: input.proposalId,
			proposalEventId: input.proposalEventId,
			instantOrderId: input.instantOrderId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot,
			transactionHash
		});
		const pendingContractWithoutEscrowId = { ...pendingContract };
		delete pendingContractWithoutEscrowId.escrowId;
		let registrationFailed = false;
		let registrationErrorMessage: string | undefined;
		try {
			console.log('[createServiceContract] ACTION: registering pending contract', {
				bidEventId: input.proposalEventId ?? input.instantOrderId ?? input.serviceId,
				transactionHash: transactionHash
			});
			escrow.eventOps.registerPendingContractByTxHash({
				bidEventId: input.proposalEventId ?? input.instantOrderId ?? input.serviceId,
				...pendingContractWithoutEscrowId,
				transactionHash,
				acceptanceSnapshot
			});
			console.log('[createServiceContract] RESULT: registration succeeded');
		} catch (registrationError) {
			registrationFailed = true;
			const contractError = extractContractError(registrationError);
			registrationErrorMessage = contractError.userMessage;
			console.error('[createServiceContract] ERROR: registration failed', registrationError);
			console.log('[createServiceContract] RESULT: registration failed', {
				structuredError: contractError,
				transactionHash: transactionHash
			});
		}

		// V2 does not update the V1 contract creation store automatically.
		// Wait for tx confirmation and update the store so downstream code
		// (e.g. waitForContractCreationByTransactionHash) sees the resolved escrowId.
		let paymentId: string | undefined;
		let confirmationFailed = false;
		try {
			console.log('[createServiceContract] ACTION: waiting for tx confirmation', {
				transactionHash: transactionHash,
				timeout: '60s'
			});
			const { provider } = await ensureEscrowReady(undefined, false);
			// Use 60s timeout to prevent indefinite hangs if tx is dropped/stuck
			const receipt = await provider.waitForTransaction(transactionHash, 1, 60_000);
			console.log('[createServiceContract] RESULT: tx confirmed', {
				receiptStatus: receipt.status ? 'success' : 'failed',
				transactionHash: transactionHash
			});
			console.log(
				'[createServiceContract] RESULT: waitForContractCreationByTransactionHash result',
				{
					confirmationSuccess: receipt.status === 1,
					transactionHash: transactionHash
				}
			);
			paymentId = String(
				parsePaymentContractCreatedPaymentId(receipt, getSecurePaymentContractAddress())
			);
			console.log('[createServiceContract] RESULT: paymentId parsed', { paymentId: paymentId });

			// Update V1 contract creation store with the resolved paymentId (escrowId)
			const contractCreationStore = escrow.eventOps.getContractCreationStore();
			contractCreationStore.set({
				escrowId: paymentId,
				transactionHash: transactionHash.toLowerCase(),
				transactionHashes: [transactionHash.toLowerCase()]
			});
			console.log('[createServiceContract] SUBACTION: V1 store updated with escrowId', {
				escrowId: paymentId
			});
			console.log('[createServiceContract] RESULT: V1 store update success confirmed', {
				escrowId: paymentId,
				transactionHash: transactionHash.toLowerCase()
			});

			// Call handleEscrowCreated to publish Nostr events and reload contract into store
			// This mirrors the behavior of createEscrow() in the v1 bid acceptance flow
			// The pending contract was registered above BEFORE this wait, so handleEscrowCreated can find it
			try {
				console.log(
					'[createServiceContract] ACTION: calling handleEscrowCreated for Nostr publishing'
				);
				const escrowCreatedEvent: EscrowCreatedEvent = {
					escrowId: paymentId,
					transactionHash: transactionHash.toLowerCase(),
					transactionHashes: [transactionHash.toLowerCase()],
					client: clientRskAddress,
					freelancer: input.freelancerAddress,
					amount: amount,
					acceptanceSnapshot
				};
				await handleEscrowCreated(escrowCreatedEvent);
				console.log('[createServiceContract] RESULT: handleEscrowCreated completed successfully');
			} catch (nostrError) {
				// Log but don't fail the contract creation - the blockchain transaction succeeded
				console.error('[createServiceContract] ERROR: handleEscrowCreated failed', {
					error: nostrError instanceof Error ? nostrError.message : String(nostrError),
					escrowId: paymentId
				});
			}
		} catch (confirmationError) {
			const errorMessage =
				confirmationError instanceof Error ? confirmationError.message : String(confirmationError);
			const isTimeout =
				errorMessage.toLowerCase().includes('timeout') ||
				errorMessage.toLowerCase().includes('timed out');
			console.error('[createServiceContract] ERROR: confirmation timeout', {
				error: errorMessage,
				transactionHash: transactionHash,
				waitDurationMs: 60_000,
				txHashExists: !!transactionHash,
				isTimeout
			});
			// Non-fatal: tx was broadcast, user can check wallet
			// Mark as confirmation failed so caller knows escrowId was not resolved
			confirmationFailed = true;
		}

		console.log('[createServiceContract] RESULT: returning success', {
			state: 'funding_submitted',
			transactionHash: transactionHash,
			amount: amount,
			clientRskAddress: clientRskAddress,
			escrowId: paymentId,
			confirmationFailed: confirmationFailed,
			registrationFailed: registrationFailed,
			acceptanceSnapshot: {
				clientRskAddress: acceptanceSnapshot.clientRskAddress,
				clientFeeTier: acceptanceSnapshot.clientFeeTier,
				freelancerRskAddress: acceptanceSnapshot.freelancerRskAddress,
				freelancerFeeTier: acceptanceSnapshot.freelancerFeeTier,
				chainId: acceptanceSnapshot.chainId,
				contractAddress: acceptanceSnapshot.contractAddress,
				purchaseMode: acceptanceSnapshot.purchaseMode,
				proposalId: acceptanceSnapshot.proposalId,
				instantOrderId: acceptanceSnapshot.instantOrderId,
				btcUsdRateMicros: acceptanceSnapshot.btcUsdRateMicros,
				weiAmount: acceptanceSnapshot.weiAmount,
				confirmationsAtVerification: acceptanceSnapshot.confirmationsAtVerification,
				verificationRpc: acceptanceSnapshot.verificationRpc
			}
		});
		return {
			success: true,
			state: 'funding_submitted',
			transactionHash,
			amount,
			clientRskAddress,
			acceptanceSnapshot,
			escrowId: paymentId,
			confirmationFailed,
			needsCleanup: registrationFailed || confirmationFailed,
			registrationWarning: registrationFailed
				? `Registration failed: ${registrationErrorMessage}. Transaction ${transactionHash} may need manual cleanup.`
				: confirmationFailed
					? `Contract confirmation pending. The contract will be ready shortly.`
					: undefined
		};
	} catch (error) {
		console.error('[createServiceContract] ERROR: caught error in outer try block', {
			error: error instanceof Error ? error.message : String(error),
			transactionHash: transactionHash
		});
		if (!transactionHash) {
			return {
				success: false,
				state: 'funding_failed',
				error: extractContractError(error).userMessage,
				errorCode: 'preflight_failed'
			};
		}

		// Transaction exists but follow-up registration failed
		return {
			success: true,
			state: 'funding_submitted',
			transactionHash,
			amount,
			clientRskAddress,
			acceptanceSnapshot,
			needsCleanup: true,
			registrationWarning: 'Transaction mined but registration failed. Cleanup may be required.'
		};
	}
}
