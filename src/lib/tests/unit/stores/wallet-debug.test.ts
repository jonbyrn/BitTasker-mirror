import { describe, expect, it } from 'vitest';
import {
	debugReceiveRows,
	formatWalletDebug,
	noteProxyProbe,
	noteWalletRefresh,
	resetWalletDebugForTests,
	walletDebugEnabled,
	walletDebugSnapshot
} from '$lib/stores/wallet/wallet-debug';

describe('wallet debug readout', () => {
	it('stays off on production and on when sandbox asks for it', () => {
		expect(walletDebugEnabled('bittasker.com', '?debug=1')).toBe(false);
		expect(walletDebugEnabled('www.bittasker.com', '?debug=1')).toBe(false);
		expect(walletDebugEnabled('rgb.bittasker.com', '?debug=1')).toBe(true);
		expect(walletDebugEnabled('rgb.bittasker.com', '')).toBe(false);
		expect(walletDebugEnabled('localhost', '?debug=1')).toBe(true);
	});

	it('copies receive status without the invoice or consignment', () => {
		resetWalletDebugForTests();
		noteWalletRefresh(false, 'Something went wrong. Tap to reopen.');
		noteProxyProbe({
			recipientId: 'sb:utxob:9RcSoRL7-AWe6bAY-secret-tail',
			found: true,
			validated: true,
			ack: true,
			txid: 'e16f7bcd',
			error: null
		});
		const rows = debugReceiveRows(
			[
				{
					kind: 'ReceiveBlind',
					status: 'Failed',
					recipientId: 'sb:utxob:9RcSoRL7-AWe6bAY-secret-tail',
					txid: 'e16f7bcd',
					invoiceString: 'rgb:~/~/~/sb:utxob:SECRET?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc',
					consignment: 'not-for-the-page'
				}
			],
			'listTransfers'
		);
		const text = formatWalletDebug(walletDebugSnapshot(rows));
		expect(text).toContain('status=Failed');
		expect(text).toContain('found=true');
		expect(text).toContain('validated=true');
		expect(text).toContain('ack=true');
		expect(text).toContain('sb:utxob:9RcSoRL7-AWe6bA…');
		expect(text).not.toContain('SECRET');
		expect(text).not.toContain('invoice');
		expect(text).not.toContain('consignment');
		expect(text).not.toContain('rpcs://');
		resetWalletDebugForTests();
	});
});
