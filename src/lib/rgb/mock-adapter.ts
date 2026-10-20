import {
	assessFullAllocation,
	settleNeedsPartialSend,
	type RgbAllocation,
	type RgbCreditAdapter,
	type SettleLeg,
	type TransferDraft
} from './adapter';

function txidFor(label: string, nonce: number): string {
	const body = `${label}:${nonce}`.padEnd(64, '0');
	return body.slice(0, 64).replace(/[^0-9a-f]/gi, 'a');
}

/**
 * In-memory coins for the beta test ledger.
 * Broadcast moves a whole coin. Settlement may replace one escrow coin with
 * exact legs, which the live adapter is not allowed to do.
 */
export class MockRgbAdapter implements RgbCreditAdapter {
	readonly network = 'mock' as const;
	readonly kind = 'mock' as const;
	private coins: RgbAllocation[] = [];
	private confirmationsByTx = new Map<string, number>();
	private nonce = 1;

	constructor(coins: RgbAllocation[] = []) {
		this.coins = coins.map((coin) => ({ ...coin }));
	}

	snapshot(): { coins: RgbAllocation[]; confirmations: Record<string, number> } {
		const confirmations: Record<string, number> = {};
		for (const [txid, count] of this.confirmationsByTx) confirmations[txid] = count;
		return { coins: this.coins.map((coin) => ({ ...coin })), confirmations };
	}

	restore(coins: RgbAllocation[], confirmations: Record<string, number>): void {
		this.coins = coins.map((coin) => ({ ...coin }));
		this.confirmationsByTx = new Map(Object.entries(confirmations));
	}

	mintExact(owner: string, units: number, assetId: string, id?: string): RgbAllocation {
		const coin: RgbAllocation = {
			id: id ?? `coin-${this.nonce}`,
			assetId,
			owner,
			units
		};
		this.nonce += 1;
		this.coins.push(coin);
		return { ...coin };
	}

	debugConfirm(txid: string, confirmations = 1): void {
		if (!this.confirmationsByTx.has(txid)) throw new Error('Unknown test transaction');
		this.confirmationsByTx.set(txid, confirmations);
	}

	async listAllocations(assetId: string): Promise<RgbAllocation[]> {
		return this.coins.filter((coin) => coin.assetId === assetId).map((coin) => ({ ...coin }));
	}

	async buildFullAllocationTransfer(input: {
		assetId: string;
		allocationId: string;
		units: number;
		invoice: string;
	}): Promise<TransferDraft> {
		const verdict = assessFullAllocation(this.coins, input.allocationId, input.units);
		if (!verdict.ok) throw new Error(verdict.reason);
		const coin = this.coins.find((row) => row.id === input.allocationId);
		if (!coin || coin.assetId !== input.assetId) throw new Error('That coin is not in this wallet');
		return {
			assetId: input.assetId,
			allocationId: input.allocationId,
			units: input.units,
			invoice: input.invoice,
			fullAllocation: true
		};
	}

	validateTransfer(draft: TransferDraft) {
		return assessFullAllocation(this.coins, draft.allocationId, draft.units);
	}

	async broadcast(draft: TransferDraft): Promise<{ txid: string }> {
		const verdict = this.validateTransfer(draft);
		if (!verdict.ok) throw new Error(verdict.reason);
		const recipient = recipientOf(draft.invoice);
		if (!recipient) throw new Error('Invoice does not name a recipient');
		const index = this.coins.findIndex((coin) => coin.id === draft.allocationId);
		const coin = this.coins[index];
		if (!coin) throw new Error('That coin is not in this wallet');
		this.coins[index] = { ...coin, owner: recipient };
		const txid = txidFor('fund', this.nonce);
		this.nonce += 1;
		this.confirmationsByTx.set(txid, 0);
		return { txid };
	}

	async confirmations(txid: string): Promise<number> {
		return this.confirmationsByTx.get(txid) ?? 0;
	}

	async settle(input: {
		assetId: string;
		escrowUnits: number;
		legs: SettleLeg[];
	}): Promise<
		| { ok: true; mode: 'test-ledger' | 'full-allocation'; txids: string[] }
		| { ok: false; reason: 'partial-send-blocked'; detail: string }
	> {
		const escrow = this.coins.find(
			(coin) =>
				coin.assetId === input.assetId &&
				coin.units === input.escrowUnits &&
				coin.owner.startsWith('escrow:')
		);
		if (!escrow)
			return { ok: false, reason: 'partial-send-blocked', detail: 'Escrow coin is missing' };
		if (settleNeedsPartialSend(input.escrowUnits, input.legs)) {
			this.coins = this.coins.filter((coin) => coin.id !== escrow.id);
			const txids: string[] = [];
			for (const leg of input.legs) {
				if (leg.units <= 0) continue;
				const id = `settled-${this.nonce}`;
				this.nonce += 1;
				this.coins.push({
					id,
					assetId: input.assetId,
					owner: leg.owner,
					units: leg.units
				});
				const txid = txidFor('settle', this.nonce);
				this.nonce += 1;
				this.confirmationsByTx.set(txid, 1);
				txids.push(txid);
			}
			return { ok: true, mode: 'test-ledger', txids };
		}
		const leg = input.legs.find((row) => row.units > 0);
		if (!leg || leg.units !== escrow.units) {
			return {
				ok: false,
				reason: 'partial-send-blocked',
				detail: 'The refund is not the whole escrow coin'
			};
		}
		const index = this.coins.findIndex((coin) => coin.id === escrow.id);
		this.coins[index] = { ...escrow, owner: leg.owner };
		const txid = txidFor('refund', this.nonce);
		this.nonce += 1;
		this.confirmationsByTx.set(txid, 1);
		return { ok: true, mode: 'full-allocation', txids: [txid] };
	}
}

export function mockInvoice(pubkey: string, units: number): string {
	return `mock:${pubkey}:${units}`;
}

export function recipientOf(invoice: string): string | null {
	const match = /^mock:([0-9a-f]{64}):(\d+)$/i.exec(invoice.trim());
	return match?.[1]?.toLowerCase() ?? null;
}
