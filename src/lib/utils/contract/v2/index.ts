import type { BigNumberish } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import type { ContractChain, SecurePaymentLegacy } from '../types';
import { initContract } from '../index';
import contractAbi from './abi.json';

export {
	acceptProposal,
	acceptTask,
	cancelPaymentContract,
	claimNoShowRefund,
	claimUpfrontDeposit,
	completeTask,
	createPaymentContract,
	disputeTask,
	estimateWrite,
	executeWrite,
	markNoShow,
	markWorkInProgress,
	proposeResolution,
	refundTasker,
	resolveAfterTimelock,
	type ExecuteWriteOptions,
	type SecurePaymentWriteOptions
} from './blockchainWrites';
export { getSecurePaymentContractAddress } from './contractAddress';
export type { WriteTxResult } from './types';
export {
	CANCELLATION_WINDOW,
	COMPLETION_TIMELOCK,
	computePermittedActions,
	DISPUTE_TIMELOCK,
	DISPUTE_WINDOW,
	GRACE_PERIOD,
	NO_SHOW_RESPONSE_PERIOD,
	PROPOSAL_RESPONSE_PERIOD,
	type ComputePermittedActionsArgs,
	type DisputeProjection,
	type PermittedActions,
	inferParticipantRole,
	isTerminalPaymentState,
	type ParticipantRole,
	type UpfrontDepositContext
} from './permittedActions';

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
