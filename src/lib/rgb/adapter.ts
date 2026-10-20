import type { CreditNetwork } from '$lib/credit/types';

export const CREDIT_USDT_ASSET = 'usdt-rgb';

export interface RgbAllocation {
	id: string;
	assetId: string;
	owner: string;
	/** Whole-coin base units. A partial amount is not an allocation id. */
	units: number;
}

export interface FullTransferInput {
	assetId: string;
	allocationId: string;
	units: number;
	invoice: string;
}

export interface TransferDraft {
	assetId: string;
	allocationId: string;
	units: number;
	invoice: string;
	fullAllocation: true;
}

export type TransferValidation = { ok: true } | { ok: false; reason: string };

export interface SettleLeg {
	owner: string;
	units: number;
}

export type SettleResult =
	| { ok: true; mode: 'test-ledger' | 'full-allocation'; txids: string[] }
	| { ok: false; reason: 'partial-send-blocked'; detail: string };

export interface RgbCreditAdapter {
	readonly network: CreditNetwork;
	readonly kind: 'mock' | 'utexo';
	listAllocations(assetId: string): Promise<RgbAllocation[]>;
	buildFullAllocationTransfer(input: FullTransferInput): Promise<TransferDraft>;
	validateTransfer(draft: TransferDraft): TransferValidation;
	broadcast(draft: TransferDraft): Promise<{ txid: string }>;
	confirmations(txid: string): Promise<number>;
	/**
	 * Pay the escrow out. Live RGB refuses when the legs would split one coin.
	 * The test ledger may replace that coin with exact legs.
	 */
	settle(input: { assetId: string; escrowUnits: number; legs: SettleLeg[] }): Promise<SettleResult>;
}

export const PARTIAL_SEND_DETAIL =
	'This beta only sends a whole USDT coin. Sending part of a coin can lose the rest, so the payment was not broadcast.';

/** Refuse any amount that is not the entire allocation. */
export function assessFullAllocation(
	allocations: Pick<RgbAllocation, 'id' | 'units'>[],
	allocationId: string,
	units: number
): TransferValidation {
	if (!Number.isSafeInteger(units) || units <= 0) {
		return { ok: false, reason: 'Amount must be a positive whole number' };
	}
	const row = allocations.find((allocation) => allocation.id === allocationId);
	if (!row) return { ok: false, reason: 'That coin is not in this wallet' };
	if (!Number.isSafeInteger(row.units) || row.units <= 0) {
		return { ok: false, reason: 'That coin has no spendable amount' };
	}
	if (units !== row.units) {
		return { ok: false, reason: PARTIAL_SEND_DETAIL };
	}
	return { ok: true };
}

/**
 * One escrow coin can pay two people only by splitting it.
 * That is the partial send this beta does not broadcast.
 */
export function settleNeedsPartialSend(escrowUnits: number, legs: SettleLeg[]): boolean {
	const positive = legs.filter((leg) => leg.units > 0);
	if (positive.length <= 1) return false;
	const sum = positive.reduce((total, leg) => total + leg.units, 0);
	return sum === escrowUnits && positive.some((leg) => leg.units !== escrowUnits);
}
