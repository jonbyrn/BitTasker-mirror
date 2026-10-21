/**
 * Late completion receipts settle after mark-complete has already returned
 * the timeout. Listeners refresh the open contract. The toast binding
 * clears the sticky error without a page reload.
 */

import type { Attachment } from '$lib/types/task';
import type { ContractStatus } from '$lib/utils/contract/types';

export type CompleteSettlement = {
	paymentId: string;
	transactionHash: string;
	phase: 'late_confirmed' | 'late_reverted';
	status?: ContractStatus;
	completionText?: string;
	attachments?: Attachment[];
	pubkey?: string;
};

type SettlementListener = (event: CompleteSettlement) => void;

type ToastBinding = {
	toastId: number;
	dismiss: (toastId: number) => void;
	onRecovered?: () => void;
	onReverted?: () => void;
};

const listeners = new Set<SettlementListener>();
const toastBindings = new Map<string, ToastBinding>();

export function subscribeCompleteSettlement(listener: SettlementListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function trackCompletionErrorToast(
	paymentId: string,
	toastId: number,
	binding: Omit<ToastBinding, 'toastId'>
): void {
	if (!paymentId || toastId < 0) return;
	toastBindings.set(paymentId, { toastId, ...binding });
}

/** Dismiss the timeout toast without the late-success callback. */
export function silenceCompletionErrorToast(paymentId: string): void {
	const binding = toastBindings.get(paymentId);
	if (!binding) return;
	toastBindings.delete(paymentId);
	try {
		binding.dismiss(binding.toastId);
	} catch {
		// The toast store may already have dropped it.
	}
}

export function emitCompleteSettlement(event: CompleteSettlement): void {
	for (const listener of [...listeners]) {
		try {
			listener(event);
		} catch (error) {
			console.log('[complete-task] settlement listener failed', {
				paymentId: event.paymentId,
				message: error instanceof Error ? error.message : 'failed'
			});
		}
	}

	const binding = toastBindings.get(event.paymentId);
	if (!binding) return;
	toastBindings.delete(event.paymentId);
	try {
		binding.dismiss(binding.toastId);
	} catch {
		// ignore
	}
	if (event.phase === 'late_confirmed') binding.onRecovered?.();
	if (event.phase === 'late_reverted') binding.onReverted?.();
}

export function resetCompleteOutcomeForTests(): void {
	listeners.clear();
	toastBindings.clear();
}
