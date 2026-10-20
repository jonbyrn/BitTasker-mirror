import { describe, expect, it, vi } from 'vitest';
import { networks, Psbt } from 'bitcoinjs-lib';
import {
	assertChangeReturns,
	broadcastEscrowPsbt,
	buildEscrowPsbt,
	changeOutputMissing,
	readSendEconomics,
	refundEscrow,
	runEscrowSend,
	keptSendProof,
	openPayoutTxid,
	sentInvoiceTxid,
	txidFromSend,
	type EscrowSigner
} from '$lib/services/rgb/psbt-escrow';

describe('sent invoice', () => {
	const invoice = 'rgb:~/~/aa/sb:utxob:priced-send?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
	const txid = 'ab'.repeat(32);

	it('returns the txid of a send that already left for this invoice', () => {
		expect(
			sentInvoiceTxid(
				[
					{ kind: 'Send', status: 'Failed', invoiceString: invoice, txid: 'cd'.repeat(32) },
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						invoiceString: `${invoice}&extra=1`,
						txid
					}
				],
				invoice
			)
		).toBe(txid);
	});

	it('picks up one unconfirmed payout when the invoice text is gone', () => {
		const txid = 'ef'.repeat(32);
		expect(
			openPayoutTxid(
				[
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						txid,
						requestedAssignment: { amount: 1_000_000 }
					}
				],
				'',
				1_000_000
			)
		).toBe(txid);
		expect(
			openPayoutTxid(
				[
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						txid,
						requestedAssignment: { amount: 1_000_000 }
					},
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						txid: 'ab'.repeat(32),
						requestedAssignment: { amount: 1_000_000 }
					}
				],
				'',
				1_000_000
			)
		).toBeNull();
	});

	it('keeps a broadcast saved for the same invoice', () => {
		expect(
			keptSendProof(invoice, {
				phase: 'awaiting_confirmation',
				assetId: 'rgb:asset',
				amount: 1,
				invoice,
				psbt: null,
				signedPsbt: null,
				txid,
				lastError: null
			})
		).toBe(txid);
		expect(
			keptSendProof(invoice, {
				phase: 'failed',
				assetId: 'rgb:asset',
				amount: 1,
				invoice,
				psbt: null,
				signedPsbt: null,
				txid,
				lastError: 'stopped'
			})
		).toBe(txid);
	});
});

function outputPsbt(withChange: boolean): string {
	const psbt = new Psbt({ network: networks.testnet });
	const script = Buffer.from(`5120${'11'.repeat(32)}`, 'hex');
	psbt.addInput({
		hash: 'ab'.repeat(32),
		index: 0,
		witnessUtxo: { script, value: 1000 }
	});
	psbt.addOutput({ script, value: 382 });
	if (withChange) {
		psbt.updateOutput(0, {
			bip32Derivation: [
				{
					masterFingerprint: Buffer.from('037153fd', 'hex'),
					pubkey: Buffer.from(`02${'ab'.repeat(32)}`, 'hex'),
					path: "m/86'/1'/0'/1/0"
				}
			]
		});
	}
	return psbt.toBase64();
}

function taprootScript(): Buffer {
	return Buffer.from(`5120${'11'.repeat(32)}`, 'hex');
}

function opReturnScript(): Buffer {
	return Buffer.from(`6a20${'22'.repeat(32)}`, 'hex');
}

function fundedPsbt(inputValues: number[], outputs: { script: Buffer; value: number }[]): string {
	const psbt = new Psbt({ network: networks.testnet });
	const script = taprootScript();
	inputValues.forEach((value, index) => {
		psbt.addInput({
			hash: (index + 1).toString(16).padStart(2, '0').repeat(32),
			index: 0,
			witnessUtxo: { script, value }
		});
	});
	for (const output of outputs) psbt.addOutput(output);
	return psbt.toBase64();
}

