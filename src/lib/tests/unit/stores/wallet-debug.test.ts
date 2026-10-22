import { describe, expect, it, vi } from 'vitest';
import {
	debugReceiveRows,
	formatWalletDebug,
	noteProxyProbe,
	noteWalletOpen,
	noteWalletRefresh,
	noteWalletSnapshot,
	publicWalletDetail,
	resetWalletDebugForTests,
	walletBuildSha,
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
		expect(text).toContain(`build: ${walletBuildSha()}`);
		resetWalletDebugForTests();
	});

	it('keeps the payment txid separate from the blinding coin', () => {
		const seal = 'e7768e06f1b1e7191cac51548f0735b007933ea3979c95608c8d6310d8e0aa49';
		const rows = debugReceiveRows(
			[
				{
					kind: 'ReceiveBlind',
					status: 'WaitingCounterparty',
					recipientId: 'sb:utxob:JQuSjyh9-rest',
					receiveUtxo: { txid: seal }
				},
				{
					kind: 'ReceiveBlind',
					status: 'WaitingCounterparty',
					recipientId: 'sb:utxob:zaH1VFfS-rest',
					txid: 'c1b70c7602c2cba4de67ce4543ca8b62283b96934c12da88c2cadff7e8aa6eb0',
					receiveUtxo: { txid: seal }
				}
			],
			'listTransfers'
		);
		expect(rows[0]?.txid).toBe('');
		expect(rows[0]?.seal).toBe(seal);
		expect(rows[1]?.txid).toBe('c1b70c7602c2cba4de67ce4543ca8b62283b96934c12da88c2cadff7e8aa6eb0');
		expect(rows[1]?.seal).toBe(seal);
		const text = formatWalletDebug(walletDebugSnapshot(rows));
		expect(text).toContain('txid=—');
		expect(text).toContain(`seal=${seal}`);
		expect(text).not.toContain(`txid=${seal}`);
	});

	it('keeps the last refresh after a reload and says when none has run', () => {
		const rows = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => rows.get(key) ?? null,
			setItem: (key: string, value: string) => {
				rows.set(key, value);
			},
			removeItem: (key: string) => {
				rows.delete(key);
			},
			clear: () => rows.clear(),
			key: () => null,
			length: 0
		});
		resetWalletDebugForTests();
		expect(formatWalletDebug(walletDebugSnapshot([]))).toContain('refresh: not run yet');
		noteWalletRefresh(false, 'indexer down');
		noteWalletOpen('Wallet transport auth is missing');
		const saved = rows.get('bittasker.wallet-debug') ?? '';
		expect(saved).toContain('indexer down');
		resetWalletDebugForTests();
		rows.set('bittasker.wallet-debug', saved);
		const text = formatWalletDebug(walletDebugSnapshot([]));
		expect(text).toContain('failed: indexer down');
		expect(text).toContain('open:');
		expect(text).toContain('Wallet transport auth is missing');
		expect(text).not.toContain('refresh: — —');
		resetWalletDebugForTests();
		expect(formatWalletDebug(walletDebugSnapshot([]))).toContain('refresh: not run yet');
		expect(rows.has('bittasker.wallet-debug')).toBe(false);
		vi.unstubAllGlobals();
	});

	it('keeps the snapshot timestamp and size after a reload', () => {
		const rows = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => rows.get(key) ?? null,
			setItem: (key: string, value: string) => {
				rows.set(key, value);
			},
			removeItem: (key: string) => {
				rows.delete(key);
			},
			clear: () => rows.clear(),
			key: () => null,
			length: 0
		});
		resetWalletDebugForTests();
		noteWalletSnapshot('save', '2026-10-22T20:41:00.123Z bytes=48211 stored idb=unavailable');
		noteWalletSnapshot(
			'restore',
			'wallet=2026-10-22T20:30:00Z backup=2026-10-22T20:41:00.123Z bytes=48211 restored newer'
		);
		const saved = rows.get('bittasker.wallet-debug') ?? '';
		resetWalletDebugForTests();
		rows.set('bittasker.wallet-debug', saved);
		const text = formatWalletDebug(walletDebugSnapshot([]));
		expect(text).toContain(
			'snapshot save: 2026-10-22T20:41:00.123Z bytes=48211 stored idb=unavailable'
		);
		expect(text).toContain(
			'snapshot restore: wallet=2026-10-22T20:30:00Z backup=2026-10-22T20:41:00.123Z bytes=48211 restored newer'
		);
		expect(text).not.toContain('rgb:');
		resetWalletDebugForTests();
		vi.unstubAllGlobals();
	});

	it('keeps a refresh error after redacting an invoice', () => {
		expect(publicWalletDetail('resolver down for rgb:~/~/~/secret')).toBe(
			'resolver down for [invoice]'
		);
		expect(publicWalletDetail('nsec1secretvalue')).toBeNull();
	});
});
