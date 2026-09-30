import { describe, expect, it } from 'vitest';
import {
	blindReceiveRows,
	decodeRgbAmount,
	decodeRgbInvoice,
	encodeRgbAmount
} from '$lib/stores/wallet/decode-rgb-invoice';

const NWCA =
	'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa?assignment_name=assetOwner&expiry=1790661182&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';

describe('decodeRgbAmount', () => {
	it('decodes nWca as 1111 base units', () => {
		expect(decodeRgbAmount('nWca')).toBe(1111);
		expect(encodeRgbAmount(1111)).toBe('nWca');
	});

	it('decodes the documented amount samples', () => {
		expect(decodeRgbAmount('aa')).toBe(0);
		expect(decodeRgbAmount('BF')).toBe(100);
		expect(decodeRgbAmount('adFZnbk')).toBe(100_000_000);
		expect(encodeRgbAmount(100_000_000)).toBe('adFZnbk');
	});
});

describe('decodeRgbInvoice', () => {
	it('reads a blank-contract Signet invoice', () => {
		expect(decodeRgbInvoice(NWCA)).toEqual({
			contract: null,
			schema: null,
			amount: 1111,
			seal: 'rt2mOpmI',
			network: 'sb',
			endpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc'],
			expiry: 1790661182
		});
	});

	it('treats a tilde amount as unconstrained', () => {
		const decoded = decodeRgbInvoice('rgb:~/~/~/sb:utxob:sealTok-rest');
		expect(decoded.amount).toBeNull();
		expect(decoded.contract).toBeNull();
	});
});

describe('blindReceiveRows', () => {
	it('keeps waiting blinded receives', () => {
		expect(
			blindReceiveRows(
				[
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						invoiceString: 'rgb:~/~/nWca/sb:utxob:77UiY8iS-rest',
						expiration: 1790661182,
						txid: null
					},
					{ kind: 'Send', status: 'Settled', invoiceString: 'rgb:~/~/nWca/sb:utxob:other-rest' }
				],
				1790661181
			)
		).toEqual([
			{ seal: '77UiY8iS', expiry: 1790661182, txid: null, status: 'WaitingCounterparty' }
		]);
	});

	it('ignores an expired waiting seal', () => {
		expect(
			blindReceiveRows(
				[
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						invoiceString: 'rgb:~/~/nWca/sb:utxob:70AvntJE-rest',
						expiration: 1790745443,
						txid: null
					}
				],
				1790745444
			)
		).toEqual([]);
	});
});
