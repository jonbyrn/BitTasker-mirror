const RGB_AMOUNT_ALPHABET = 'abcdefghkmnABCDEFGHKMNPQRSTVWXYZ';

export interface DecodedRgbInvoice {
	contract: string | null;
	schema: string | null;
	/** Null when the third path segment is `~` (Assignment::Any). */
	amount: number | null;
	seal: string;
	network: string;
	endpoints: string[];
	expiry: number | null;
}

export interface BlindReceiveRow {
	seal: string;
	expiry: number | null;
	txid: string | null;
	status: string;
	invoice: string;
	batch: number | null;
}

/** Little-endian u64, trailing zero bytes removed, base32 with no digits. */
export function encodeRgbAmount(amount: number): string {
	if (!Number.isSafeInteger(amount) || amount < 0) {
		throw new Error('RGB amount is not valid');
	}
	const bytes = new Uint8Array(8);
	let rest = amount;
	for (let index = 0; index < 8; index += 1) {
		bytes[index] = rest % 256;
		rest = Math.floor(rest / 256);
	}
	let length = 1;
	for (let index = 7; index >= 0; index -= 1) {
		if (bytes[index] !== 0) {
			length = index + 1;
			break;
		}
	}
	let buffer = 0;
	let bits = 0;
	let encoded = '';
	for (let index = 0; index < length; index += 1) {
		buffer = (buffer << 8) | bytes[index];
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			encoded += RGB_AMOUNT_ALPHABET[(buffer >> bits) & 31];
		}
	}
	if (bits > 0) encoded += RGB_AMOUNT_ALPHABET[(buffer << (5 - bits)) & 31];
	return encoded;
}

export function decodeRgbAmount(segment: string): number {
	if (!segment || segment === '~') throw new Error('RGB amount is omitted');
	let buffer = 0;
	let bits = 0;
	const bytes: number[] = [];
	for (const char of segment) {
		const index = RGB_AMOUNT_ALPHABET.indexOf(char);
		if (index < 0) throw new Error('RGB amount is not valid');
		buffer = (buffer << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >> bits) & 0xff);
		}
	}
	let amount = 0;
	for (let index = bytes.length - 1; index >= 0; index -= 1) {
		amount = amount * 256 + bytes[index];
	}
	if (!Number.isSafeInteger(amount)) throw new Error('RGB amount is not valid');
	return amount;
}

function absent(segment: string): string | null {
	return segment === '~' ? null : segment;
}

/** Invoice contract segment as an asset id. The `rgb:` scheme is not part of that segment. */
export function contractAssetId(contract: string | null): string {
	const trimmed = contract?.trim() ?? '';
	if (!trimmed) return '';
	return trimmed.startsWith('rgb:') ? trimmed : `rgb:${trimmed}`;
}

/** `rgb:contract/schema/amount/network:utxob:seal`. */
export function decodeRgbInvoice(invoice: string): DecodedRgbInvoice {
	const trimmed = invoice.trim();
	if (!trimmed.startsWith('rgb:')) throw new Error('Tether destination must be an RGB invoice.');
	const [path, query = ''] = trimmed.slice('rgb:'.length).split('?');
	const parts = path.split('/');
	if (parts.length < 4) throw new Error('RGB invoice is not valid');
	const contractRaw = parts[0] ?? '';
	const schemaRaw = parts[1] ?? '';
	const amountRaw = parts[2] ?? '';
	const beneficiary = parts.slice(3).join('/');
	const network = beneficiary.split(':')[0] ?? '';
	const seal = beneficiary.match(/utxob:([^-/?]+)/)?.[1] ?? '';
	if (!network || !seal) throw new Error('RGB invoice is not valid');
	const params = new URLSearchParams(query);
	const expiryRaw = Number(params.get('expiry'));
	const endpoint = params.get('endpoints');
	return {
		contract: absent(contractRaw),
		schema: absent(schemaRaw),
		amount: amountRaw === '~' ? null : decodeRgbAmount(amountRaw),
		seal,
		network,
		endpoints: endpoint ? [endpoint] : [],
		expiry: Number.isFinite(expiryRaw) && expiryRaw > 0 ? expiryRaw : null
	};
}

/**
 * Taskee escrow lock: amount `aa` (0), unnamed contract, Signet (`sb`).
 * A zero invoice on another network or without the RGB proxy is refused.
 * A positive amount returns false so the payer sends that invoice as usual.
 */
export function blankLockInvoice(invoice: string): boolean {
	const decoded = decodeRgbInvoice(invoice);
	if (decoded.amount !== 0 || decoded.contract !== null) return false;
	if (decoded.network !== 'sb') {
		throw new Error('Escrow invoice network must be Signet');
	}
	const endpoint = decoded.endpoints[0] ?? '';
	if (!endpoint.startsWith('rpcs://')) {
		throw new Error('Escrow invoice is missing the RGB proxy');
	}
	return true;
}

function rowRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** ReceiveBlind rows still waiting on a counterparty. Expired seals are ignored. */
export function blindReceiveRows(
	rows: unknown,
	nowSec = Math.floor(Date.now() / 1000)
): BlindReceiveRow[] {
	if (!Array.isArray(rows)) return [];
	const pending: BlindReceiveRow[] = [];
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row) continue;
		if (row.kind !== 'ReceiveBlind' || row.status !== 'WaitingCounterparty') continue;
		const built = receiveRow(row, 'WaitingCounterparty', null);
		if (!built) continue;
		if (built.expiry !== null && built.expiry <= nowSec) continue;
		const txid = typeof row.txid === 'string' && row.txid.length > 0 ? row.txid : null;
		pending.push({ ...built, txid });
	}
	return pending;
}

const CONFIRMING_RECEIVE = new Set(['WaitingConfirmations', 'WaitingSafeHeight']);
const SETTLED_RECEIVE = new Set(['Settled', 'WaitingConfirmations', 'WaitingSafeHeight']);

function invoiceSeal(row: Record<string, unknown>): string {
	const invoice = typeof row.invoiceString === 'string' ? row.invoiceString : '';
	return invoice.match(/utxob:([^-/?]+)/)?.[1] ?? '';
}

function receiveRow(
	row: Record<string, unknown>,
	status: string,
	txid: string | null
): BlindReceiveRow | null {
	const invoice = typeof row.invoiceString === 'string' ? row.invoiceString : '';
	const seal = invoiceSeal(row);
	if (!seal) return null;
	const expiry = typeof row.expiration === 'number' ? row.expiration : null;
	const batch = typeof row.batchTransferIdx === 'number' ? row.batchTransferIdx : null;
	return { seal, expiry, txid, status, invoice, batch };
}

function confirmingRows(rows: readonly unknown[]): BlindReceiveRow[] {
	const confirming: BlindReceiveRow[] = [];
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row || row.kind !== 'ReceiveBlind') continue;
		const status = typeof row.status === 'string' ? row.status : '';
		if (!CONFIRMING_RECEIVE.has(status)) continue;
		const txid = typeof row.txid === 'string' && row.txid.length > 0 ? row.txid : null;
		const built = receiveRow(row, status, txid);
		if (built) confirming.push(built);
	}
	return confirming;
}

/** Waiting receives with no payment yet, including the seal so a cancel can be recognised after reload. */
export function unpaidReceiveMarks(rows: unknown): Array<{ batch: number; seal: string }> {
	if (!Array.isArray(rows)) return [];
	const marks: Array<{ batch: number; seal: string }> = [];
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row || row.kind !== 'ReceiveBlind' || row.status !== 'WaitingCounterparty') continue;
		if (typeof row.txid === 'string' && row.txid.length > 0) continue;
		if (typeof row.batchTransferIdx !== 'number') continue;
		marks.push({ batch: row.batchTransferIdx, seal: invoiceSeal(row) });
	}
	return marks;
}

/** Waiting receives with no payment yet. These are the invoices the UI can cancel. */
export function unpaidReceiveBatches(rows: unknown): number[] {
	if (!Array.isArray(rows)) return [];
	const indexes: number[] = [];
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row || row.kind !== 'ReceiveBlind' || row.status !== 'WaitingCounterparty') continue;
		if (typeof row.txid === 'string' && row.txid.length > 0) continue;
		if (typeof row.batchTransferIdx !== 'number') continue;
		indexes.push(row.batchTransferIdx);
	}
	return [...new Set(indexes)];
}

/**
 * Receives that are not Settled yet.
 * A blank WaitingCounterparty row is dropped once listTransfers has a txid
 * for that seal, or once any receive is already confirming.
 */
export function pendingBlindReceives(
	rows: unknown,
	nowSec = Math.floor(Date.now() / 1000)
): BlindReceiveRow[] {
	if (!Array.isArray(rows)) return [];
	const settled = new Set<string>();
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row || row.kind !== 'ReceiveBlind') continue;
		const status = typeof row.status === 'string' ? row.status : '';
		if (!SETTLED_RECEIVE.has(status)) continue;
		const seal = invoiceSeal(row);
		if (seal) settled.add(seal);
	}
	const confirming = confirmingRows(rows);
	const waiting = blindReceiveRows(rows, nowSec).filter((row) => !settled.has(row.seal));
	if (confirming.length === 0) return waiting;
	return [...confirming, ...waiting.filter((row) => row.txid !== null)];
}
