export interface AllocationUtxo {
	utxo: { exists: boolean; colorable?: boolean };
	rgbAllocations: unknown[];
	pendingBlinded?: number;
}

export type WalletUtxoKind = 'free' | 'locked' | 'colored' | 'vanilla' | 'receiving';

export interface WalletUtxoRow {
	id: string;
	outpoint: string;
	sats: number;
	colorable: boolean;
	allocations: number;
	pendingBlinded: number;
	kind: WalletUtxoKind;
}

export interface AllocationWallet {
	listUnspents?: () => Promise<AllocationUtxo[]>;
	createUtxos?: (params: {
		upTo?: boolean;
		num?: number;
		size?: number;
		feeRate?: number;
	}) => Promise<number>;
}

const SPLIT_UTXOS = { upTo: true, num: 5, feeRate: 2 } as const;
const ONE_UTXO = { upTo: false, num: 1, feeRate: 2 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function utxoKind(colorable: boolean, allocations: number, pendingBlinded: number): WalletUtxoKind {
	if (pendingBlinded > 0) return 'receiving';
	if (allocations > 0) return 'colored';
	return colorable ? 'free' : 'vanilla';
}

/** Rows safe to render from `listUnspents`. */
export function parseWalletUtxos(rows: unknown): WalletUtxoRow[] {
	if (!Array.isArray(rows)) return [];
	const parsed: WalletUtxoRow[] = [];
	for (const [index, row] of rows.entries()) {
		if (!isRecord(row) || !isRecord(row.utxo) || row.utxo.exists === false) continue;
		const outpoint = isRecord(row.utxo.outpoint) ? row.utxo.outpoint : {};
		const txid = typeof outpoint.txid === 'string' ? outpoint.txid : '';
		const vout = typeof outpoint.vout === 'number' ? outpoint.vout : 0;
		const allocations = Array.isArray(row.rgbAllocations) ? row.rgbAllocations.length : 0;
		const pendingBlinded = typeof row.pendingBlinded === 'number' ? row.pendingBlinded : 0;
		const colorable = row.utxo.colorable === true;
		const sats = typeof row.utxo.btcAmount === 'number' ? row.utxo.btcAmount : 0;
		parsed.push({
			id: txid ? `${txid}:${vout}` : `utxo-${index}`,
			outpoint: txid ? `${txid}:${vout}` : `utxo-${index}`,
			sats,
			colorable,
			allocations,
			pendingBlinded,
			kind: utxoKind(colorable, allocations, pendingBlinded)
		});
	}
	return parsed;
}

/** Colorable UTXOs that can take a new RGB state transition. */
export function freeAllocationCount(unspents: AllocationUtxo[]): number {
	return unspents.filter((row) => {
		if (!row.utxo.exists || row.utxo.colorable !== true) return false;
		if ((row.pendingBlinded ?? 0) > 0) return false;
		return row.rgbAllocations.length === 0;
	}).length;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function allocationsAlreadyAvailable(error: unknown): boolean {
	return errorText(error).includes('Allocations already available');
}

export function isInsufficientAllocations(error: unknown): boolean {
	return errorText(error).toLowerCase().includes('insufficient allocations');
}

function holdsRgb(row: AllocationUtxo): boolean {
	return row.rgbAllocations.length > 0 || (row.pendingBlinded ?? 0) > 0;
}

/**
 * A new colorable output is a bitcoin self-transfer. Never build one from an
 * output that already carries USDT or a waiting receive.
 */
function createParams(
	unspents: AllocationUtxo[]
): { upTo: boolean; num: number; feeRate: number } | null {
	if (freeAllocationCount(unspents) > 0) return null;
	const existing = unspents.filter((row) => row.utxo.exists);
	if (existing.some(holdsRgb)) return null;
	return SPLIT_UTXOS;
}

/** Create uncolored colorable UTXOs when none are free or every UTXO is locked. */
export async function ensureRgbAllocations(wallet: AllocationWallet): Promise<void> {
	if (typeof wallet.createUtxos !== 'function') return;
	const unspents = wallet.listUnspents ? await wallet.listUnspents().catch(() => []) : [];
	const params = createParams(unspents);
	if (!params) return;
	try {
		await wallet.createUtxos(params);
	} catch (error) {
		if (allocationsAlreadyAvailable(error)) return;
		throw error;
	}
}

/** Ensure a free allocation exists, then run the invoice call. Retries once after a forced UTXO. */
export class NeedBitcoinError extends Error {
	constructor() {
		super('Add a little bitcoin first (about $5) to receive dollars');
		this.name = 'NeedBitcoinError';
	}
}

export async function receiveWithAllocations<T>(
	wallet: AllocationWallet,
	receive: () => Promise<T>
): Promise<T> {
	await ensureRgbAllocations(wallet);
	try {
		return await receive();
	} catch (error) {
		if (!isInsufficientAllocations(error) || typeof wallet.createUtxos !== 'function') throw error;
		const unspents = wallet.listUnspents ? await wallet.listUnspents().catch(() => []) : [];
		if (unspents.some(holdsRgb)) throw new NeedBitcoinError();
		await wallet.createUtxos(ONE_UTXO);
		return await receive();
	}
}

/** Sats on outputs that do not carry USDT. Bitcoin sends may use only these. */
export function uncoloredSats(rows: unknown): number {
	return parseWalletUtxos(rows)
		.filter((row) => row.kind === 'free' || row.kind === 'vanilla')
		.reduce((sum, row) => sum + (Number.isFinite(row.sats) ? row.sats : 0), 0);
}
