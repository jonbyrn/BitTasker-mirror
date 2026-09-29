import { describe, expect, it, vi } from 'vitest';
import { confirmSignetTx } from '$lib/stores/wallet/signet-broadcast';

const txid = 'ab'.repeat(32);

describe('confirmSignetTx', () => {
	it('accepts the first indexer hit', async () => {
		const probe = vi.fn().mockResolvedValue(true);
		await confirmSignetTx(txid, probe, [0, 0]);
		expect(probe).toHaveBeenCalledTimes(1);
		expect(probe).toHaveBeenCalledWith(txid);
	});

	it('retries a miss and then accepts', async () => {
		const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		await confirmSignetTx(txid, probe, [0, 0]);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it('rejects when the indexer never has the transaction', async () => {
		const probe = vi.fn().mockResolvedValue(false);
		await expect(confirmSignetTx(txid, probe, [0, 0])).rejects.toThrow(
			`Signet indexer has no transaction ${txid}`
		);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it('asks Esplora for the txid and treats 404 as missing', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
		vi.stubGlobal('fetch', fetchMock);
		await expect(confirmSignetTx(txid, undefined, [0])).rejects.toThrow(
			`Signet indexer has no transaction ${txid}`
		);
		expect(fetchMock).toHaveBeenCalledWith(`https://esplora-api.utexo.com/tx/${txid}`);
		vi.unstubAllGlobals();
	});
});
