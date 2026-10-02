import { describe, expect, it } from 'vitest';
import {
	blankLockInvoice,
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

	it('accepts the Taskee zero Signet invoice', () => {
		const invoice =
			'rgb:~/~/aa/sb:utxob:6vnJE9Vp-rest?assignment_name=assetOwner&expiry=1790968181&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
		expect(decodeRgbInvoice(invoice).amount).toBe(0);
		expect(decodeRgbInvoice(invoice).network).toBe('sb');
		expect(blankLockInvoice(invoice)).toBe(true);
		expect(blankLockInvoice(NWCA)).toBe(false);
	});

	it('refuses a zero invoice that is not Signet or has no proxy', () => {
		expect(() => blankLockInvoice('rgb:~/~/aa/bc:utxob:seal-rest')).toThrow(
			'Escrow invoice network must be Signet'
		);
		expect(() => blankLockInvoice('rgb:~/~/aa/sb:utxob:seal-rest')).toThrow(
			'Escrow invoice is missing the RGB proxy'
		);
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
