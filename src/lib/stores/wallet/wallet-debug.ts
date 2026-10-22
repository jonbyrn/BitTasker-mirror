import { transferUnits } from '$lib/components/wallet/wallet-formatters';

const PROD_HOSTS = new Set(['bittasker.com', 'www.bittasker.com']);

export interface DebugReceive {
	recipientId: string;
	status: string;
	/** Payment txid from the transfer. Empty until a consignment names one. */
	txid: string;
	/** Blinding UTXO. This is not the sender's payment. */
	seal: string;
	assetId: string;
	amount: string;
	source: string;
}

export interface DebugProbe {
	recipientId: string;
	found: boolean;
	validated: boolean | null;
	ack: boolean | null;
	txid: string | null;
	error: string | null;
}

export interface WalletDebugSnapshot {
	refreshedAt: string | null;
	result: string;
	openAt: string | null;
	openResult: string;
	receives: readonly DebugReceive[];
	probes: readonly DebugProbe[];
}

const DEBUG_STORAGE_KEY = 'bittasker.wallet-debug';

interface StoredWalletDebug {
	refreshAt: string | null;
	refreshResult: string;
	openAt: string | null;
	openResult: string;
}

const emptyStored = (): StoredWalletDebug => ({
	refreshAt: null,
	refreshResult: '',
	openAt: null,
	openResult: ''
});

const probes = new Map<string, DebugProbe>();
let refreshedAt: string | null = null;
let refreshResult = '';
let openAt: string | null = null;
let openResult = '';

/** `?debug=1` on sandbox and local hosts. Production hostnames stay dark. */
export function walletDebugEnabled(hostname: string, search: string): boolean {
	const host = hostname.trim().toLowerCase();
	if (!host || PROD_HOSTS.has(host)) return false;
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	return params.get('debug') === '1';
}

export function truncateRecipient(id: string): string {
	const text = id.trim();
	if (!text) return '—';
	if (text.length <= 24) return text;
	return `${text.slice(0, 24)}…`;
}

/** Drop secrets before they reach the page or a toast. Keep the error text. */
export function publicWalletDetail(detail: string | null | undefined): string | null {
	if (!detail) return null;
	let text = detail.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	if (/mnemonic|nsec1|xprv|password/i.test(text)) return null;
	text = text
		.replace(/rgb:[^\s]+/gi, '[invoice]')
		.replace(/\b(consignment|blinding secret|invoice string)\b/gi, '[redacted]');
	if (!text.trim()) return null;
	return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

/** Commit baked into the client at build time. `unknown` in local tests. */
export function walletBuildSha(): string {
	const sha = import.meta.env.VITE_GIT_SHA;
	return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha.trim()) ? sha.trim() : 'unknown';
}

function readStoredDebug(): StoredWalletDebug {
	try {
		if (typeof localStorage === 'undefined') return emptyStored();
		const raw = localStorage.getItem(DEBUG_STORAGE_KEY);
		if (!raw) return emptyStored();
		const parsed = JSON.parse(raw) as Partial<StoredWalletDebug>;
		return {
			refreshAt: typeof parsed.refreshAt === 'string' ? parsed.refreshAt : null,
			refreshResult: typeof parsed.refreshResult === 'string' ? parsed.refreshResult : '',
			openAt: typeof parsed.openAt === 'string' ? parsed.openAt : null,
			openResult: typeof parsed.openResult === 'string' ? parsed.openResult : ''
		};
	} catch {
		return emptyStored();
	}
}

function writeStoredDebug(next: StoredWalletDebug): void {
	try {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// A full or blocked store must not break refresh. The in-memory line still updates.
	}
}

export function noteWalletRefresh(ok: boolean, detail: string | null): void {
	refreshedAt = new Date().toISOString();
	const safe = publicWalletDetail(detail);
	refreshResult = ok ? 'ok' : safe ? `failed: ${safe}` : 'failed';
	const stored = readStoredDebug();
	writeStoredDebug({
		...stored,
		refreshAt: refreshedAt,
		refreshResult
	});
}

