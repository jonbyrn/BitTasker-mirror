import { signetTxUrl } from '$lib/components/wallet/wallet-formatters';
import { Psbt } from '$lib/shims/bitcoinjs-lib';

const SIGNET_TX_PAUSES = [0, 2000, 2000, 2000, 2000] as const;
const SIGNET_BROADCAST_URL = 'https://esplora-api.utexo.com/tx';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/** Raw transaction from a signed PSBT. sendEnd's hex is not used in its place. */
export function extractSignedTx(signedPsbt: string): { txid: string; hex: string } {
	const psbt = Psbt.fromBase64(signedPsbt);
	let tx: { toHex(): string; getId(): string };
	try {
		tx = psbt.extractTransaction();
	} catch {
		psbt.finalizeAllInputs();
		tx = psbt.extractTransaction();
	}
	const hex = tx.toHex();
	const txid = tx.getId();
	if (!/^[0-9a-f]{64}$/i.test(txid) || !/^[0-9a-f]+$/i.test(hex)) {
		throw new Error('Signed PSBT did not produce a transaction');
	}
	return { txid, hex };
}

/** POST the raw transaction. A non-OK response is the send error. */
export async function publishSignetTx(rawHex: string): Promise<void> {
	if (!/^[0-9a-f]+$/i.test(rawHex) || rawHex.length < 20) {
		throw new Error('Signed PSBT did not produce a transaction');
	}
	const response = await fetch(SIGNET_BROADCAST_URL, {
		method: 'POST',
		headers: { 'content-type': 'text/plain' },
		body: rawHex
	});
	if (response.ok) return;
	const detail = (await response.text()).trim();
	throw new Error(detail || `Esplora refused the transaction (${response.status})`);
}

/** True when UTEXO Signet Esplora already has this transaction. */
export async function esploraHasTx(txid: string): Promise<boolean> {
	const url = signetTxUrl(txid);
	if (!url) return false;
	const response = await fetch(url);
	return response.ok;
}

/** Whether this output is spent. Null when the indexer cannot answer. */
export async function esploraOutputSpent(
	txid: string,
	vout: number
): Promise<{ spent: boolean; txid?: string } | null> {
	if (!/^[0-9a-f]{64}$/i.test(txid) || !Number.isSafeInteger(vout) || vout < 0) return null;
	const response = await fetch(
		`https://esplora-api.utexo.com/tx/${txid.toLowerCase()}/outspend/${vout}`
	);
	if (!response.ok) return null;
	const body: unknown = await response.json();
	if (!body || typeof body !== 'object') return null;
	const record = body as { spent?: unknown; txid?: unknown };
	if (typeof record.spent !== 'boolean') return null;
	return {
		spent: record.spent,
		txid: typeof record.txid === 'string' ? record.txid : undefined
	};
}

/**
 * A 64-hex sendEnd value is not a send. Esplora must return the transaction.
 * The first look is immediate; later looks cover a broadcast that is still propagating.
 */
export async function confirmSignetTx(
	txid: string,
	probe: (txid: string) => Promise<boolean> = esploraHasTx,
	pauses: readonly number[] = SIGNET_TX_PAUSES
): Promise<void> {
	for (const pause of pauses) {
		if (pause > 0) await sleep(pause);
		try {
			if (await probe(txid)) return;
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] signet lookup failed',
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	throw new Error(`Signet indexer has no transaction ${txid}`);
}
