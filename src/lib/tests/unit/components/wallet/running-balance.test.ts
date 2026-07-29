/**
 * running-balance.ts — Unit tests for computeRunningBalances.
 */
import { describe, it, expect } from 'vitest';
import { computeRunningBalances } from '$lib/components/wallet/running-balance';
import type { ConnectedTransaction } from '$lib/services/connected-wallet-transactions';

/** Helper to create a minimal ConnectedTransaction for testing. */
function tx(overrides: Partial<ConnectedTransaction> & { hash: string }): ConnectedTransaction {
	return {
		from: '0xabc',
		to: '0xdef',
		valueWei: '0',
		valueSats: 0,
		timestamp: '2024-01-01T00:00:00Z',
		status: 'success',
		network: 'rsk',
		type: 'send',
		feeSats: 0,
		explorerUrl: '',
		walletId: 'w1',
		walletName: 'Test',
		walletType: 'metamask',
		walletAddress: '0xabc',
		...overrides
	};
}

describe('computeRunningBalances', () => {
	it('returns empty array for empty transactions', () => {
		expect(computeRunningBalances([], {})).toEqual([]);
	});

	it('returns empty array when transactions is empty regardless of balances', () => {
		expect(computeRunningBalances([], { w1: { rbtc: '100000' } })).toEqual([]);
	});

	it('computes balance for a single successful RSK send', () => {
		const txs = [
			tx({ hash: '0x1', type: 'send', valueSats: 50000, feeSats: 1000, network: 'rsk' })
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '40000' } });
		// After send: balance is 40000. Before send: 40000 + 50000 + 1000 = 91000
		expect(result[0].balanceAfter).toBe(40000);
	});

	it('computes balance for a single successful RSK receive', () => {
		const txs = [
			tx({ hash: '0x1', type: 'receive', valueSats: 30000, feeSats: 0, network: 'rsk' })
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '50000' } });
		// After receive: balance is 50000. Before receive: 50000 - 30000 = 20000
		expect(result[0].balanceAfter).toBe(50000);
	});

	it('does not adjust for failed receive', () => {
		const txs = [
			tx({
				hash: '0x1',
				type: 'receive',
				valueSats: 99999,
				feeSats: 0,
				status: 'failed',
				network: 'rsk'
			})
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '50000' } });
		// Failed receive never arrived, balance unchanged
		expect(result[0].balanceAfter).toBe(50000);
	});

	it('only subtracts fee for failed send', () => {
		const txs = [
			tx({
				hash: '0x1',
				type: 'send',
				valueSats: 50000,
				feeSats: 1000,
				status: 'failed',
				network: 'rsk'
			})
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '49000' } });
		// Failed send: value not spent, but gas consumed. Before: 49000 + 1000 = 50000
		expect(result[0].balanceAfter).toBe(49000);
	});

	it('handles multiple transactions newest-first with correct running balance', () => {
		// Current balance: 100000 sats
		// Tx1 (newest): receive 20000 → balanceAfter = 100000, running becomes 80000
		// Tx2: send 30000 + fee 500 → balanceAfter = 80000, running becomes 110500
		// Tx3 (oldest): receive 10500 → balanceAfter = 110500, running becomes 100000
		const txs = [
			tx({ hash: '0x1', type: 'receive', valueSats: 20000, feeSats: 0, network: 'rsk' }),
			tx({ hash: '0x2', type: 'send', valueSats: 30000, feeSats: 500, network: 'rsk' }),
			tx({ hash: '0x3', type: 'receive', valueSats: 10500, feeSats: 0, network: 'rsk' })
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '100000' } });
		expect(result[0].balanceAfter).toBe(100000);
		expect(result[1].balanceAfter).toBe(80000);
		expect(result[2].balanceAfter).toBe(110500);
	});

	it('aggregates balances from multiple wallets', () => {
		const txs = [
			tx({ hash: '0x1', type: 'receive', valueSats: 10000, feeSats: 0, network: 'rsk' })
		];
		const result = computeRunningBalances(txs, {
			w1: { rbtc: '50000' },
			w2: { rbtc: '30000', btc: '20000' }
		});
		// Total: 50000 + 30000 + 20000 = 100000
		expect(result[0].balanceAfter).toBe(100000);
	});

	it('treats Arbitrum native transfers the same as RSK', () => {
		const txs = [
			tx({
				hash: '0x1',
				type: 'send',
				valueSats: 10000,
				feeSats: 500,
				network: 'arbitrum'
			})
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '39500' } });
		// After send: 39500. Before: 39500 + 10000 + 500 = 50000
		expect(result[0].balanceAfter).toBe(39500);
	});

	it('does not affect BTC running balance for ERC-20 token transfers', () => {
		const txs = [
			tx({
				hash: '0x1',
				type: 'send',
				valueSats: 100000,
				feeSats: 0,
				network: 'arbitrum',
				tokenSymbol: 'USDT',
				tokenAmount: '10.00'
			})
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '50000' } });
		// ERC-20 transfer doesn't change BTC balance
		expect(result[0].balanceAfter).toBe(50000);
	});

	it('handles mixed RSK and Arbitrum token transactions', () => {
		const txs = [
			// Newest: USDT transfer (no BTC impact)
			tx({
				hash: '0x1',
				type: 'send',
				valueSats: 0,
				feeSats: 0,
				network: 'arbitrum',
				tokenSymbol: 'USDT'
			}),
			// Middle: RSK send
			tx({ hash: '0x2', type: 'send', valueSats: 20000, feeSats: 1000, network: 'rsk' }),
			// Oldest: Arbitrum native receive
			tx({ hash: '0x3', type: 'receive', valueSats: 30000, feeSats: 0, network: 'arbitrum' })
		];
		const result = computeRunningBalances(txs, { w1: { rbtc: '59000' } });
		// Tx1: USDT → balanceAfter = 59000 (no change), running stays 59000
		// Tx2: send 20000 + 1000 → balanceAfter = 59000, running = 59000 + 21000 = 80000
		// Tx3: receive 30000 → balanceAfter = 80000, running = 80000 - 30000 = 50000
		expect(result[0].balanceAfter).toBe(59000);
		expect(result[1].balanceAfter).toBe(59000);
		expect(result[2].balanceAfter).toBe(80000);
	});

	it('handles zero balances', () => {
		const txs = [tx({ hash: '0x1', type: 'receive', valueSats: 5000, feeSats: 0, network: 'rsk' })];
		const result = computeRunningBalances(txs, { w1: { rbtc: '5000' } });
		expect(result[0].balanceAfter).toBe(5000);
	});

	it('handles missing wallet balances gracefully', () => {
		const txs = [tx({ hash: '0x1', type: 'send', valueSats: 1000, feeSats: 100, network: 'rsk' })];
		const result = computeRunningBalances(txs, {});
		// No balances → currentBtcSats = 0. After send: 0. Before: 0 + 1100 = 1100
		expect(result[0].balanceAfter).toBe(0);
	});
});
