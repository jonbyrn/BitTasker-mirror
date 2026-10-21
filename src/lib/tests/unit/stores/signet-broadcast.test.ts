import { describe, expect, it, vi } from 'vitest';
import { networks, Psbt } from 'bitcoinjs-lib';
import {
	confirmSignetTx,
	esploraOutputSpent,
	extractSignedTx,
	publishSignetTx
} from '$lib/stores/wallet/signet-broadcast';

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

function finalizedPsbt(): { base64: string; txid: string; hex: string } {
	const psbt = new Psbt({ network: networks.bitcoin });
	psbt.addInput({
		hash: '11'.repeat(32),
		index: 0,
		witnessUtxo: {
			script: Buffer.from('0014' + '22'.repeat(20), 'hex'),
			value: 5000
		},
		finalScriptWitness: Buffer.from('00', 'hex')
	});
	psbt.addOutput({
		script: Buffer.from('0014' + '33'.repeat(20), 'hex'),
		value: 1000
	});
	const tx = psbt.extractTransaction();
	return { base64: psbt.toBase64(), txid: tx.getId(), hex: tx.toHex() };
}

describe('publishSignetTx', () => {
	it('posts the raw transaction and ignores a sendEnd hash', async () => {
		const signed = finalizedPsbt();
		const extracted = extractSignedTx(signed.base64);
		expect(extracted).toEqual({ txid: signed.txid, hex: signed.hex });
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, status: 200, text: async () => signed.txid });
		vi.stubGlobal('fetch', fetchMock);
		await publishSignetTx(extracted.hex);
		expect(fetchMock).toHaveBeenCalledWith('https://esplora-api.utexo.com/tx', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: extracted.hex
		});
		vi.unstubAllGlobals();
	});

	it('surfaces the Esplora error and does not succeed', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => 'send tx: no inputs'
		});
		vi.stubGlobal('fetch', fetchMock);
		await expect(publishSignetTx('aa'.repeat(20))).rejects.toThrow('send tx: no inputs');
		vi.unstubAllGlobals();
	});
});

describe('esploraOutputSpent', () => {
	it('reads spent and the spending txid', async () => {
		const spentBy = 'cd'.repeat(32);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ spent: true, txid: spentBy })
		});
		vi.stubGlobal('fetch', fetchMock);
		await expect(esploraOutputSpent(txid, 2)).resolves.toEqual({ spent: true, txid: spentBy });
		expect(fetchMock).toHaveBeenCalledWith(`https://esplora-api.utexo.com/tx/${txid}/outspend/2`);
		vi.unstubAllGlobals();
	});

	it('keeps an unconfirmed spend out of a confirmed spent proof', async () => {
		const spentBy = 'ef'.repeat(32);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ spent: true, txid: spentBy, status: { confirmed: false } })
			})
		);
		await expect(esploraOutputSpent(txid, 1)).resolves.toEqual({
			spent: true,
			txid: spentBy,
			confirmed: false
		});
		vi.unstubAllGlobals();
	});

	it('returns null when the indexer does not answer', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(esploraOutputSpent(txid, 3)).resolves.toBeNull();
		await expect(esploraOutputSpent('short', 0)).resolves.toBeNull();
		vi.unstubAllGlobals();
	});
});