/** Last open or unlock failure. Secrets are dropped before they are stored. */
export function noteWalletOpen(detail: string | null): void {
	openAt = new Date().toISOString();
	openResult = publicWalletDetail(detail) ?? 'failed';
	const stored = readStoredDebug();
	writeStoredDebug({
		...stored,
		openAt,
		openResult
	});
}

export function noteProxyProbe(probe: DebugProbe): void {
	const recipientId = probe.recipientId.trim();
	if (!recipientId) return;
	probes.set(recipientId, {
		...probe,
		recipientId,
		error: publicWalletDetail(probe.error)
	});
}

export function proxyProbeSnapshot(): DebugProbe[] {
	return [...probes.values()];
}

export function walletDebugSnapshot(receives: readonly DebugReceive[]): WalletDebugSnapshot {
	const stored = readStoredDebug();
	return {
		refreshedAt: refreshedAt ?? stored.refreshAt,
		result: refreshResult || stored.refreshResult,
		openAt: openAt ?? stored.openAt,
		openResult: openResult || stored.openResult,
		receives,
		probes: proxyProbeSnapshot()
	};
}

export function resetWalletDebugForTests(): void {
	probes.clear();
	refreshedAt = null;
	refreshResult = '';
	openAt = null;
	openResult = '';
	try {
		if (typeof localStorage !== 'undefined') localStorage.removeItem(DEBUG_STORAGE_KEY);
	} catch {
		// The in-memory reset still stands when storage is blocked.
	}
}

function textField(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Receive rows only. Invoice strings and consignment bodies are not copied. */
export function debugReceiveRows(rows: unknown, source: string, knownAssetId = ''): DebugReceive[] {
	if (!Array.isArray(rows)) return [];
	const logged: DebugReceive[] = [];
	for (const value of rows) {
		if (!value || typeof value !== 'object') continue;
		const row = value as Record<string, unknown>;
		const kind = textField(row.kind);
		if (kind !== 'ReceiveBlind' && kind !== 'ReceiveWitness') continue;
		const direct = textField(row.recipientId) || textField(row.recipient_id);
		const assetId = textField(row.assetId) || textField(row.asset_id) || knownAssetId;
		const nested = row.receiveUtxo ?? row.receive_utxo;
		const seal =
			nested && typeof nested === 'object' ? textField((nested as { txid?: unknown }).txid) : '';
		logged.push({
			recipientId: direct,
			status: textField(row.status) || 'unknown',
			// receiveUtxo is the coin the invoice was blinded onto. Copying it into
			// txid made two unpaid invoices look like one payment.
			txid: textField(row.txid),
			seal,
			assetId,
			amount: String(transferUnits(row, true)),
			source
		});
	}
	return logged;
}

export function formatWalletDebug(snapshot: WalletDebugSnapshot): string {
	const refresh =
		snapshot.refreshedAt || snapshot.result
			? `refresh: ${snapshot.refreshedAt ?? '—'} ${snapshot.result || '—'}`
			: 'refresh: not run yet';
	const lines = [`build: ${walletBuildSha()}`, refresh];
	if (snapshot.openAt || snapshot.openResult) {
		lines.push(`open: ${snapshot.openAt ?? '—'} ${snapshot.openResult || '—'}`);
	}
	lines.push('receives:');
	if (snapshot.receives.length === 0) lines.push('- none');
	const probes = new Map(snapshot.probes.map((probe) => [probe.recipientId, probe]));
	for (const row of snapshot.receives) {
		lines.push(
			`- ${truncateRecipient(row.recipientId)} status=${row.status} txid=${row.txid || '—'} seal=${row.seal || '—'} asset=${row.assetId || '—'} amount=${row.amount} source=${row.source}`
		);
		const probe = row.recipientId ? probes.get(row.recipientId) : undefined;
		if (!probe) continue;
		lines.push(
			`  probe found=${probe.found} validated=${probe.validated ?? '—'} ack=${probe.ack ?? '—'}${probe.txid ? ` txid=${probe.txid}` : ''}${probe.error ? ` error=${probe.error}` : ''}`
		);
	}
	return lines.join('\n');
}
