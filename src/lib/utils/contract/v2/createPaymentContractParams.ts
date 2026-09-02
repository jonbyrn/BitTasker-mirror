import { normalizeRskAddress } from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { MINIMUM_START_BUFFER_SECONDS, type CreatePaymentContractParams } from './types';

/** Thrown when {@link assertValidCreatePaymentContractParams} fails. */
export class ContractCreationParamsError extends Error {
	readonly errors: string[];

	constructor(errors: string[]) {
		super(`Validation failed: ${errors.join(', ')}`);
		this.name = 'ContractCreationParamsError';
		this.errors = errors;
	}
}

export function assertValidCreatePaymentContractParams(
	params: CreatePaymentContractParams,
	/** Current time in seconds. Pass RSK block timestamp for on-chain accuracy; falls back to Date.now(). */
	nowSeconds?: number
): void {
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

	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	if (params.estimatedStartTime < now + MINIMUM_START_BUFFER_SECONDS) {
		errors.push(
			`Estimated start time must be at least ${MINIMUM_START_BUFFER_SECONDS} seconds in the future`
		);
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
