import { describe, expect, it } from 'vitest';
import bitcoinjs, { Psbt, networks, Transaction } from '$lib/shims/bitcoinjs-lib';
import { Psbt as NamedPsbt } from 'bitcoinjs-lib';

describe('bitcoinjs-lib ESM shim', () => {
	it('exposes named Psbt and related CJS bindings', () => {
		expect(typeof Psbt).toBe('function');
		expect(typeof Transaction).toBe('function');
		expect(networks.testnet).toBeTruthy();
		expect(bitcoinjs.Psbt).toBe(Psbt);
		expect(NamedPsbt).toBe(Psbt);
	});
});
