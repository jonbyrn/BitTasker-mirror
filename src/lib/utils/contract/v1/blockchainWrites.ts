/**
 * EscrowContract (v1) writes: estimateGas → staticCall → broadcast with the connected wallet.
 * Direct transactions only — no meta-tx relay (see v2 {@link executeWrite} for relay + fallback).
 *
 * Curated helpers mirror v2 naming where the on-chain method matches (`completeTask`, …) or alias
 * v2 UI names to v1 ABI (`cancelPaymentContract` → `cancelEscrow`, `refundTasker` → `refundClient`).
 */
import type { BigNumberish, ContractTransactionResponse } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import { initContract } from '../index';
import type { ContractChain } from '../types';
import type { GasEstimateResult, WriteTxResult } from '../v2/types';
import abi from './abi.json';

const d = createDebug('contract:v1:writes');

export type { WriteTxResult };

export type ExecuteWriteOptions = {
	method: string;
	args: readonly unknown[];
	overrides?: ethers.Overrides;
	chain?: ContractChain;
	/** Required — legacy EscrowContract has no single global deployment in env. */
	contractAddress: string;
};

/** Optional chain + escrow contract address for curated lifecycle calls. */
export type EscrowWriteOptions = Pick<ExecuteWriteOptions, 'chain' | 'contractAddress'>;

type PreparedWrite = {
	fn: ethers.ContractMethod;
	args: readonly unknown[];
	finalOverrides: ethers.Overrides;
	gasPrice: bigint;
	logPrefix: string;
};

async function prepareWrite(options: ExecuteWriteOptions): Promise<PreparedWrite> {
	const { method, args, overrides: callerOverrides = {}, chain = 'rsk', contractAddress } = options;

	const trimmed = contractAddress?.trim();
	if (!trimmed) {
		throw new Error('contractAddress is required for v1 EscrowContract writes');
	}

	const { contract, provider } = await initContract(trimmed, chain, abi as ethers.InterfaceAbi);
	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || BigInt(0);
	const finalOverrides: ethers.Overrides = { ...callerOverrides, gasPrice };
	const fn = contract.getFunction(method);
	const logPrefix = `escrow.write.${method}`;

	return {
		fn,
		args,
		finalOverrides,
		gasPrice,
		logPrefix
	};
}

/**
 * Same fee + override merging as {@link executeWriteDirect}, but only `estimateGas`.
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
 * estimateGas → staticCall → broadcast. Does not await confirmation.
 */
export async function executeWriteDirect(options: ExecuteWriteOptions): Promise<WriteTxResult> {
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

// --- Lifecycle (uint256 escrowId; nonpayable) ---

export async function completeTask(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'completeTask',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

export async function acceptTask(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'acceptTask',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

export async function resolveAfterTimelock(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'resolveAfterTimelock',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

export async function disputeTask(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'disputeTask',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

/** On-chain `proposeResolution(escrowId, freelancerAmount)` — amount in wei. */
export async function proposeResolution(
	escrowId: BigNumberish,
	freelancerAmountWei: bigint,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'proposeResolution',
		args: [escrowId, freelancerAmountWei],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

export async function acceptProposal(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'acceptProposal',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

/** Maps to on-chain `cancelEscrow`. */
export async function cancelPaymentContract(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'cancelEscrow',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}

/** Maps to on-chain `refundClient`. */
export async function refundTasker(
	escrowId: BigNumberish,
	options: EscrowWriteOptions
): Promise<WriteTxResult> {
	return executeWriteDirect({
		method: 'refundClient',
		args: [escrowId],
		chain: options.chain,
		contractAddress: options.contractAddress
	});
}
