import { describe, it, expect } from 'vitest';
import type { ComponentType } from 'svelte';
import {
	dedupChainClaims,
	dedupSwapRows,
	projectTransactions,
	filterMinerFeeClaims,
	dedupePairedReverseClaims,
	sortByActivity,
	applyChainSortHints
} from '$lib/utils/wallet/transactionLedger';
import type { ProcessedTransaction } from '$lib/types/wallet';
import { statusUI } from '$lib/utils/constants/transactions.constants';

const statusConfirmed = statusUI.confirmed as unknown as {
	label: string;
	icon: ComponentType;
	color: string;
};
const _statusPending = statusUI.pending as unknown as {
	label: string;
	icon: ComponentType;
	color: string;
};
const statusFailed = statusUI.failed as unknown as {
	label: string;
	icon: ComponentType;
	color: string;
};

function makeClaimTx(hash: string, preimage: string, failed: boolean): ProcessedTransaction {
	return {
		hash,
		from: '0xuser',
		to: '0xcontract',
		value: '3332',
		timestamp: '2024-01-15T10:00:00Z',
		status: failed ? statusFailed : statusConfirmed,
		network: 'rsk',
		type: 'swap',
		subType: 'claim',
		displayType: 'swap-claim',
		borderColor: failed ? 'error' : 'success',
		iconConfig: { base: null as never, overlay: null },
		title: failed ? 'wallet.swap.failed_receive' : 'wallet.received',
		networkIcon: '',
		networkDisplayName: 'RSK',
		explorerUrl: null,
		feeSats: 0,
		balanceAfter: 0,
		decodedInput: {
			parameters: [{ name: 'preimage', value: preimage }]
		}
	};
}

