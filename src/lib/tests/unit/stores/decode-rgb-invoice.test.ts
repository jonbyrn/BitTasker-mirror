import { describe, expect, it } from 'vitest';
import {
	blankLockInvoice,
	pendingBlindReceives,
	blindReceiveRows,
	contractAssetId,
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

describe('contractAssetId', () => {
	it('prefixes the invoice contract segment', () => {
		expect(contractAssetId('f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y')).toBe(
			'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y'
		);
		expect(contractAssetId(null)).toBe('');
		expect(contractAssetId('rgb:already')).toBe('rgb:already');
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

	it('shows a confirming receive and drops the unpaid waiting card', () => {
		const waiting =
			'rgb:~/~/nWca/sb:utxob:77UiY8iS-rest?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
		const paid =
			'rgb:~/~/adFZnbk/sb:utxob:otherSeal-rest?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
		expect(
			pendingBlindReceives(
				[
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						invoiceString: waiting,
						expiration: 1790661182,
						txid: null
					},
					{
						kind: 'ReceiveBlind',
						status: 'WaitingConfirmations',
						invoiceString: paid,
						txid: 'c53f8ff2028aa756130eb4db26dca7aa3f11e3fa797631ddfc87812f345ffcbc'
					}
				],
				1790661181
			)
		).toEqual([
			{
				seal: 'otherSeal',
				expiry: null,
				txid: 'c53f8ff2028aa756130eb4db26dca7aa3f11e3fa797631ddfc87812f345ffcbc',
				status: 'WaitingConfirmations'
			}
		]);
	});

	it('hides a waiting invoice once that seal has settled', () => {
		const invoice =
			'rgb:~/~/nWca/sb:utxob:77UiY8iS-rest?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
		expect(
			pendingBlindReceives(
				[
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						invoiceString: invoice,
						expiration: 1790661182,
						txid: null
					},
					{
						kind: 'ReceiveBlind',
						status: 'Settled',
						invoiceString: invoice,
						txid: 'c53f8ff2028aa756130eb4db26dca7aa3f11e3fa797631ddfc87812f345ffcbc'
					}
				],
				1790661181
			)
		).toEqual([]);
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
