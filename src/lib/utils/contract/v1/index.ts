import type { BigNumberish } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import contractAbi from './abi.json';
import type { ContractChain, SecurePaymentLegacy } from '../types';
import type { V1PaymentContractRaw } from './types';
import { initContract } from '../index';

export type { EscrowWriteOptions, ExecuteWriteOptions, WriteTxResult } from './blockchainWrites';
export {
	acceptProposal,
	acceptTask,
	cancelPaymentContract,
	completeTask,
	disputeTask,
	estimateWrite,
	executeWriteDirect,
	proposeResolution,
	refundTasker,
	resolveAfterTimelock
} from './blockchainWrites';

const d = createDebug('contract:v1');

/**
 * Calls `getEscrow` and returns a plain object (same keys as on-chain struct, numbers not bigint).
 */
export async function loadPaymentContractDetails(
	paymentId: BigNumberish,
	contractAddress: string,
	chain: ContractChain = 'rsk'
): Promise<SecurePaymentLegacy> {
	d.log('loadPaymentContractDetails: start', {
		paymentId: String(paymentId),
		contractAddress,
		chain
	});

	try {
		const { contract } = await initContract(contractAddress, chain, contractAbi);
		const r = (await contract.getEscrow(paymentId)) as V1PaymentContractRaw;
		const plain: SecurePaymentLegacy = {
			tasker: String(r.client ?? ''),
			taskee: String(r.freelancer ?? ''),
			amount: ethers.formatEther(r.amount),
			estimatedStartTime: Number(r.estimatedStartTime),
			estimatedCompletionTime: Number(r.estimatedCompletionTime),
			timelockEnd: Number(r.timelockEnd),
			createdAt: Number(r.createdAt),
			taskerFeeTier: Number(r.clientFeeTier),
			taskeeFeeTier: Number(r.freelancerFeeTier),
			state: Number(r.state),
			noShowMarked: false
		};

		return plain;
	} catch (e) {
		d.error('loadPaymentContractDetails: failed', e);
		throw e;
	}
}
