import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBalanceUpdate } from '$lib/stores/wallet/balance-merge';
import { shareInit } from '$lib/stores/wallet/init-gate';
import {
	attachChainSpendable,
	capUnspentUsdt,
	chainGap,
	holdUsdtBalance,
	scanBtcBalance,
	withSpentProof
} from '$lib/stores/wallet/wallet-balances';
import { parseWalletUtxos } from '$lib/stores/wallet/rgb-allocations';
import { bindLspClient } from '$lib/stores/wallet/signet-lsp';
import type { RgbAsset } from '$lib/stores/wallet/wallet-types';
import { getBiometricData } from '$lib/utils/helpers/biometrics';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import {
	readMnemonicSession,
	saveMnemonicSession,
	saveSignerSession
} from '$lib/utils/helpers/session-mnemonic';
import { rememberLoginSeed } from '$lib/utils/helpers/mnemonic';

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
		vi.mocked(saveMnemonicSession).mockReset();
		vi.mocked(saveSignerSession).mockReset();
		vi.mocked(saveMnemonicSession).mockResolvedValue(undefined);
		vi.mocked(saveSignerSession).mockResolvedValue(undefined);
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

	it('stores the login seed so balances can load', async () => {
		await rememberLoginSeed(SEED, 'nsec1example', 'npub1example');
		expect(saveMnemonicSession).toHaveBeenCalledWith(SEED);
		expect(saveSignerSession).toHaveBeenCalledWith('nsec1example', 'npub1example');
	});

	it('runs init again after the slot is cleared', async () => {
		const slot: { current: Promise<number> | null } = { current: null };
		await expect(shareInit(slot, async () => 1)).resolves.toBe(1);
		slot.current = null;
		await expect(shareInit(slot, async () => 2)).resolves.toBe(2);
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

	it('stores 100 when the engine total still includes a spent 70', () => {
		const held = usdt({
			balance: 170_000_000,
			spendable: 170_000_000,
			chainSpendable: 100_000_000,
			chainSpent: 70_000_000,
			precision: 6
		});
		const [next] = capUnspentUsdt([held]);
		expect(next?.balance).toBe(100_000_000);
		expect(next?.spendable).toBe(100_000_000);
		expect(next?.formattedBalance).toBe('100.00');
	});

	it('shows the unspent amount when RGB still lists a spent seal', () => {
		const held = usdt({
			balance: 30_000_000,
			spendable: 30_000_000,
			chainSpendable: 0,
			precision: 6
		});
		const [next] = capUnspentUsdt([held]);
		expect(next?.balance).toBe(0);
		expect(next?.spendable).toBe(0);
		expect(next?.formattedBalance).toBe('0.00');
		const pending = usdt({
			balance: 30_000_000,
			spendable: 30_000_000,
			chainSpendable: 0,
			pendingConfirm: true,
			precision: 6
		});
		expect(capUnspentUsdt([pending])[0]?.balance).toBe(30_000_000);
	});

	it('does not treat an empty unspent list as 0.00 USDT on chain', async () => {
		const held = usdt({ balance: 100_000_000, spendable: 100_000_000, precision: 6 });
		const next = await attachChainSpendable({ listUnspents: async () => [] }, [held]);
		expect(next[0]?.chainSpendable).toBeUndefined();
		expect(chainGap(next)).toBeUndefined();
		expect(parseWalletUtxos([])).toEqual([]);
	});

	it('hides exists:false rows and does not count them as unspent USDT', async () => {
		const txid = 'ab'.repeat(32);
		const hidden = [
			{
				utxo: { exists: false, outpoint: { txid, vout: 0 }, colorable: true, btcAmount: 5000 },
				rgbAllocations: [
					{ assetId: 'rgb:usdt', assignment: { type: 'Fungible', amount: 100_000_000 } }
				],
				pendingBlinded: 0
			}
		];
		const held = usdt({ balance: 100_000_000, spendable: 100_000_000, precision: 6 });
		const next = await attachChainSpendable({ listUnspents: async () => hidden }, [held]);
		expect(next[0]?.chainSpendable).toBeUndefined();
		expect(parseWalletUtxos(hidden)).toEqual([]);
	});

	it('keeps a spent allocation visible and reports zero live units', async () => {
		const txid = 'cd'.repeat(32);
		const row = {
			utxo: { exists: true, outpoint: { txid, vout: 1 }, colorable: true, btcAmount: 5000 },
			rgbAllocations: [
				{ assetId: 'rgb:usdt', assignment: { type: 'Fungible', amount: 100_000_000 } }
			],
			pendingBlinded: 0
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ spent: true, txid: 'ee'.repeat(32) })
		});
		vi.stubGlobal('fetch', fetchMock);
		try {
			const held = usdt({ balance: 100_000_000, spendable: 100_000_000, precision: 6 });
			const next = await attachChainSpendable({ listUnspents: async () => [row] }, [held]);
			expect(next[0]?.chainSpendable).toBe(0);
			expect(next[0]?.balance).toBe(0);
			expect(next[0]?.changeDue).toBe(false);
			expect(chainGap(next)?.assetId).toBe('rgb:usdt');
			expect(parseWalletUtxos([row])).toHaveLength(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('shows change from the send that spent the colored coin', async () => {
		const txid = 'cd'.repeat(32);
		const spentBy = 'ee'.repeat(32);
		const row = {
			utxo: { exists: true, outpoint: { txid, vout: 1 }, colorable: true, btcAmount: 1000 },
			rgbAllocations: [
				{ assetId: 'rgb:usdt', assignment: { type: 'Fungible', amount: 100_000_000 } }
			],
			pendingBlinded: 0
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ spent: true, txid: spentBy })
			})
		);
		try {
			const held = usdt({
				balance: 100_000_000,
				spendable: 0,
				settled: 100_000_000,
				precision: 6
			});
			const next = await attachChainSpendable(
				{
					listUnspents: async () => [row],
					listTransfers: async () => [
						{
							kind: 'Send',
							status: 'WaitingConfirmations',
							txid: spentBy,
							assignments: [{ amount: 80_000_000 }]
						}
					]
				},
				[held]
			);
			expect(next[0]?.changeDue).toBe(true);
			expect(next[0]?.balance).toBe(0);
			expect(next[0]?.chainSpendable).toBe(0);
			expect(next[0]?.chainSpent).toBe(100_000_000);
			expect(next[0]?.pendingConfirm).toBe(false);
			const kept = holdUsdtBalance(next, [held]);
			expect(kept[0]?.balance).toBe(0);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('keeps a saved spent proof when the next check cannot see the output', () => {
		const held = usdt({
			balance: 100_000_000,
			spendable: 100_000_000,
			chainUnknown: true,
			precision: 6
		});
		const next = withSpentProof([held], { assetId: 'rgb:usdt', spent: 100_000_000 });
		expect(next[0]?.balance).toBe(0);
		expect(next[0]?.chainSpendable).toBe(0);
		expect(next[0]?.chainSpent).toBe(100_000_000);
		const live = usdt({
			balance: 80_000_000,
			spendable: 80_000_000,
			chainSpendable: 80_000_000,
			chainUnknown: false,
			precision: 6
		});
		expect(withSpentProof([live], { assetId: 'rgb:usdt', spent: 100_000_000 })[0]?.balance).toBe(
			80_000_000
		);
	});

	it('keeps the last USDT figure when the chain did not spend it', () => {
		const prior = usdt({ balance: 100_000_000, spendable: 100_000_000 });
		const glitch = usdt({ balance: 0, spendable: 0, chainSpent: 0 });
		expect(holdUsdtBalance([glitch], [prior])[0]?.balance).toBe(100_000_000);
		const spent = usdt({ balance: 0, spendable: 0, chainSpent: 100_000_000 });
		expect(holdUsdtBalance([spent], [prior])[0]?.balance).toBe(0);
	});
});
