/**
 * Direct secure-payment contract writes: gas estimate, optional simulation, broadcast.
 * These functions do not await chain confirmation — callers own `tx.wait()` / receipt parsing.
 */
import type { BigNumberish, ContractTransactionResponse } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import { initContract } from '../index';
import type { ContractChain } from '../types';
import abi from './abi.json';
import { assertValidCreatePaymentContractParams } from './createPaymentContractParams';
import { getSecurePaymentContractAddress } from './contractAddress';
import type {
	CreatePaymentContractParams,
	CreatePaymentContractTxResult,
	GasEstimateResult,
	WriteTxResult
} from './types';

const d = createDebug('contract:v2');

export type { WriteTxResult };

export type ExecuteWriteOptions = {
	/** ABI function name */
	method: string;
	/** Positional arguments (no overrides object). */
	args: readonly unknown[];
	/** Merged with fee overrides; `gasPrice` is always taken from `getFeeData()` last. */
	overrides?: ethers.Overrides;
	chain?: ContractChain;
	/** Defaults to {@link getSecurePaymentContractAddress}. */
	contractAddress?: string;
};

/** Optional chain / contract override for curated payment-contract writes. */
export type SecurePaymentWriteOptions = Pick<ExecuteWriteOptions, 'chain' | 'contractAddress'>;

type PreparedWrite = {
	fn: ethers.ContractMethod;
	args: readonly unknown[];
	finalOverrides: ethers.Overrides;
	gasPrice: bigint;
	logPrefix: string;
};

async function prepareWrite(options: ExecuteWriteOptions): Promise<PreparedWrite> {
	const {
		method,
		args,
		overrides: callerOverrides = {},
		chain = 'rsk',
		contractAddress = getSecurePaymentContractAddress()
	} = options;

	const { contract, provider } = await initContract(
		contractAddress,
		chain,
		abi as ethers.InterfaceAbi
	);
	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || BigInt(0);
	const finalOverrides: ethers.Overrides = { ...callerOverrides, gasPrice };
	const fn = contract.getFunction(method);
	const logPrefix = `contract.write.${method}`;

	return { fn, args, finalOverrides, gasPrice, logPrefix };
}

/**
 * Same fee + override merging as {@link executeWrite}, but only `estimateGas` (no staticCall, no broadcast).
 * Safe for UI preflight; failures return `{ success: false, error }` instead of throwing.
 */
export async function estimateWrite(options: ExecuteWriteOptions): Promise<GasEstimateResult> {
	try {
		const { fn, args, finalOverrides, gasPrice, logPrefix } = await prepareWrite(options);

		const gasEstimate = await fn.estimateGas(...args, finalOverrides);
		const estimatedCostWei = gasEstimate * gasPrice;
		const estimatedCostFormatted = ethers.formatEther(estimatedCostWei);

		d.log(`${logPrefix}: estimateWrite`, {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			estimatedCostWei: estimatedCostWei.toString(),
			estimatedCostFormatted
		});

		return {
			success: true,
			estimatedGas: gasEstimate,
			estimatedCostWei,
			estimatedCostFormatted
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error(`estimateWrite failed (${options.method})`, err);
		return { success: false, error: err.message };
	}
}

/**
 * estimateGas → staticCall → broadcast with identical args and merged overrides.
 * Does not await confirmation.
 */
export async function executeWrite(options: ExecuteWriteOptions): Promise<WriteTxResult> {
	const { fn, args, finalOverrides, gasPrice, logPrefix } = await prepareWrite(options);

	const gasEstimate = await fn.estimateGas(...args, finalOverrides);
	const estimatedCostFormatted = ethers.formatEther(gasEstimate * gasPrice);

	d.log(`${logPrefix}: gas estimate`, {
		gasLimit: gasEstimate.toString(),
		estimatedCostFormatted
	});

	await fn.staticCall(...args, finalOverrides);
	d.log(`${logPrefix}: staticCall ok`);

	const tx = (await fn(...args, finalOverrides)) as ContractTransactionResponse;
	d.log(`${logPrefix}: broadcast`, { hash: tx.hash });

	return { tx, estimatedCostFormatted };
}

/**
 * Validates params, then {@link executeWrite} for `createPaymentContract` (payable).
 */
export async function createPaymentContract(
	params: CreatePaymentContractParams
): Promise<CreatePaymentContractTxResult> {
	assertValidCreatePaymentContractParams(params);

	const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

	return executeWrite({
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

// --- Curated lifecycle writes (uint32 paymentId; nonpayable unless noted) ---

export async function completeTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'completeTask', args: [paymentId], ...options });
}

export async function acceptTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'acceptTask', args: [paymentId], ...options });
}

export async function resolveAfterTimelock(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'resolveAfterTimelock', args: [paymentId], ...options });
}

export async function disputeTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'disputeTask', args: [paymentId], ...options });
}

export async function proposeResolution(
	paymentId: BigNumberish,
	taskeeAmount: bigint,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({
		method: 'proposeResolution',
		args: [paymentId, taskeeAmount],
		...options
	});
}

export async function acceptProposal(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'acceptProposal', args: [paymentId], ...options });
}

export async function cancelPaymentContract(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'cancelPaymentContract', args: [paymentId], ...options });
}

export async function refundTasker(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'refundTasker', args: [paymentId], ...options });
}

export async function markNoShow(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'markNoShow', args: [paymentId], ...options });
}

export async function markWorkInProgress(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'markWorkInProgress', args: [paymentId], ...options });
}

export async function claimNoShowRefund(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'claimNoShowRefund', args: [paymentId], ...options });
}

export async function claimUpfrontDeposit(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'claimUpfrontDeposit', args: [paymentId], ...options });
}
