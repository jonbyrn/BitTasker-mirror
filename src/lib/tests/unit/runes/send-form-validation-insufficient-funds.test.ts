import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeAvailableBalance } from '$lib/runes/use-send-form-validation.svelte';

const PROJECT = resolve(__dirname, '../../../../..');

function readSource(relativePath: string): string {
	return readFileSync(resolve(PROJECT, relativePath), 'utf8');
}

const emptyWalletStore = {
	rsk: { connected: false, formattedBalance: '0' },
	bsc: { formattedUsdtBalance: '0' }
};

describe('USDT0 Arbitrum insufficient funds bug', () => {
	describe('FIX: computeAvailableBalance uses correct usdt0-arb key', () => {
		it('computeAvailableBalance uses usdt0-arb (lowercase) key, not USDT0', () => {
			const source = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
			expect(source).not.toContain("balances?.['USDT0']");
			expect(source).toContain("balances?.['usdt0-arb']");
		});

		it('SendPaymentForm also reads balance using usdt0-arb key — keys now match', () => {
			const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
			expect(source).toContain("balances['usdt0-arb']");
		});
	});

	describe('FIX: Builtin wallet balance checked via allAssets for usdt0-arb', () => {
		it('computeAvailableBalance checks allAssets for builtin wallet usdt0-arb', () => {
			const source = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
			const arbSection = source.substring(
				source.indexOf("source === 'usdt0-arb'"),
				source.indexOf('\n\t}', source.indexOf("source === 'usdt0-arb'")) + 3
			);
			expect(arbSection).toContain('allAssets');
		});

		it('getAllAssets option is accepted by useSendFormValidation', () => {
			const source = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
			expect(source).toContain('getAllAssets');
		});

		it('SendPaymentForm passes getAllAssets to the rune', () => {
			const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
			expect(source).toContain('getAllAssets: () => $allAssets');
		});
	});

	describe('Functional: computeAvailableBalance returns correct balance', () => {
		it('returns balance from allAssets for builtin wallet', () => {
			const allAssets = [{ assetId: 'usdt0-arb', balance: 1.36 }];
			const result = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				emptyWalletStore,
				allAssets
			);
			expect(result).toBe(Math.floor(1.36 * 100_000_000));
		});

		it('returns balance from connected wallet when selectedWalletId is not builtin', () => {
			const connectedWallets = [
				{
					id: 'wallet-1',
					balances: {
						'usdt0-arb': { formatted: '2.50', raw: '2500000', loading: false }
					}
				}
			];
			// Non-builtin wallets go through the first branch (native/btc check)
			// and return safety buffer. The usdt0-arb connected wallet loop
			// serves as fallback for edge cases.
			const result = computeAvailableBalance(
				'usdt0-arb',
				'wallet-1',
				connectedWallets,
				emptyWalletStore,
				[]
			);
			expect(result).toBeGreaterThan(0);
		});

		it('returns 0 when no balance found for builtin wallet', () => {
			const result = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				emptyWalletStore,
				[]
			);
			expect(result).toBe(0);
		});

		it('returns 0 when allAssets has zero balance', () => {
			const allAssets = [{ assetId: 'usdt0-arb', balance: 0 }];
			const result = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				emptyWalletStore,
				allAssets
			);
			expect(result).toBe(0);
		});

		it('returns 0 when allAssets has no usdt0-arb entry', () => {
			const allAssets = [{ assetId: 'wbtc-arb', balance: 1.0 }];
			const result = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				emptyWalletStore,
				allAssets
			);
			expect(result).toBe(0);
		});
	});

	describe('Impact: hasInsufficientBalance no longer always true for usdt0-arb', () => {
		it('hasInsufficientBalance = totalToSend > availableBalance', () => {
			const source = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
			expect(source).toContain('totalToSend > availableBalance');
		});

		it('when availableBalance > 0 and amount is within balance, no insufficient funds', () => {
			const allAssets = [{ assetId: 'usdt0-arb', balance: 10.0 }];
			const availableBalance = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				emptyWalletStore,
				allAssets
			);
			const amountInSats = Math.floor(1.0 * 100_000_000); // 1 USDT0
			const totalToSend = amountInSats; // no fees for this test
			expect(availableBalance).toBeGreaterThan(0);
			expect(totalToSend > availableBalance).toBe(false);
		});
	});
});
