import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
import {
	clearCancelledReceives,
	readCancelledReceives,
	releaseBlockingReceives
} from '$lib/stores/wallet/wallet-balances';

vi.mock('$lib/stores/wallet/wallet-init', () => ({
	getUtexoWallet: vi.fn()
}));

const BLINDING = 'e7768e06' + 'ab'.repeat(28);

function waitingReceive(expiration: number) {
	return {
		kind: 'ReceiveBlind',
		status: 'WaitingCounterparty',
		batchTransferIdx: 4,
		recipientId: 'sb:utxob:JQuSjyh9-rest',
		expiration,
		txid: BLINDING,
		invoiceString:
			'rgb:~/~/~/sb:utxob:JQuSjyh9-rest?expiry=' +
			expiration +
			'&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc'
	};
}

describe('releaseBlockingReceives', () => {
	beforeEach(() => {
		clearCancelledReceives();
		vi.restoreAllMocks();
	});

	it('fails that batch and refreshes when the receive is unexpired and has no consignment', async () => {
		const failTransfers = vi.fn(async () => true);
		const refreshWallet = vi.fn(async () => undefined);
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		vi.mocked(getUtexoWallet).mockReturnValue({
			listAssets: async () => ({ nia: [], ifa: [] }),
			listTransfers: async () => [waitingReceive(Math.floor(Date.now() / 1000) + 3600)],
			failTransfers,
			refreshWallet
		} as never);
		const outcome = await releaseBlockingReceives({ probe: async () => 'absent' });
		expect(outcome).toEqual({ released: [4], reason: 'released' });
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 4, skipSync: false });
		expect(refreshWallet).toHaveBeenCalledOnce();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(readCancelledReceives()).toEqual([expect.objectContaining({ batch: 4 })]);
	});

	it('does not call failTransfers when the proxy has a consignment', async () => {
		const failTransfers = vi.fn(async () => true);
		const refreshWallet = vi.fn(async () => undefined);
		vi.mocked(getUtexoWallet).mockReturnValue({
			listTransfers: async () => [waitingReceive(Math.floor(Date.now() / 1000) - 10)],
			failTransfers,
			refreshWallet
		} as never);
		const outcome = await releaseBlockingReceives({ probe: async () => 'found' });
		expect(outcome).toEqual({ released: [], reason: 'consignment' });
		expect(failTransfers).not.toHaveBeenCalled();
		expect(refreshWallet).not.toHaveBeenCalled();
	});

	it('does not call failTransfers when the probe is unknown', async () => {
		const failTransfers = vi.fn(async () => true);
		vi.mocked(getUtexoWallet).mockReturnValue({
			listTransfers: async () => [waitingReceive(Math.floor(Date.now() / 1000) + 60)],
			failTransfers,
			refreshWallet: vi.fn()
		} as never);
		const outcome = await releaseBlockingReceives({ probe: async () => 'unknown' });
		expect(outcome.released).toEqual([]);
		expect(failTransfers).not.toHaveBeenCalled();
	});

	it('keeps the raw refresh error when refresh fails after the receive is failed', async () => {
		const failTransfers = vi.fn(async () => true);
		const refreshWallet = vi.fn(async () => {
			throw new Error('indexer down: esplora timeout');
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.mocked(getUtexoWallet).mockReturnValue({
			listTransfers: async () => [waitingReceive(Math.floor(Date.now() / 1000) + 60)],
			failTransfers,
			refreshWallet
		} as never);
		const outcome = await releaseBlockingReceives({ probe: async () => 'absent' });
		expect(outcome).toEqual({ released: [4], reason: 'released' });
		expect(failTransfers).toHaveBeenCalledOnce();
		expect(error).toHaveBeenCalledWith(
			'[wallet-release] refresh failed',
			'indexer down: esplora timeout'
		);
	});
});
