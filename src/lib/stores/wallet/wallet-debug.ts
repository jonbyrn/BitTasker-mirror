import { transferUnits } from '$lib/components/wallet/wallet-formatters';

const PROD_HOSTS = new Set(['bittasker.com', 'www.bittasker.com']);

export interface DebugReceive {
	recipientId: string;
	status: string;
	txid: string;
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
	receives: readonly DebugReceive[];
	probes: readonly DebugProbe[];
}

const probes = new Map<string, DebugProbe>();
let refreshedAt: string | null = null;
let refreshResult = '';

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

/** Drop invoice text, secrets, and long blobs before they reach the page or a toast. */
export function publicWalletDetail(detail: string | null | undefined): string | null {
	if (!detail) return null;
	const text = detail.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	if (/mnemonic|nsec|xprv|password|consignment|blinding|invoice/i.test(text)) return null;
	if (text.includes('rgb:')) return null;
	return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export function noteWalletRefresh(ok: boolean, detail: string | null): void {
	refreshedAt = new Date().toISOString();
	const safe = publicWalletDetail(detail);
	refreshResult = ok ? 'ok' : safe ? `failed: ${safe}` : 'failed';
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
	return {
		refreshedAt,
		result: refreshResult,
		receives,
		probes: proxyProbeSnapshot()
	};
}

export function resetWalletDebugForTests(): void {
	probes.clear();
	refreshedAt = null;
	refreshResult = '';
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
		const nestedTxid =
			nested && typeof nested === 'object' ? textField((nested as { txid?: unknown }).txid) : '';
		logged.push({
			recipientId: direct,
			status: textField(row.status) || 'unknown',
			txid: textField(row.txid) || nestedTxid,
			assetId,
			amount: String(transferUnits(row, true)),
			source
		});
	}
	return logged;
}

export function formatWalletDebug(snapshot: WalletDebugSnapshot): string {
	const lines = [`refresh: ${snapshot.refreshedAt ?? '—'} ${snapshot.result || '—'}`, 'receives:'];
	if (snapshot.receives.length === 0) lines.push('- none');
	const probes = new Map(snapshot.probes.map((probe) => [probe.recipientId, probe]));
	for (const row of snapshot.receives) {
		lines.push(
			`- ${truncateRecipient(row.recipientId)} status=${row.status} txid=${row.txid || '—'} asset=${row.assetId || '—'} amount=${row.amount} source=${row.source}`
		);
		const probe = row.recipientId ? probes.get(row.recipientId) : undefined;
		if (!probe) continue;
		lines.push(
			`  probe found=${probe.found} validated=${probe.validated ?? '—'} ack=${probe.ack ?? '—'}${probe.txid ? ` txid=${probe.txid}` : ''}${probe.error ? ` error=${probe.error}` : ''}`
		);
	}
	return lines.join('\n');
}
