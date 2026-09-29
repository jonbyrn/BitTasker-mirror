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

function rowRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** ReceiveBlind rows still waiting on a counterparty. */
export function blindReceiveRows(rows: unknown): BlindReceiveRow[] {
	if (!Array.isArray(rows)) return [];
	const pending: BlindReceiveRow[] = [];
	for (const value of rows) {
		const row = rowRecord(value);
		if (!row) continue;
		if (row.kind !== 'ReceiveBlind' || row.status !== 'WaitingCounterparty') continue;
		const invoice = typeof row.invoiceString === 'string' ? row.invoiceString : '';
		const seal = invoice.match(/utxob:([^-/?]+)/)?.[1] ?? '';
		if (!seal) continue;
		const expiry = typeof row.expiration === 'number' ? row.expiration : null;
		const txid = typeof row.txid === 'string' && row.txid.length > 0 ? row.txid : null;
		pending.push({ seal, expiry, txid, status: 'WaitingCounterparty' });
	}
	return pending;
}
