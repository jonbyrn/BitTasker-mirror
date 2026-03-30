import type { JsonRpcProvider, TransactionReceipt } from 'ethers';
import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';
import { classifyServiceAcceptanceAmbiguityError } from '$lib/utils/service-contract/ambiguity-reason';

export const SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS = 3;
export const SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS = 3_000;
export const SERVICE_ACCEPTANCE_CONFIRMATION_MAX_RETRIES = 60;
export const SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION = 'rsk_rootstock_default_v1';

export class ServiceAcceptanceFinalityError extends Error {
	reasonCode: ServiceAcceptanceUnknownReasonCode;

	constructor(reasonCode: ServiceAcceptanceUnknownReasonCode, message: string) {
		super(message);
		this.reasonCode = reasonCode;
	}
}

export async function getTransactionConfirmationCount(
	receipt: TransactionReceipt | null | undefined
): Promise<number> {
	if (!receipt) {
		return 0;
	}

	const receiptWithConfirmations = receipt as TransactionReceipt & {
		confirmations?: number | (() => Promise<number>);
	};
	if (typeof receiptWithConfirmations.confirmations === 'number') {
		return receiptWithConfirmations.confirmations;
	}
	if (typeof receiptWithConfirmations.confirmations === 'function') {
		return await receiptWithConfirmations.confirmations();
	}

	return 1;
}

export async function waitForServiceAcceptanceFinality(
	provider: JsonRpcProvider,
	transactionHash: string,
	initialReceipt: TransactionReceipt
): Promise<TransactionReceipt> {
	const initialConfirmations = await getTransactionConfirmationCount(initialReceipt);
	if (initialConfirmations >= SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS) {
		return initialReceipt;
	}

	let lastError: unknown = null;

	for (let attempt = 0; attempt < SERVICE_ACCEPTANCE_CONFIRMATION_MAX_RETRIES; attempt += 1) {
		try {
			const nextReceipt = await provider.getTransactionReceipt(transactionHash);
			const confirmations = await getTransactionConfirmationCount(nextReceipt);
			if (nextReceipt && confirmations >= SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS) {
				return {
					...initialReceipt,
					...nextReceipt,
					logs: nextReceipt.logs ?? initialReceipt.logs ?? []
				} as TransactionReceipt;
			}
		} catch (error) {
			lastError = error;
		}

		await new Promise((resolve) =>
			setTimeout(resolve, SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS)
		);
	}

	const reasonCode = classifyServiceAcceptanceAmbiguityError(lastError) ?? 'pending_timeout';
	throw new ServiceAcceptanceFinalityError(
		reasonCode,
		`Service escrow confirmation did not reach the required ${SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS} confirmations.`
	);
}
