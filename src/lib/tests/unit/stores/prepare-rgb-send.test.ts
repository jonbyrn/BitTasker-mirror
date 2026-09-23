import { describe, expect, it } from 'vitest';
import {
	fungibleAllocationSum,
	hasUncoloredFeeUtxo,
	isBdkAddUtxoError,
	listsLocalOutpoint,
	needsVanillaFeeUtxo,
	sealSendBlocker,
	stuckSendBatchIndexes
} from '$lib/stores/wallet/prepare-rgb-send';

describe('prepareRgbOnchainSend helpers', () => {
	it('fails only stuck RGB sends', () => {
		expect(
			stuckSendBatchIndexes([
				{ kind: 'Issuance', status: 'WaitingConfirmations', batchTransferIdx: 1 },
				{ kind: 'Send', status: 'Settled', batchTransferIdx: 2 },
				{ kind: 'Send', status: 'WaitingCounterparty', batchTransferIdx: 3 },
				{ kind: 'Send', status: 'WaitingConfirmations', batchTransferIdx: 4 },
				{ kind: 'Send', status: 'Failed', batchTransferIdx: 3 }
			])
		).toEqual([3, 4]);
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
