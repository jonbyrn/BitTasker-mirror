import type { Transaction } from './wallet-types';

export interface EscrowHistoryInput {
	contractId: string;
	title: string;
	counterparty?: string;
	kind: 'lock' | 'released' | 'refund' | 'cancelled';
	proof?: string;
	timestamp?: number;
	description?: string;
	amountSats?: number;
	assetUnits?: number;
}

const STORAGE_KEY = 'bittasker.escrow-holds';
const rows: Transaction[] = [];
let hydrated = false;

function storage(): Storage | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage;
}

function hydrate(): void {
	if (hydrated) return;
	hydrated = true;
	const saved = storage()?.getItem(STORAGE_KEY);
	if (!saved) return;
	try {
		const parsed: unknown = JSON.parse(saved);
		if (!Array.isArray(parsed)) return;
		for (const row of parsed) {
			if (!row || typeof row !== 'object') continue;
			const item = row as Partial<Transaction>;
			if (typeof item.id !== 'string' || typeof item.type !== 'string') continue;
			if (rows.some((existing) => existing.id === item.id)) continue;
			rows.push(item as Transaction);
		}
	} catch {
		storage()?.removeItem(STORAGE_KEY);
	}
}

function persist(): void {
	storage()?.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-40)));
}

export function clearEscrowHistory(): void {
	rows.length = 0;
	hydrated = true;
	storage()?.removeItem(STORAGE_KEY);
}

export function closeEscrowHold(contractId: string): void {
	hydrate();
	const id = `escrow:${contractId}:lock`;
	const index = rows.findIndex((item) => item.id === id);
	if (index < 0) return;
	rows[index] = { ...rows[index], status: 'confirmed' };
	persist();
}

export function recordEscrowHistory(input: EscrowHistoryInput): Transaction {
	hydrate();
	const type =
		input.kind === 'released'
			? 'escrow_release'
			: input.kind === 'cancelled' || input.kind === 'refund'
				? 'escrow_cancel'
				: 'escrow_lock';
	const description =
		input.description?.trim() ||
		(input.kind === 'released'
			? `Payment released · ${input.title}`
			: input.kind === 'refund'
				? `Refund · ${input.title}`
				: input.kind === 'cancelled'
					? `Cancelled · ${input.title}`
					: `Escrow lock · ${input.title}`);
	const row: Transaction = {
		id: `escrow:${input.contractId}:${input.kind}`,
		type,
		amountSats: Math.max(0, Math.floor(input.amountSats ?? 0)),
		assetUnits:
			typeof input.assetUnits === 'number' && input.assetUnits > 0
				? Math.floor(input.assetUnits)
				: undefined,
		timestamp: input.timestamp ?? Date.now(),
		status: input.kind === 'lock' ? 'pending' : 'confirmed',
		txHash: input.proof,
		counterparty: input.counterparty,
		description
	};
	const index = rows.findIndex((item) => item.id === row.id);
	if (index >= 0) rows[index] = row;
	else rows.push(row);
	persist();
	return row;
}

export function escrowHistoryEntries(): Transaction[] {
	hydrate();
	return rows.map((row) => ({ ...row }));
}
