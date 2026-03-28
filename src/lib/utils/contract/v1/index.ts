import type { BigNumberish } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import contractAbi from './abi.json';
import type { ContractChain, SecurePaymentLegacy } from '../types';
import { getWallet, getProvider } from '../index';
import type { InitializedContract, V1PaymentContractRaw } from './types';
const d = createDebug('contract:v1');

/**
 * Ensures wallet + provider for `chain` and returns an ethers Contract at `contractAddress`
 * bound to the signer (same ABI as v1 escrow).
 *
 * @param contractAddress - Required; no implicit default env address.
 * @param chain - Defaults to RSK.
 */
export async function initContract(
	contractAddress: string,
	chain: ContractChain = 'rsk'
): Promise<InitializedContract> {
	const trimmed = contractAddress?.trim();
	if (!trimmed) {
		const err = new Error('Contract address is required');
		d.error('initContract: invalid address', err);
		throw err;
	}

	d.log('initContract: start', { chain, contractAddress: trimmed });

	let checksummed: string;
	try {
		checksummed = ethers.getAddress(trimmed.toLowerCase());
	} catch (e) {
		d.error('initContract: getAddress failed', e);
		throw new Error(`Invalid contract address: ${trimmed}`);
	}

	const [wallet, provider] = await Promise.all([getWallet(chain), getProvider(chain)]);

	const contract = new ethers.Contract(checksummed, contractAbi, wallet);

	d.log('initContract: ready', { chain, checksummed });
	return { contract, wallet, provider };
}

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
		const { contract } = await initContract(contractAddress, chain);
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
