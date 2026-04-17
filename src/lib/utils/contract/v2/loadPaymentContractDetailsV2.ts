import type { BigNumberish } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import type { ContractChain, SecurePaymentLegacy } from '../types';
import { initContract } from '../index';
import contractAbi from './abi.json';

const d = createDebug('contract:v2');

type V2PaymentContractRaw = {
	tasker: string;
	taskee: string;
	amount: bigint;
	state: number;
	taskerFeeTier: number;
	taskeeFeeTier: number;
	createdAt: number;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	timelockEnd: number;
	noShowMarked: boolean;
};

/**
 * Calls `getPaymentContract` and normalizes to legacy-compatible shape.
 */
export async function loadPaymentContractDetailsV2(
	paymentId: BigNumberish,
	contractAddress: string,
	chain: ContractChain = 'rsk'
): Promise<SecurePaymentLegacy> {
	d.log('loadPaymentContractDetailsV2: start', {
		paymentId: String(paymentId),
		contractAddress,
		chain
	});

	try {
		const { contract } = await initContract(contractAddress, chain, contractAbi);
		const r = (await contract.getPaymentContract(paymentId)) as V2PaymentContractRaw;
		const plain: SecurePaymentLegacy = {
			tasker: String(r.tasker ?? ''),
			taskee: String(r.taskee ?? ''),
			amount: ethers.formatEther(r.amount),
			estimatedStartTime: Number(r.estimatedStartTime),
			estimatedCompletionTime: Number(r.estimatedCompletionTime),
			timelockEnd: Number(r.timelockEnd),
			createdAt: Number(r.createdAt),
			taskerFeeTier: Number(r.taskerFeeTier),
			taskeeFeeTier: Number(r.taskeeFeeTier),
			state: Number(r.state),
			noShowMarked: Boolean(r.noShowMarked)
		};

		return plain;
	} catch (e) {
		d.error('loadPaymentContractDetailsV2: failed', e);
		throw e;
	}
}