/** Confirmed send 840a9fb1…: 975 + 20,000 in, one 0-value OP_RETURN, fee 20,975. */
function burnedOpReturnPsbt(): string {
	return fundedPsbt([975, 20_000], [{ script: opReturnScript(), value: 0 }]);
}

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

	it('reads a change output from the wallet derivation and ignores an unreadable psbt', () => {
		expect(changeOutputMissing(outputPsbt(true))).toBe(false);
		expect(changeOutputMissing(outputPsbt(false))).toBe(true);
		expect(changeOutputMissing('cHNidP-unsigned')).toBeNull();
		expect(() => assertChangeReturns(outputPsbt(false), 70_000_000, 2_000_000)).toThrow(
			/leaves the rest stuck/
		);
		expect(() => assertChangeReturns(outputPsbt(true), 70_000_000, 2_000_000)).toThrow(
			/leaves the rest stuck/
		);
		expect(() => assertChangeReturns('cHNidP-unsigned', 2_000_000, 2_000_000)).not.toThrow();
	});

	it('refuses a full send whose only output is a 0-value OP_RETURN', () => {
		const burned = burnedOpReturnPsbt();
		const economics = readSendEconomics(burned, 2);
		expect(economics).toMatchObject({
			inputSats: 20_975,
			feeSats: 20_975,
			weight: 674,
			vsize: 169,
			paidSats: 0
		});
		expect(economics?.feeCapSats).toBeLessThan(400);
		expect(() => assertChangeReturns(burned, 100_000_000, 100_000_000, false, 2)).toThrow(
			/fee must stay within the fee rate/
		);
		expect(() => assertChangeReturns(burned, 100_000_000, 100_000_000, true, 2)).toThrow(
			/fee must stay within the fee rate/
		);
	});

	it('accepts the same inputs when change returns inside the fee rate', () => {
		const returned = fundedPsbt(
			[975, 20_000],
			[
				{ script: opReturnScript(), value: 0 },
				{ script: taprootScript(), value: 20_551 }
			]
		);
		const economics = readSendEconomics(returned, 2);
		expect(economics).toMatchObject({ feeSats: 424, weight: 846, vsize: 212, paidSats: 20_551 });
		expect(economics && economics.feeSats <= economics.feeCapSats).toBe(true);
		expect(() => assertChangeReturns(returned, 100_000_000, 100_000_000, false, 2)).not.toThrow();
	});

	it('refuses a change output that still pays the fee rate of 100 sat/vB', () => {
		const overpaid = fundedPsbt(
			[20_000, 2_175],
			[
				{ script: opReturnScript(), value: 0 },
				{ script: taprootScript(), value: 975 }
			]
		);
		const economics = readSendEconomics(overpaid, 2);
		const capped = readSendEconomics(overpaid, 100);
		expect(economics).toMatchObject({ feeSats: 21_200, weight: 846, paidSats: 975 });
		expect(capped?.feeCapSats).toBe(economics?.feeCapSats);
		expect(() => assertChangeReturns(overpaid, 100_000_000, 100_000_000, false, 2)).toThrow(
			/fee must stay within the fee rate/
		);
		expect(() => assertChangeReturns(overpaid, 100_000_000, 100_000_000, false, 100)).toThrow(
			/fee must stay within the fee rate/
		);
	});

	it('asks the wallet for 2 sat/vB when the supplied rate is 100', async () => {
		const wallet = signer();
		await buildEscrowPsbt(wallet, {
			assetId: 'rgb:test',
			amount: 10_000,
			spendable: 10_000,
			invoice: 'rgb:invoice',
			feeRate: 100
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ donation: false, feeRate: 2 })
		);
	});

	it('does not sign a send that would give the miner every input sat', async () => {
		const failTransfers = vi.fn(async () => true);
		const wallet = signer({
			onchainSendBegin: vi.fn(async () => burnedOpReturnPsbt()),
			listTransfers: vi.fn(async () => [
				{ kind: 'Send', status: 'Initiated', batchTransferIdx: 4 }
			]),
			failTransfers
		});
		await expect(
			runEscrowSend(wallet, {
				assetId: 'rgb:test',
				amount: 100_000_000,
				spendable: 100_000_000,
				feeRate: 2,
				invoice: 'rgb:invoice'
			})
		).rejects.toThrow(/Nothing was sent/);
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 4, skipSync: true });
	});

	it('does not sign a partial send when the remainder cannot be assigned', async () => {
		const failTransfers = vi.fn(async () => true);
		const onchainSendBegin = vi.fn(async () => outputPsbt(false));
		const wallet = signer({
			onchainSendBegin,
			listTransfers: vi.fn(async () => [
				{ kind: 'Send', status: 'Initiated', batchTransferIdx: 8 }
			]),
			failTransfers
		});
		await expect(
			runEscrowSend(wallet, {
				assetId: 'rgb:test',
				amount: 2_000_000,
				spendable: 70_000_000,
				invoice: 'rgb:invoice'
			})
		).rejects.toThrow(/leaves the rest stuck/);
		expect(onchainSendBegin).not.toHaveBeenCalled();
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('rejects a broadcast that has no txid', async () => {
		const wallet = signer({ onchainSendEnd: vi.fn(async () => ({ created: 4 })) });
		await expect(broadcastEscrowPsbt(wallet, 'cHNidP-signed')).rejects.toThrow(/txid/);
	});
});
