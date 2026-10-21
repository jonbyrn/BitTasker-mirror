import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { resetWalletSession, walletSession } from '$lib/stores/wallet/wallet-session';
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
	listedChainMismatch,
	liveShortfall,
	prepareRgbOnchainSend,
	releasePhantomSends,
	spentOutputMessage,
	changeOwed,
	rescanColoredCoins,
	spentSealBatches,
	staleCounterpartyBatches,
	sealSendBlocker,
	changeRoomBlocker,
	changeStillBooked,
	openSendBatches,
	pruneSpentAllocations,
	unspentSpendable,
	takeChangeConfirmations,
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
		expect(liveShortfall(chain, 11_000_000)).toBe(spentOutputMessage(10_000_000, 100_000_000));
		expect(spentOutputMessage(10_000_000, 100_000_000)).toBe(
			'10.00 USDT can be sent. 100.00 is locked or unconfirmed. Tap Repair wallet, then try again.'
		);
		expect(liveShortfall(chain, 10_000_000)).toBeNull();
	});

	it('does not fail a settled transfer on a spent output', () => {
		const spentTx = 'cf3e56d7'.padEnd(64, 'a');
		const spentBy = '7e1bbee7'.padEnd(64, 'b');
		expect(
			spentSealBatches(
				[
					{ kind: 'ReceiveBlind', status: 'Settled', batchTransferIdx: 2, txid: spentTx },
					{ kind: 'Send', status: 'Settled', batchTransferIdx: 3, txid: spentBy },
					{ kind: 'ReceiveBlind', status: 'Settled', batchTransferIdx: 4, txid: 'ab'.repeat(32) },
					{ kind: 'Send', status: 'Failed', batchTransferIdx: 5, txid: spentTx },
					{
						kind: 'ReceiveBlind',
						status: 'WaitingConfirmations',
						batchTransferIdx: 8,
						txid: spentTx
					}
				],
				[{ txid: spentTx, vout: 5, amount: 100_000_000, spentBy }]
			)
		).toEqual([]);
	});

	it('fails stale counterparty rows and keeps the send that spent the coin', () => {
		const spentTx = 'aa'.repeat(32);
		const spentBy = 'bb'.repeat(32);
		const now = 1_700_000_000;
		const spent = [{ txid: spentTx, vout: 1, amount: 100_000_000, spentBy }];
		expect(
			staleCounterpartyBatches(
				[
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						batchTransferIdx: 1,
						expiration: now - 1
					},
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						batchTransferIdx: 2,
						expiration: now + 100
					},
					{ kind: 'Send', status: 'WaitingCounterparty', batchTransferIdx: 3 },
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						batchTransferIdx: 4,
						txid: spentBy
					},
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						batchTransferIdx: 5,
						txid: spentTx,
						expiration: now + 100
					},
					{
						kind: 'Send',
						status: 'WaitingCounterparty',
						batchTransferIdx: 6,
						txid: spentBy,
						expiration: now - 10
					}
				],
				spent,
				now
			)
		).toEqual([3]);
	});

	it('counts change only on the send that spent the coin', () => {
		const spentBy = '7e1bbee7'.padEnd(64, 'b');
		const other = 'ab'.repeat(32);
		const transfers = [
			{
				kind: 'Send',
				status: 'WaitingConfirmations',
				txid: spentBy,
				assignments: [{ amount: 80_000_000 }, { amount: 0 }]
			},
			{
				kind: 'Send',
				status: 'Failed',
				txid: spentBy,
				assignments: [{ amount: 50_000_000 }]
			},
			{ kind: 'Send', status: 'Settled', txid: other, assignments: [{ amount: 90_000_000 }] },
			{ kind: 'ReceiveBlind', status: 'Settled', txid: spentBy, assignments: [{ amount: 10 }] }
		];
		expect(changeOwed(transfers, [spentBy, spentBy])).toBe(80_000_000);
		expect(changeOwed(transfers, ['aa'.repeat(32)])).toBe(0);
		expect(changeOwed(null, [spentBy])).toBe(0);
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

	it('does not start a bitcoin self-transfer while preparing a USDT send', async () => {
		const assetId = 'rgb:f~usdt';
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		const createUtxos = vi.fn();
		const sendBtc = vi.fn();
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					createUtxos,
					sendBtc,
					listUnspents: async () => [
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
						ifa: [{ assetId, balance: { spendable: 30_000_000 } }]
					})
				},
				assetId,
				30_000_000,
				async () => ({ spent: false }),
				10_000_000
			)
		).rejects.toThrow(/leaves the rest stuck/);
		expect(createUtxos).not.toHaveBeenCalled();
		expect(sendBtc).not.toHaveBeenCalled();
	});

	it('treats a spent listing or a live total mismatch as stale', () => {
		const spent = {
			live: 0,
			spent: [{ txid: 'aa', vout: 0, amount: 100, spentBy: 'bb' }],
			checked: 1,
			unknown: false,
			pending: 0
		};
		expect(listedChainMismatch(spent, 100)).toBe(true);
		expect(
			listedChainMismatch({ live: 70, spent: [], checked: 1, unknown: false, pending: 0 }, 100)
		).toBe(true);
		expect(
			listedChainMismatch({ live: 100, spent: [], checked: 1, unknown: false, pending: 0 }, 100)
		).toBe(false);
		expect(listedChainMismatch({ ...spent, unknown: true }, 100)).toBe(false);
		expect(listedChainMismatch({ ...spent, checked: 0, spent: [] }, 100)).toBe(false);
		expect(
			listedChainMismatch({ live: 0, spent: [], checked: 0, unknown: false, pending: 100 }, 100)
		).toBe(false);
	});

	it('spends the live coin and ignores a spent allocation still listed', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = 'c42971b1'.padEnd(64, 'c');
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		const refreshWallet = vi.fn(async () => undefined);
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet,
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
		).resolves.toBe(30_000_000);
		expect(refreshWallet).toHaveBeenCalledTimes(2);
	});

	it('refuses to split change while a spent allocation is still listed', async () => {
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
				10_000_000
			)
		).rejects.toThrow(/leaves the rest stuck/);
	});

	it('voids a non-settled send on a spent seal and returns the live allocation', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = 'c42971b1'.padEnd(64, 'c');
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		const failTransfers = vi.fn(async () => true);
		const refreshWallet = vi.fn(async () => undefined);
		let reads = 0;
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet,
					listTransfers: async () => [
						{ kind: 'Send', status: 'WaitingConfirmations', batchTransferIdx: 7, txid: spentTx }
					],
					failTransfers,
					listUnspents: async () => {
						reads += 1;
						const spent =
							reads < 4
								? [
										{
											rgbAllocations: [
												{ assetId, assignment: { type: 'Fungible', amount: 30_000_000 } }
											],
											utxo: { exists: true, colorable: true, outpoint: { txid: spentTx, vout: 0 } }
										}
									]
								: [];
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
		).rejects.toThrow(/leaves the rest stuck/);
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 7, skipSync: true });
	});

	it('refreshes a spent listing once and then uses the live allocation', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = 'c42971b1'.padEnd(64, 'c');
		const liveTx = 'a66f7313'.padEnd(64, 'a');
		const goOnline = vi.fn(async () => undefined);
		const syncWallet = vi.fn(async () => undefined);
		let reads = 0;
		const refreshWallet = vi.fn(async () => {
			if (refreshWallet.mock.calls.length === 2) {
				expect(get(walletSession).refreshing).toBe(true);
			}
		});
		try {
			await expect(
				prepareRgbOnchainSend(
					{
						refreshWallet,
						syncWallet,
						goOnline,
						isOnline: () => false,
						listUnspents: async () => {
							reads += 1;
							if (reads < 3) {
								return [
									{
										rgbAllocations: [
											{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }
										],
										utxo: { exists: true, colorable: true, outpoint: { txid: spentTx, vout: 1 } }
									}
								];
							}
							return [
								{
									rgbAllocations: [
										{ assetId, assignment: { type: 'Fungible', amount: 30_000_000 } }
									],
									utxo: { exists: true, colorable: true, outpoint: { txid: liveTx, vout: 0 } }
								},
								{
									rgbAllocations: [],
									utxo: { exists: true, colorable: false, outpoint: { txid: 'fee', vout: 0 } }
								}
							];
						},
						listAssets: async () => ({
							ifa: [{ assetId, balance: { spendable: 30_000_000 } }]
						})
					},
					assetId,
					30_000_000,
					async (txid) =>
						txid === spentTx ? { spent: true, txid: 'aa'.repeat(32) } : { spent: false },
					30_000_000
				)
			).resolves.toBe(30_000_000);
			expect(refreshWallet).toHaveBeenCalledTimes(2);
			expect(syncWallet.mock.calls.length).toBeGreaterThanOrEqual(2);
			expect(goOnline).toHaveBeenCalled();
			expect(get(walletSession).refreshing).toBe(false);
		} finally {
			resetWalletSession();
		}
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
		).rejects.toThrow(
			'0.00 USDT can be sent. 200.00 is locked or unconfirmed. Tap Repair wallet, then try again.'
		);
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('keeps an expired incoming receive during send prep', async () => {
		const assetId = 'rgb:f~usdt';
		const seal = 'c67397ba'.padEnd(64, 'c');
		const spentBy = '368d36e6'.padEnd(64, 'd');
		const failTransfers = vi.fn(async () => true);
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					listTransfers: async () => [
						{
							kind: 'ReceiveBlind',
							status: 'WaitingCounterparty',
							batchTransferIdx: 4,
							expiration: 1
						},
						{
							kind: 'Send',
							status: 'WaitingConfirmations',
							batchTransferIdx: 9,
							txid: spentBy
						}
					],
					failTransfers,
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 200_000_000 } }],
							utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 3 } }
						}
					],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 200_000_000 } }]
					})
				},
				assetId,
				200_000_000,
				async () => ({ spent: true, txid: spentBy })
			)
		).rejects.toThrow(/locked or unconfirmed/);
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('rescans without failing the send that spent the coin', async () => {
		const assetId = 'rgb:f~usdt';
		const seal = 'ab'.repeat(32);
		const spentBy = 'cd'.repeat(32);
		const failTransfers = vi.fn(async () => true);
		const refreshWallet = vi.fn(async () => undefined);
		const syncWallet = vi.fn(async () => undefined);
		await rescanColoredCoins(
			{
				refreshWallet,
				syncWallet,
				isOnline: () => true,
				listTransfers: async () => [
					{
						kind: 'Send',
						status: 'WaitingConfirmations',
						batchTransferIdx: 2,
						txid: spentBy
					},
					{
						kind: 'ReceiveBlind',
						status: 'WaitingCounterparty',
						batchTransferIdx: 3,
						expiration: 1
					}
				],
				failTransfers,
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
						utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 1 } }
					}
				]
			},
			assetId,
			async () => ({ spent: true, txid: spentBy })
		);
		expect(syncWallet).toHaveBeenCalled();
		expect(refreshWallet.mock.calls.length).toBeGreaterThanOrEqual(2);
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