describe('transactionLedger', () => {
	it('should hide failed claim when successful claim exists for same preimage', () => {
		const preimage = '0xabc';
		const txs = [makeClaimTx('0xfail', preimage, true), makeClaimTx('0xok', preimage, false)];
		const result = dedupChainClaims(txs);
		expect(result).toHaveLength(1);
		expect(result[0].hash).toBe('0xok');
	});

	it('should dedup swap rows by swap id', () => {
		const swapA: ProcessedTransaction = {
			hash: 'swap-1',
			from: 'user',
			to: 'boltz',
			value: '1000',
			timestamp: '2024-01-15T10:00:00Z',
			status: _statusPending,
			network: 'lightning',
			type: 'send',
			displayType: 'send',
			borderColor: 'neutral',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.swap.pending_send',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0,
			swap: { id: 'swap-1', type: 'submarine', actions: [], rawStatus: 'invoice.set' }
		};
		const duplicate = { ...swapA, hash: 'swap-1-alt', title: 'duplicate' };
		const result = dedupSwapRows([swapA, duplicate], new Set());
		expect(result).toHaveLength(1);
	});

	it('should compute unified running balance', () => {
		const chain: ProcessedTransaction = {
			hash: '0xchain',
			from: '0xuser',
			to: '0xother',
			value: '1000',
			timestamp: '2024-01-16T10:00:00Z',
			status: statusConfirmed,
			network: 'rsk',
			type: 'send',
			displayType: 'send',
			borderColor: 'warning',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.sent',
			networkIcon: '',
			networkDisplayName: 'RSK',
			explorerUrl: null,
			feeSats: 100,
			balanceAfter: 0
		};
		const result = projectTransactions([chain], [], 50_000);
		expect(result[0].balanceAfter).toBe(50_000);
	});

	it('should hide claimMinerFee chain rows', () => {
		const main = makeClaimTx('0xmain', '0xabc', false);
		const minerFee = {
			...makeClaimTx('0xfee', '0xdef', false),
			methodName: 'claimMinerFee',
			value: '310'
		};
		const result = filterMinerFeeClaims([main, minerFee]);
		expect(result).toHaveLength(1);
		expect(result[0].hash).toBe('0xmain');
	});

	it('should hide claimMinerFee when only method_call differs', () => {
		const main = makeClaimTx('0xmain', '0xabc', false);
		const minerFee = {
			...makeClaimTx('0xfee', '0xdef', false),
			decodedInput: { method_call: 'claimMinerFee(bytes32,uint256)' },
			value: '310'
		};
		expect(filterMinerFeeClaims([main, minerFee])).toHaveLength(1);
	});

	it('should keep largest reverse claim when paired within 15 minutes', () => {
		const small = {
			...makeClaimTx('0xsmall', '0x1', false),
			displayType: 'receive' as const,
			value: '310',
			timestamp: '2024-06-05T23:12:00Z'
		};
		const large = {
			...makeClaimTx('0xlarge', '0x2', false),
			value: '2500',
			timestamp: '2024-06-05T23:20:00Z'
		};
		const result = dedupePairedReverseClaims([small, large]);
		expect(result).toHaveLength(1);
		expect(result[0].hash).toBe('0xlarge');
	});

	it('should not drop unrelated receives in the same window', () => {
		const first = {
			...makeClaimTx('0xa', '0x1', false),
			displayType: 'receive' as const,
			value: '2000',
			timestamp: '2024-06-05T23:12:00Z'
		};
		const second = {
			...makeClaimTx('0xb', '0x2', false),
			displayType: 'receive' as const,
			value: '1800',
			timestamp: '2024-06-05T23:14:00Z'
		};
		expect(dedupePairedReverseClaims([first, second])).toHaveLength(2);
	});

	it('should sort by sortTimestamp when present', () => {
		const older: ProcessedTransaction = {
			hash: '0xold',
			from: 'a',
			to: 'b',
			value: '100',
			timestamp: '2024-01-20T10:00:00Z',
			status: statusConfirmed,
			network: 'rsk',
			type: 'receive',
			displayType: 'receive',
			borderColor: 'success',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.received',
			networkIcon: '',
			networkDisplayName: 'RSK',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0
		};
		const newerBlockOlderActivity = {
			...older,
			hash: '0xnew',
			timestamp: '2024-01-10T10:00:00Z',
			sortTimestamp: '2024-01-25T10:00:00Z'
		};
		const sorted = sortByActivity([older, newerBlockOlderActivity]);
		expect(sorted[0].hash).toBe('0xnew');
	});

	it('should apply chain sort hints from completed swaps', () => {
		const hints = new Map([['0xclaim', '2024-06-05T23:30:00Z']]);
		const tx: ProcessedTransaction = {
			hash: '0xclaim',
			from: 'a',
			to: 'b',
			value: '2500',
			timestamp: '2024-06-05T23:12:00Z',
			status: statusConfirmed,
			network: 'lightning',
			type: 'swap',
			displayType: 'swap-claim',
			borderColor: 'success',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.received',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0
		};
		const [patched] = applyChainSortHints([tx], hints);
		expect(patched.sortTimestamp).toBe('2024-06-05T23:30:00Z');
	});

	it('should order receive hint above awaiting swaps above sent lockup hint', () => {
		const sentLockup: ProcessedTransaction = {
			hash: '0xsend',
			from: 'user',
			to: 'boltz',
			value: '2535',
			timestamp: '2024-06-05T23:25:00Z',
			sortTimestamp: '2024-06-05T22:00:00Z',
			status: statusConfirmed,
			network: 'lightning',
			type: 'send',
			displayType: 'send' as const,
			borderColor: 'warning' as const,
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.sent',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 119,
			balanceAfter: 0
		};
		const receiveClaim = {
			hash: '0xclaim',
			from: 'boltz',
			to: 'user',
			value: '2500',
			timestamp: '2024-06-05T23:20:00Z',
			sortTimestamp: '2024-06-05T23:35:00Z',
			status: statusConfirmed,
			network: 'rsk',
			type: 'receive',
			displayType: 'swap-claim' as const,
			borderColor: 'success' as const,
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.received',
			networkIcon: '',
			networkDisplayName: 'RSK',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0
		};
		const awaiting = (id: string, ts: string): ProcessedTransaction => ({
			hash: `swap-${id}`,
			from: 'boltz',
			to: 'user',
			value: '4700',
			timestamp: ts,
			status: _statusPending,
			network: 'lightning',
			type: 'receive',
			displayType: 'receive',
			borderColor: 'neutral',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.swap.awaiting_payment',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0,
			swap: { id, type: 'reverse', actions: [], rawStatus: 'swap.created' }
		});

		const merged = projectTransactions(
			[sentLockup, receiveClaim] as unknown as ProcessedTransaction[],
			[
				awaiting('a', '2024-06-05T23:32:00Z'),
				awaiting('b', '2024-06-05T23:32:00Z'),
				awaiting('c', '2024-06-05T23:31:00Z'),
				awaiting('d', '2024-06-05T23:31:00Z')
			],
			4200
		);

		expect(merged[0].hash).toBe('0xclaim');
		expect(merged[1].swap?.id).toBe('a');
		expect(merged[merged.length - 1].hash).toBe('0xsend');
	});

	it('should drop stale swap rows when lockup exists on-chain', () => {
		const lockupHash = '0x' + 'A'.repeat(64);
		const chainTx: ProcessedTransaction = {
			hash: lockupHash.toLowerCase(),
			from: 'user',
			to: 'boltz',
			value: '3301',
			timestamp: '2024-06-06T02:33:00Z',
			status: statusConfirmed,
			network: 'lightning',
			type: 'send',
			displayType: 'send',
			borderColor: 'warning',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.sent',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 119,
			balanceAfter: 0
		};
		const staleSwap: ProcessedTransaction = {
			hash: lockupHash,
			from: 'user',
			to: 'boltz',
			value: '3265',
			timestamp: '2024-06-06T02:33:00Z',
			status: _statusPending,
			network: 'lightning',
			type: 'send',
			displayType: 'send',
			borderColor: 'neutral',
			iconConfig: { base: null as never, overlay: null },
			title: 'wallet.swap.pending_send',
			networkIcon: '',
			networkDisplayName: 'LN',
			explorerUrl: null,
			feeSats: 0,
			balanceAfter: 0,
			swap: {
				id: 'swap-1',
				type: 'submarine',
				actions: [],
				rawStatus: 'invoice.pending'
			}
		};

		const result = projectTransactions([chainTx], [staleSwap], 4200);
		expect(result).toHaveLength(1);
		expect(result[0].hash).toBe(lockupHash.toLowerCase());
	});
});
