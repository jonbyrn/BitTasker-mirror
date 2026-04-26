import { sha256 } from '@noble/hashes/sha2';
import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';
import {
	getAcceptanceLedgerEntry,
	upsertAcceptanceLedgerEntry,
	upsertAcceptanceLedgerEntrySync,
	type ServiceAcceptanceLedgerEntry
} from '$lib/utils/service-quote/acceptance-ledger';
import { reconcileServiceAcceptanceState } from '$lib/utils/service-quote/reconciliation';

export interface ServiceProposalAcceptValidationInput {
	proposalId: string;
	quoteRequestId: string;
	serviceId: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	nowSeconds?: number;
	expirationTimestamp: number;
}

export interface ServiceProposalAcceptValidationResult {
	ok: boolean;
	errorCode?: 'expired' | 'invalid_time_bounds';
}

export function validateServiceProposalAcceptance(
	input: ServiceProposalAcceptValidationInput
): ServiceProposalAcceptValidationResult {
	const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

	if (input.estimatedEndTime <= input.estimatedStartTime) {
		return { ok: false, errorCode: 'invalid_time_bounds' };
	}

	if (nowSeconds >= input.expirationTimestamp) {
		return { ok: false, errorCode: 'expired' };
	}

	return { ok: true };
}

export function createServicePurchaseKey(
	mode: 'quote' | 'instant_buy',
	identifier: string
): string {
	return Array.from(
		sha256(
			new TextEncoder().encode(
				`${mode === 'quote' ? 'service-proposal:v1' : 'service-instant-buy:v1'}:${identifier}`
			)
		)
	)
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
}

export function beginServiceProposalAcceptance(
	proposalId: string,
	transactionHash?: string
): ServiceAcceptanceLedgerEntry {
	return upsertAcceptanceLedgerEntrySync(proposalId, 'accepting', { transactionHash });
}

/**
 * Async version of beginServiceProposalAcceptance that uses the mutex-protected
 * upsertAcceptanceLedgerEntry function. This prevents race conditions when
 * multiple rapid calls (e.g., from concurrent UI clicks) could bypass the
 * MAX_LEDGER_ATTEMPTS limit.
 *
 * @throws Error if MAX_LEDGER_ATTEMPTS is exceeded
 */
export async function beginServiceProposalAcceptanceAsync(
	proposalId: string,
	transactionHash?: string
): Promise<ServiceAcceptanceLedgerEntry> {
	return upsertAcceptanceLedgerEntry(proposalId, 'accepting', { transactionHash });
}

export function markServiceProposalAcceptanceUnknown(
	proposalId: string,
	reasonCode: ServiceAcceptanceUnknownReasonCode,
	transactionHash?: string
): ServiceAcceptanceLedgerEntry {
	return upsertAcceptanceLedgerEntrySync(proposalId, 'accept_unknown', {
		reasonCode,
		transactionHash
	});
}

export function completeServiceProposalAcceptance(
	proposalId: string,
	hasVerifiedEscrow: boolean,
	hasPublishFailure = false,
	unknownReasonCode?: ServiceAcceptanceUnknownReasonCode,
	transactionHash?: string
): ServiceAcceptanceLedgerEntry | null {
	const current = getAcceptanceLedgerEntry(proposalId);
	if (!current) {
		return null;
	}

	const nextState = reconcileServiceAcceptanceState({
		ledgerEntry: current,
		hasVerifiedEscrow,
		hasPublishFailure,
		unknownReasonCode
	});

	if (nextState === 'idle') {
		return current;
	}

	return upsertAcceptanceLedgerEntrySync(proposalId, nextState, {
		reasonCode: nextState === 'accept_unknown' ? unknownReasonCode : undefined,
		transactionHash
	});
}
