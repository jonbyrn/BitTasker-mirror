const KEY = 'bittasker.collect-code';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCollectionCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export async function hashCollectionCode(code: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(code.trim().toUpperCase())
	);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readCodes(): Record<string, string> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
		if (!parsed || typeof parsed !== 'object') return {};
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

export function saveCollectionCode(orderId: string, code: string): void {
	if (typeof localStorage === 'undefined') return;
	const next = readCodes();
	next[orderId] = code;
	localStorage.setItem(KEY, JSON.stringify(next));
}

export function readCollectionCode(orderId: string): string {
	return readCodes()[orderId] || '';
}

export function collectByFromDate(value: string): number {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
	const [year, month, day] = value.split('-').map(Number);
	const stamp = Date.UTC(year, month - 1, day, 23, 59, 59);
	if (!Number.isFinite(stamp)) return 0;
	return Math.floor(stamp / 1000);
}
