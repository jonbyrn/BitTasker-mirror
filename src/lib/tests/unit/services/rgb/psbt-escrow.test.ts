import { describe, expect, it, vi } from 'vitest';
import {
	broadcastEscrowPsbt,
	buildEscrowPsbt,
	refundEscrow,
	runEscrowSend,
	txidFromSend,
	type EscrowSigner
} from '$lib/services/rgb/psbt-escrow';

function signer(overrides: Partial<EscrowSigner> = {}): EscrowSigner {
	return {
		onchainSendBegin: vi.fn(async () => 'cHNidP-unsigned'),
		signPsbt: vi.fn(async () => 'cHNidP-signed'),
		onchainSendEnd: vi.fn(async () => ({ txid: 'ab'.repeat(32) })),
		...overrides
	};
}

describe('psbt escrow steps', () => {
	it('reads a txid from a send result object or a hex string', () => {
		const txid = 'cd'.repeat(32);
		expect(txidFromSend({ txid })).toBe(txid);
		expect(txidFromSend(`broadcast ${txid} ok`)).toBe(txid);
		expect(txidFromSend({ fee: 2 })).toBe('');
	});

	it('builds, signs, and broadcasts as three calls', async () => {
		const wallet = signer();
		const sent = await runEscrowSend(wallet, {
			assetId: 'rgb:test',
			amount: 10_000,
			invoice: 'rgb:invoice'
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledOnce();
		expect(wallet.signPsbt).toHaveBeenCalledWith('cHNidP-unsigned');
		expect(wallet.onchainSendEnd).toHaveBeenCalledWith({ signedPsbt: 'cHNidP-signed' });
		expect(sent.phase).toBe('awaiting_confirmation');
		expect(sent.txid).toHaveLength(64);
	});

	it('stores the build failure and does not sign', async () => {
		const wallet = signer({
			onchainSendBegin: vi.fn(async () => {
				throw new Error('UTXO not found in the internal database');
			})
		});
		await expect(
			buildEscrowPsbt(wallet, { assetId: 'rgb:test', amount: 1, invoice: 'rgb:invoice' })
		).rejects.toThrow(/internal database/);
		await expect(
			runEscrowSend(wallet, { assetId: 'rgb:test', amount: 1, invoice: 'rgb:invoice' })
		).rejects.toThrow(/internal database/);
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
	});

	it('refunds through a self-invoice on the same wallet', async () => {
		const wallet = {
			...signer(),
			blindReceive: vi.fn(async () => ({ invoice: 'rgb:self-invoice' }))
		};
		const sent = await refundEscrow(wallet, { assetId: 'rgb:test', amount: 10_000 });
		expect(wallet.blindReceive).toHaveBeenCalledOnce();
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ invoice: 'rgb:self-invoice', amount: 10_000 })
		);
		expect(sent.invoice).toBe('rgb:self-invoice');
	});

	it('rejects a broadcast that has no txid', async () => {
		const wallet = signer({ onchainSendEnd: vi.fn(async () => ({ created: 4 })) });
		await expect(broadcastEscrowPsbt(wallet, 'cHNidP-signed')).rejects.toThrow(/txid/);
	});
});
