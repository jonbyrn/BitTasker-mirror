import { describe, expect, it, vi } from 'vitest';
import {
	allocationCoversSpendable,
	chainAllocation,
	fungibleAllocationSum,
	hasUncoloredFeeUtxo,
	isBdkAddUtxoError,
	listsLocalOutpoint,
	needsVanillaFeeUtxo,
	PHANTOM_BROADCAST_TXID,
	phantomSendBatches,
	enqueueWallet,
	prepareRgbOnchainSend,
	releasePhantomSends,
	sealSendBlocker,
	changeStillBooked,
	walletSendPending,
	spentSealBooked,
	spentSealMessage,
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

	it('warns only when the full balance is still spendable after a partial send', () => {
		expect(changeStillBooked(100_000_000, 110_000_000, 10_000_000)).toBe(false);
		expect(changeStillBooked(110_000_000, 110_000_000, 10_000_000)).toBe(true);
		expect(changeStillBooked(0, 110_000_000, 110_000_000)).toBe(false);
	});

	it('flags a full allocation that stayed on an output the send already spent', () => {
		const assetId = 'rgb:f~usdt';
		const sendTxid = '05ff07f8';
		const unspents = [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, outpoint: { txid: '9115e570', vout: 2 } }
			}
		];
		expect(spentSealBooked(unspents, assetId, sendTxid, 100_000_000)).toBe(true);
		expect(spentSealBooked(unspents, assetId, '9115e570', 100_000_000)).toBe(false);
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

	it('allows the settled seal while another receive stays pending', () => {
		const assetId = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
		const unspents = [
			{
				pendingBlinded: 0,
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'a66f7313', vout: 1 } }
			},
			{
				pendingBlinded: 1,
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'c67397ba', vout: 3 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
			}
		];
		expect(sealSendBlocker(unspents, assetId, 100_000_000)).toBeNull();
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

	it('drops a spent allocation and names the output', async () => {
		const assetId = 'rgb:f~usdt';
		const seal = '9115e570'.padEnd(64, 'b');
		const spentBy = '05ff07f8'.padEnd(64, 'a');
		const unspents = [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 2 } }
			},
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 10_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			}
		];
		const chain = await chainAllocation(unspents, assetId, async (_txid, vout) =>
			vout === 2 ? { spent: true, txid: spentBy } : { spent: false }
		);
		expect(chain.live).toBe(10_000_000);
		expect(chain.spent).toEqual([{ txid: seal, vout: 2, amount: 100_000_000, spentBy }]);
		expect(spentSealMessage(chain.spent)).toBe(
			`Refusing onchainSend: ${seal}:2 was already spent on-chain by ${spentBy}. RGB still lists that USDT, so this send is blocked.`
		);
	});

	it('hides the unspent warning when the allocation list is short', () => {
		const empty = { live: 0, spent: [], checked: 0, unknown: false, pending: 0 };
		expect(allocationCoversSpendable(empty, 100_000_000)).toBe(false);
		const spentOnly = {
			live: 0,
			spent: [{ txid: 'aa', vout: 0, amount: 100_000_000, spentBy: 'bb' }],
			checked: 1,
			unknown: false,
			pending: 0
		};
		expect(allocationCoversSpendable(spentOnly, 100_000_000)).toBe(true);
		expect(allocationCoversSpendable({ ...spentOnly, unknown: true }, 100_000_000)).toBe(false);
	});

	it('refuses before building when a spent seal is still listed', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = 'c42971b1'.padEnd(64, 'c');
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
							utxo: { exists: true, colorable: true, outpoint: { txid: spentTx, vout: 0 } }
						},
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 30_000_000 } }],
							utxo: { exists: true, colorable: true, outpoint: { txid: liveTx, vout: 1 } }
						},
						{
							rgbAllocations: [],
							utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
						}
					],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 130_000_000 } }]
					})
				},
				assetId,
				130_000_000,
				async (_txid, vout) =>
					vout === 0 ? { spent: true, txid: 'aa'.repeat(32) } : { spent: false },
				30_000_000
			)
		).rejects.toThrow(`${spentTx}:0 was already spent`);
	});

	it('voids a non-settled send on a spent seal and then continues', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = 'c42971b1'.padEnd(64, 'c');
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		const failTransfers = vi.fn(async () => true);
		let listed = true;
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					listTransfers: async () => [
						{ kind: 'Send', status: 'WaitingConfirmations', batchTransferIdx: 7, txid: spentTx }
					],
					failTransfers,
					listUnspents: async () => {
						const spent = listed
							? [
									{
										rgbAllocations: [
											{ assetId, assignment: { type: 'Fungible', amount: 30_000_000 } }
										],
										utxo: { exists: true, colorable: true, outpoint: { txid: spentTx, vout: 0 } }
									}
								]
							: [];
						listed = false;
						return [
							...spent,
							{
								rgbAllocations: [
									{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }
								],
								utxo: { exists: true, colorable: true, outpoint: { txid: liveTx, vout: 1 } }
							},
							{
								rgbAllocations: [],
								utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
							}
						];
					},
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 130_000_000 } }]
					})
				},
				assetId,
				130_000_000,
				async (txid) =>
					txid === spentTx ? { spent: true, txid: 'aa'.repeat(32) } : { spent: false },
				30_000_000
			)
		).resolves.toBeUndefined();
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 7, skipSync: true });
	});

	it('refuses the send when an allocation output is already spent', async () => {
		const assetId = 'rgb:f~usdt';
		const seal = 'c67397ba'.padEnd(64, 'c');
		const spentBy = '368d36e6'.padEnd(64, 'd');
		const failTransfers = vi.fn();
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 200_000_000 } }],
							utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 3 } }
						}
					],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 200_000_000 } }]
					}),
					failTransfers
				},
				assetId,
				200_000_000,
				async () => ({ spent: true, txid: spentBy })
			)
		).rejects.toThrow(`${seal}:3 was already spent on-chain by ${spentBy}`);
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('retries a refresh while the wallet is busy', async () => {
		const refreshWallet = vi
			.fn()
			.mockRejectedValueOnce('RGB wallet is busy with another operation; retry shortly')
			.mockResolvedValueOnce(undefined);
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet,
					listUnspents: async () => {
						expect(walletSendPending()).toBe(true);
						return [];
					},
					listAssets: async () => ({ ifa: [] })
				},
				'rgb:f~usdt'
			)
		).rejects.toThrow('no colorable allocation');
		expect(refreshWallet).toHaveBeenCalledTimes(2);
		expect(walletSendPending()).toBe(false);
	});

	it('runs wallet work one at a time', async () => {
		let active = 0;
		let peak = 0;
		const turn = async (): Promise<void> => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 20));
			active -= 1;
		};
		await Promise.all([enqueueWallet(turn), enqueueWallet(turn)]);
		expect(peak).toBe(1);
		expect(active).toBe(0);
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