describe('change comes back', () => {
	const assetId = 'rgb:f~usdt';

	function coin(sats: number | undefined, allocations: number, colorable: boolean) {
		return {
			rgbAllocations:
				allocations > 0 ? [{ assetId, assignment: { type: 'Fungible', amount: allocations } }] : [],
			utxo: {
				exists: true,
				colorable,
				btcAmount: sats,
				outpoint: { txid: 'aa'.repeat(32), vout: colorable ? 1 : 0 }
			}
		};
	}

	it('blocks a partial send even when the colored coin has 1000 sats', () => {
		expect(
			changeRoomBlocker([coin(1000, 70_000_000, true)], assetId, 70_000_000, 2_000_000)
		).toMatch(/leaves the rest stuck/);
	});

	it('blocks a partial send from a 691 sat coin', () => {
		expect(
			changeRoomBlocker([coin(691, 70_000_000, true)], assetId, 70_000_000, 2_000_000)
		).toMatch(/leaves the rest stuck/);
	});

	it('blocks a partial send when a free colorable coin is already there', () => {
		expect(
			changeRoomBlocker(
				[coin(691, 70_000_000, true), coin(1000, 0, true), coin(1000, 0, true)],
				assetId,
				70_000_000,
				2_000_000
			)
		).toMatch(/leaves the rest stuck/);
	});

	it('does not ask for change when the send spends the whole balance', () => {
		expect(
			changeRoomBlocker([coin(691, 2_000_000, true)], assetId, 2_000_000, 2_000_000)
		).toBeNull();
	});

	it('drops the spent 691 sat coin from balance, fee, and change', () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = `691${'a'.repeat(61)}`;
		const liveTx = `1526488b${'b'.repeat(56)}`;
		const spentCoin = {
			rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }],
			utxo: {
				exists: true,
				colorable: true,
				btcAmount: 691,
				outpoint: { txid: spentTx, vout: 1 }
			}
		};
		const liveCoin = {
			rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
			utxo: {
				exists: true,
				colorable: true,
				btcAmount: 1000,
				outpoint: { txid: liveTx, vout: 0 }
			}
		};
		const feeCoin = {
			rgbAllocations: [],
			utxo: {
				exists: true,
				colorable: false,
				btcAmount: 5000,
				outpoint: { txid: 'fee'.padEnd(64, 'c'), vout: 0 }
			}
		};
		const chain = {
			live: 100_000_000,
			spent: [{ txid: spentTx, vout: 1, amount: 70_000_000, spentBy: 'dd'.repeat(32) }],
			checked: 2,
			unknown: false,
			pending: 0
		};
		const pruned = pruneSpentAllocations([spentCoin, liveCoin, feeCoin], chain.spent);
		expect(pruned).toEqual([liveCoin, feeCoin]);
		expect(fungibleAllocationSum(pruned, assetId)).toBe(100_000_000);
		expect(hasUncoloredFeeUtxo(pruned)).toBe(true);
		expect(unspentSpendable(170_000_000, 170_000_000, chain, true)).toBe(100_000_000);
		expect(
			unspentSpendable(
				170_000_000,
				100_000_000,
				{ live: 100_000_000, spent: [], checked: 1, unknown: false, pending: 0 },
				true
			)
		).toBe(100_000_000);
	});

	it('returns the live 100 after a settled receive and ignores the spent 70', async () => {
		const assetId = 'rgb:f~usdt';
		const spentTx = `691${'a'.repeat(61)}`;
		const liveTx = `1526488b${'b'.repeat(56)}`;
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }],
							utxo: {
								exists: true,
								colorable: true,
								btcAmount: 691,
								outpoint: { txid: spentTx, vout: 1 }
							}
						},
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
							utxo: {
								exists: true,
								colorable: true,
								btcAmount: 1000,
								outpoint: { txid: liveTx, vout: 0 }
							}
						},
						{
							rgbAllocations: [],
							utxo: {
								exists: true,
								colorable: false,
								btcAmount: 5000,
								outpoint: { txid: 'fee'.padEnd(64, 'c'), vout: 0 }
							}
						}
					],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 170_000_000, settled: 170_000_000 } }]
					})
				},
				assetId,
				170_000_000,
				async (txid) =>
					txid === spentTx ? { spent: true, txid: 'ee'.repeat(32) } : { spent: false },
				100_000_000
			)
		).resolves.toBe(100_000_000);
	});

	it('does not move bitcoin to fund a partial send', async () => {
		const colored = coin(691, 70_000_000, true);
		const vanilla = {
			rgbAllocations: [],
			utxo: {
				exists: true,
				colorable: false,
				btcAmount: 50_000,
				outpoint: { txid: 'bb'.repeat(32), vout: 0 }
			}
		};
		const sendBtc = vi.fn();
		const createUtxos = vi.fn();
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					syncWallet: async () => undefined,
					getAddress: async () => 'tb1pchange',
					sendBtc,
					createUtxos,
					listUnspents: async () => [colored, vanilla, coin(1000, 0, true)],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 70_000_000 } }]
					})
				},
				assetId,
				70_000_000,
				async () => ({ spent: false }),
				2_000_000
			)
		).rejects.toThrow(/leaves the rest stuck/);
		expect(createUtxos).not.toHaveBeenCalled();
		expect(sendBtc).not.toHaveBeenCalled();
		expect(takeChangeConfirmations()).toBe(1);
	});

	it('refuses a short coin when vanilla sats cannot fund the change', async () => {
		const sendBtc = vi.fn();
		await expect(
			prepareRgbOnchainSend(
				{
					refreshWallet: async () => undefined,
					getAddress: async () => 'tb1pchange',
					sendBtc,
					listUnspents: async () => [coin(691, 70_000_000, true)],
					listAssets: async () => ({
						ifa: [{ assetId, balance: { spendable: 70_000_000 } }]
					})
				},
				assetId,
				70_000_000,
				async () => ({ spent: false }),
				2_000_000
			)
		).rejects.toThrow(/leaves the rest stuck/);
		expect(sendBtc).not.toHaveBeenCalled();
		expect(takeChangeConfirmations()).toBe(1);
	});

	it('fails an unbroadcast send so the seal can be spent again', () => {
		expect(
			openSendBatches([
				{ kind: 'Send', status: 'Initiated', batchTransferIdx: 4 },
				{ kind: 'Send', status: 'Settled', batchTransferIdx: 5, txid: 'dd'.repeat(32) },
				{ kind: 'ReceiveBlind', status: 'WaitingCounterparty', batchTransferIdx: 6 }
			])
		).toEqual([4]);
	});
});
