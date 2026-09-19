import { describe, expect, it, vi } from 'vitest';
import { WasmRgbSealBackend } from '$lib/services/rgb/wasm-backend';
import { isNativeBitcoinAsset } from '$lib/types/rgb-contract';
import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { CommitCommandInput, ContractId } from '$lib/services/rgb/types';

function makeWallet(overrides: Partial<UTEXOWallet> = {}): UTEXOWallet {
	return {
		onchainReceive: vi.fn().mockResolvedValue({
			invoice: 'rgb1invoice',
			recipientId: 'recv-1'
		}),
		witnessReceive: vi.fn().mockResolvedValue({
			invoice: 'rgb1witness',
			recipientId: 'recv-2'
		}),
		refreshWallet: vi.fn().mockResolvedValue(undefined),
		listTransfers: vi.fn().mockResolvedValue([]),
		decodeRGBInvoice: vi.fn().mockResolvedValue({ assetId: undefined }),
		...overrides
	} as unknown as UTEXOWallet;
}

const BTC_COMMIT: CommitCommandInput = {
	contractId: 'contract-1' as ContractId,
	assetId: 'btc_onchain',
	amount: 3075
};

const USDT_COMMIT: CommitCommandInput = {
	contractId: 'contract-1' as ContractId,
	assetId: 'rgb:usdt',
	amount: 10
};

describe('isNativeBitcoinAsset', () => {
	it('treats UI rails and BTC aliases as native bitcoin', () => {
		expect(isNativeBitcoinAsset('btc_onchain')).toBe(true);
		expect(isNativeBitcoinAsset('BTC')).toBe(true);
		expect(isNativeBitcoinAsset(undefined)).toBe(true);
	});

	it('does not treat issued RGB contracts as native bitcoin', () => {
		expect(isNativeBitcoinAsset('rgb:usdt')).toBe(false);
	});
});

describe('WasmRgbSealBackend.commit', () => {
	it('creates a UTEXO invoice without an RGB asset id for native BTC', async () => {
		const wallet = makeWallet();
		const backend = new WasmRgbSealBackend(wallet);

		const seal = await backend.commit(BTC_COMMIT);

		expect(wallet.onchainReceive).toHaveBeenCalledWith({ amount: 3075, witness: true });
		expect(wallet.onchainReceive).not.toHaveBeenCalledWith(
			expect.objectContaining({ assetId: 'btc_onchain' })
		);
		expect(seal.invoice).toBe('rgb1invoice');
		expect(seal.assetId).toBe('btc_onchain');
		expect(wallet.decodeRGBInvoice).toHaveBeenCalledWith({ invoice: 'rgb1invoice' });
	});

	it('rejects a native BTC receive that decodes to a colored RGB asset', async () => {
		const wallet = makeWallet({
			decodeRGBInvoice: vi.fn().mockResolvedValue({ assetId: 'rgb:usdt' })
		});
		const backend = new WasmRgbSealBackend(wallet);

		await expect(backend.commit(BTC_COMMIT)).rejects.toThrow('colored asset rgb:usdt');
		expect(wallet.refreshWallet).toHaveBeenCalled();
	});

	it('passes issued RGB asset ids through to onchainReceive', async () => {
		const wallet = makeWallet();
		const backend = new WasmRgbSealBackend(wallet);

		await backend.commit(USDT_COMMIT);

		expect(wallet.onchainReceive).toHaveBeenCalledWith({
			amount: 10,
			assetId: 'rgb:usdt',
			witness: true
		});
	});

	it('refreshes the wallet after a failed receive so the SDK mutex can clear', async () => {
		const wallet = makeWallet({
			onchainReceive: vi.fn().mockRejectedValue(new Error('Asset with id btc_onchain not found'))
		});
		const backend = new WasmRgbSealBackend(wallet);

		await expect(backend.commit(BTC_COMMIT)).rejects.toThrow('Asset with id btc_onchain not found');
		expect(wallet.refreshWallet).toHaveBeenCalledTimes(1);
	});
});
