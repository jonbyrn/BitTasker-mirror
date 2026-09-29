import { describe, expect, it, vi } from 'vitest';
import {
	fungibleAllocationSum,
	hasUncoloredFeeUtxo,
	isBdkAddUtxoError,
	listsLocalOutpoint,
	needsVanillaFeeUtxo,
	PHANTOM_BROADCAST_TXID,
	phantomSendBatches,
	releasePhantomSends,
	sealSendBlocker,
	strandedSeal,
	stuckSendBatchIndexes
} from '$lib/stores/wallet/prepare-rgb-send';

describe('prepareRgbOnchainSend helpers', () => {
	it('fails only dead outbound sends', () => {
		expect(
			stuckSendBatchIndexes([
				{ kind: 'ReceiveBlind', status: 'WaitingCounterparty', batchTransferIdx: 1 },
				{ kind: 'Issuance', status: 'WaitingConfirmations', batchTransferIdx: 1 },
				{ kind: 'Send', status: 'Settled', batchTransferIdx: 2 },
				{ kind: 'Send', status: 'WaitingCounterparty', batchTransferIdx: 3 },
				{ kind: 'Send', status: 'WaitingConfirmations', batchTransferIdx: 4 },
				{ kind: 'Send', status: 'Failed', batchTransferIdx: 5 },
				{ kind: 'Send', status: 'Initiated', batchTransferIdx: 6 }
			])
		).toEqual([5, 6]);
	});

	it('selects only the unbroadcast send batch', () => {
		expect(
			phantomSendBatches([
				{
					kind: 'ReceiveBlind',
					status: 'WaitingCounterparty',
					batchTransferIdx: 1,
					txid: PHANTOM_BROADCAST_TXID
				},
				{
					kind: 'Send',
					status: 'WaitingConfirmations',
					batchTransferIdx: 4,
					txid: PHANTOM_BROADCAST_TXID
				},
				{
					kind: 'Send',
					status: 'Failed',
					batchTransferIdx: 5,
					txid: PHANTOM_BROADCAST_TXID
				},
				{
					kind: 'Send',
					status: 'Settled',
					batchTransferIdx: 2,
					txid: 'a'.repeat(64)
				}
			])
		).toEqual([4]);
	});

	it('fails the unbroadcast batch and leaves the backup in place when the seal stays', async () => {
		const failTransfers = vi.fn(async () => true);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const cleared = await releasePhantomSends(
			{
				listTransfers: async () => [
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						batchTransferIdx: 4,
						txid: PHANTOM_BROADCAST_TXID
					}
				],
				failTransfers,
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId: 'rgb:f~ifa' }],
						utxo: { exists: false, outpoint: { txid: PHANTOM_BROADCAST_TXID, vout: 2 } }
					}
				],
				syncWallet: async () => undefined,
				refreshWallet: async () => undefined
			},
			async () => false
		);
		expect(cleared).toBe(false);
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 4, skipSync: true });
		expect(warn).toHaveBeenCalledWith(
			'[wallet-send] phantom seal remains; not restoring rgb_backup_bytes'
		);
		warn.mockRestore();
	});

	it('does not fail the batch when Esplora already has the transaction', async () => {
		const failTransfers = vi.fn(async () => true);
		const cleared = await releasePhantomSends(
			{
				listTransfers: async () => [
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						batchTransferIdx: 4,
						txid: PHANTOM_BROADCAST_TXID
					}
				],
				failTransfers
			},
			async () => true
		);
		expect(cleared).toBe(false);
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('records a wasm refusal without throwing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const cleared = await releasePhantomSends(
			{
				listTransfers: async () => [
					{
						kind: 'Send',
						status: 'Settled',
						batchTransferIdx: 4,
						txid: PHANTOM_BROADCAST_TXID
					}
				],
				failTransfers: async () => {
					throw new Error('Batch transfer cannot be set to failed status');
				},
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId: 'rgb:f~ifa' }],
						utxo: { exists: false, outpoint: { txid: PHANTOM_BROADCAST_TXID, vout: 2 } }
					}
				]
			},
			async () => false
		);
		expect(cleared).toBe(false);
		expect(warn.mock.calls.some((call) => call[0] === '[wallet-send] failTransfers refused')).toBe(
			true
		);
		warn.mockRestore();
	});

	it('asks for a vanilla fee utxo unless vout 0 or 1 is uncolored', () => {
		expect(
			needsVanillaFeeUtxo(
				[{ rgbAllocations: [{}], utxo: { exists: true, outpoint: { vout: 0 } } }],
				10_000
			)
		).toBe(true);
		expect(
			needsVanillaFeeUtxo(
				[{ rgbAllocations: [], utxo: { exists: true, outpoint: { vout: 5 } } }],
				95_910
			)
		).toBe(true);
		expect(
			needsVanillaFeeUtxo(
				[{ rgbAllocations: [], utxo: { exists: true, outpoint: { vout: 0 } } }],
				1_000
			)
		).toBe(true);
		expect(
			needsVanillaFeeUtxo(
				[{ rgbAllocations: [], utxo: { exists: true, outpoint: { vout: 1 } } }],
				5_000
			)
		).toBe(false);
	});

	it('treats the drifted vout 5 as local only when BDK lists it', () => {
		const txid = 'f4148f9d02745498ace80993c3365f6745dddba80ff96cbac1976aaf54567ca8';
		expect(
			listsLocalOutpoint(
				[{ rgbAllocations: [{}], utxo: { exists: false, outpoint: { txid, vout: 5 } } }],
				txid,
				5
			)
		).toBe(false);
		expect(
			listsLocalOutpoint(
				[{ rgbAllocations: [], utxo: { exists: true, outpoint: { txid, vout: 5 } } }],
				txid,
				5
			)
		).toBe(true);
	});

	it('blocks send when spendable 10000 has no seal', () => {
		const assetId = 'rgb:minted';
		const empty = [
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'abc', vout: 5 } }
			}
		];
		expect(sealSendBlocker(empty, assetId, 10_000)).toBe(
			'Refusing onchainSend: spendable 10000 has no seal in listUnspents'
		);
		expect(hasUncoloredFeeUtxo(empty)).toBe(false);
	});

	it('refuses the orphan colored outpoint even when the seal amount matches', () => {
		const assetId = 'rgb:e2e2';
		const orphan = 'f4148f9d02745498ace80993c3365f6745dddba80ff96cbac1976aaf54567ca8';
		const unspents = [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 1000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: orphan, vout: 5 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
			}
		];
		expect(sealSendBlocker(unspents, assetId, 1000)).toContain(orphan);
	});

	it('refuses a seal the BDK store does not list', () => {
		const assetId = 'rgb:held';
		const unspents = [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 1000 } }],
				utxo: { exists: false, colorable: true, outpoint: { txid: 'stranded', vout: 2 } }
			}
		];
		expect(strandedSeal(unspents[0], assetId)).toBe(true);
		expect(sealSendBlocker(unspents, assetId, 1000)).toContain('stranded');
	});

	it('refuses the blank-invoice lock and waits for the payment UTXO', () => {
		const assetId = 'rgb:held';
		const unspents = [
			{
				pendingBlinded: 1,
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 1000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'invoice-lock', vout: 2 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
			}
		];
		expect(sealSendBlocker(unspents, assetId, 1000)).toContain('blank invoice');
	});

	it('allows send when the colorable seal matches spendable and a fee coin remains', () => {
		const assetId = 'rgb:minted';
		const unspents = [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 10_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'abc', vout: 2 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
			}
		];
		expect(fungibleAllocationSum(unspents, assetId)).toBe(10_000);
		expect(sealSendBlocker(unspents, assetId, 10_000)).toBeNull();
	});

	it('detects the bdk add-utxo failure', () => {
		expect(
			isBdkAddUtxoError(
				new Error('Internal error: Error from bdk adding UTXOs: UTXO abc with vout: 5')
			)
		).toBe(true);
		expect(isBdkAddUtxoError(new Error('Invalid mnemonic'))).toBe(false);
	});
});
