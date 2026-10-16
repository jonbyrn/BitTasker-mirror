import type { Transaction } from './wallet-types';

export interface EscrowHistoryInput {
	contractId: string;
	title: string;
	counterparty?: string;
	kind: 'lock' | 'released' | 'refund' | 'cancelled';
	proof?: string;
	timestamp?: number;
}

const rows: Transaction[] = [];

export function clearEscrowHistory(): void {
	rows.length = 0;
}

export function recordEscrowHistory(input: EscrowHistoryInput): Transaction {
	const type =
		input.kind === 'released'
			? 'escrow_release'
			: input.kind === 'cancelled' || input.kind === 'refund'
				? 'escrow_cancel'
				: 'escrow_lock';
	const description =
		input.kind === 'released'
			? `Payment released · ${input.title}`
			: input.kind === 'refund'
				? `Refund · ${input.title}`
				: input.kind === 'cancelled'
					? `Cancelled · ${input.title}`
					: `Escrow lock · ${input.title}`;
	const row: Transaction = {
		id: `escrow:${input.contractId}:${input.kind}`,
		type,
		amountSats: 0,
		timestamp: input.timestamp ?? Date.now(),
		status: input.kind === 'lock' ? 'pending' : 'confirmed',
		txHash: input.proof,
		counterparty: input.counterparty,
		description
	};
	const index = rows.findIndex((item) => item.id === row.id);
	if (index >= 0) rows[index] = row;
	else rows.push(row);
	return row;
}

export function escrowHistoryEntries(): Transaction[] {
	return rows.map((row) => ({ ...row }));
}
