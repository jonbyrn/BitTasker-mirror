import { signetTxUrl } from '$lib/components/wallet/wallet-formatters';

const SIGNET_TX_PAUSES = [0, 2000, 2000, 2000, 2000] as const;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/** True when UTEXO Signet Esplora already has this transaction. */
export async function esploraHasTx(txid: string): Promise<boolean> {
	const url = signetTxUrl(txid);
	if (!url) return false;
	const response = await fetch(url);
	return response.ok;
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
