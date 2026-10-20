const STORAGE_KEY = 'bittasker.escrow-resume';

export interface EscrowResume {
	contractId: string;
	status: string;
	lockedAmount: number;
	lockedCurrency: 'USD' | 'SATS';
	totalAmountUsd: number;
	contractTitle?: string;
	fundingInvoice?: string;
	settlementInvoice?: string;
	settlementAmount: number;
	workMessage?: string;
	proofUrl?: string;
	partyPubkeys: string[];
	primaryAsset: string;
	primaryPercentage: number;
	secondaryAsset: string;
	secondaryPercentage: number;
	savedAt: number;
}

function readable(value: unknown): value is EscrowResume {
	if (!value || typeof value !== 'object') return false;
	const row = value as Partial<EscrowResume>;
	return (
		typeof row.contractId === 'string' &&
		row.contractId.trim().length > 0 &&
		typeof row.status === 'string' &&
		row.status.trim().length > 0 &&
		typeof row.lockedAmount === 'number' &&
		Number.isFinite(row.lockedAmount) &&
		(row.lockedCurrency === 'USD' || row.lockedCurrency === 'SATS') &&
		typeof row.totalAmountUsd === 'number' &&
		typeof row.primaryAsset === 'string' &&
		typeof row.primaryPercentage === 'number'
	);
}

function readMap(): Record<string, EscrowResume> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		if (!parsed || typeof parsed !== 'object') return {};
		const map: Record<string, EscrowResume> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (readable(value)) map[key] = value;
		}
		return map;
	} catch (error: unknown) {
		console.warn(
			'[escrow-resume] unreadable',
			error instanceof Error ? error.message : String(error)
		);
		return {};
	}
}

export function saveEscrowResume(row: EscrowResume): void {
	if (typeof localStorage === 'undefined' || !readable(row)) return;
	const map = readMap();
	map[row.contractId] = row;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function readEscrowResume(contractId: string): EscrowResume | null {
	const row = readMap()[contractId];
	if (!row || row.contractId !== contractId) return null;
	return row;
}
