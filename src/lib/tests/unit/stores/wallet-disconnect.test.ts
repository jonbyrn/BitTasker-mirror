import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBalanceUpdate } from '$lib/stores/wallet/balance-merge';
import { shareInit } from '$lib/stores/wallet/init-gate';
import { chainGap, scanBtcBalance } from '$lib/stores/wallet/wallet-balances';
import { bindLspClient } from '$lib/stores/wallet/signet-lsp';
import type { RgbAsset } from '$lib/stores/wallet/wallet-types';
import { getBiometricData } from '$lib/utils/helpers/biometrics';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { readMnemonicSession } from '$lib/utils/helpers/session-mnemonic';

vi.mock('$lib/utils/helpers/session-mnemonic', () => ({
	readMnemonicSession: vi.fn(),
	saveMnemonicSession: vi.fn(),
	saveSignerSession: vi.fn()
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	getBiometricData: vi.fn(),
	checkBiometricAvailability: vi.fn()
}));

const SEED = Array.from({ length: 12 }, () => 'abandon').join(' ');

function usdt(partial: Partial<RgbAsset>): RgbAsset {
	return {
		assetId: 'rgb:usdt',
		name: 'Tether USD',
		symbol: 'USDT',
		balance: 0,
		formattedBalance: '0',
		...partial
	};
}

describe('wallet disconnect guards', () => {
	beforeEach(() => {
		vi.mocked(readMnemonicSession).mockReset();
		vi.mocked(getBiometricData).mockReset();
	});

	it('does not call WebAuthn when a session mnemonic is cached', async () => {
		vi.mocked(readMnemonicSession).mockResolvedValue(SEED);
		await expect(getMnemonic()).resolves.toBe(SEED);
		expect(getBiometricData).not.toHaveBeenCalled();
	});

	it('keeps the last balance when a scan returns null', () => {
		const current = { balanceSats: 5000, assets: [usdt({ balance: 10, spendable: 10 })] };
		expect(applyBalanceUpdate(current, { balanceSats: null, assets: null })).toEqual(current);
	});

	it('returns null from a failed balance scan instead of zero', async () => {
		const scanned = await scanBtcBalance({
			getBtcBalance: async () => {
				throw new Error('indexer down');
			},
			getAddress: async () => 'tb1qtest',
			refreshWallet: async () => undefined
		});
		expect(scanned).toBeNull();
	});

	it('binds LSP methods so a destructured call keeps this', () => {
		class FakeLsp {
			label = 'bound';
			connect(): string {
				return this.label;
			}
			sendAsset(): string {
				return this.label;
			}
		}
		const bound = bindLspClient(new FakeLsp());
		const { connect, sendAsset } = bound;
		expect(connect?.()).toBe('bound');
		expect(
			sendAsset?.({
				rgbInvoice: 'rgb:x',
				ln: { amtMsat: 1, expirySec: 1, assetId: 'a', assetAmount: 1 }
			})
		).toBe('bound');
	});

	it('shares one init and retries after a failure', async () => {
		const slot: { current: Promise<number> | null } = { current: null };
		let calls = 0;
		const first = shareInit(slot, async () => {
			calls += 1;
			return 1;
		});
		const second = shareInit(slot, async () => {
			calls += 1;
			return 2;
		});
		await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
		expect(calls).toBe(1);

		const failed: { current: Promise<number> | null } = { current: null };
		let attempts = 0;
		await expect(
			shareInit(failed, async () => {
				attempts += 1;
				throw new Error('init failed');
			})
		).rejects.toThrow('init failed');
		await expect(
			shareInit(failed, async () => {
				attempts += 1;
				return 3;
			})
		).resolves.toBe(3);
		expect(attempts).toBe(2);
	});

	it('does not warn when only settled USDT is above the chain', () => {
		const settledOnly = usdt({ balance: 100, spendable: 0, chainSpendable: 0 });
		expect(chainGap([settledOnly])).toBeUndefined();
		const spendableGap = usdt({ balance: 100, spendable: 50, chainSpendable: 10 });
		expect(chainGap([spendableGap])?.assetId).toBe('rgb:usdt');
		expect(chainGap([spendableGap], false)).toBeUndefined();
	});
});
