import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock the debug utility
vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock AbortSignal.timeout
vi.stubGlobal('AbortSignal', {
	timeout: vi.fn().mockReturnValue(undefined)
});

import {
	gaslessWalletState,
	isGaslessReady,
	isGaslessBusy,
	isDelegationStale
} from '$lib/runes/use-gasless-wallet.svelte';

describe('use-gasless-wallet store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gaslessWalletState.reset();
	});

	afterEach(() => {
		gaslessWalletState.reset();
	});

	describe('initial state', () => {
		it('starts with isDelegated=false', () => {
			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(false);
		});

		it('starts with delegateAddress=null', () => {
			const state = get(gaslessWalletState);
			expect(state.delegateAddress).toBeNull();
		});

		it('starts with checking=false', () => {
			const state = get(gaslessWalletState);
			expect(state.checking).toBe(false);
		});

		it('starts with enabling=false', () => {
			const state = get(gaslessWalletState);
			expect(state.enabling).toBe(false);
		});

		it('starts with revoking=false', () => {
			const state = get(gaslessWalletState);
			expect(state.revoking).toBe(false);
		});

		it('starts with error=null', () => {
			const state = get(gaslessWalletState);
			expect(state.error).toBeNull();
		});

		it('starts with lastChecked=0', () => {
			const state = get(gaslessWalletState);
			expect(state.lastChecked).toBe(0);
		});
	});

	describe('derived stores', () => {
		it('isGaslessReady is false when not delegated', () => {
			expect(get(isGaslessReady)).toBe(false);
		});

		it('isGaslessBusy is false when idle', () => {
			expect(get(isGaslessBusy)).toBe(false);
		});

		it('isDelegationStale is true when lastChecked=0', () => {
			expect(get(isDelegationStale)).toBe(true);
		});

		it('isGaslessBusy is true when checking', () => {
			gaslessWalletState.checkDelegation('0x' + 'ab'.repeat(20));
			expect(get(isGaslessBusy)).toBe(true);
		});
	});

	describe('checkDelegation', () => {
		it('sets isDelegated=true when code has delegation prefix', async () => {
			const walletAddr = '0x' + 'ab'.repeat(20);
			const delegateAddr = '0x' + 'cd'.repeat(20);
			const delegationCode = '0xef0100' + delegateAddr.slice(2);

			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ result: delegationCode })
			});

			const result = await gaslessWalletState.checkDelegation(walletAddr);
			expect(result).toBe(true);

			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(true);
			expect(state.delegateAddress).toBe('0x' + delegationCode.slice(10));
			expect(state.checking).toBe(false);
		});

		it('sets isDelegated=false when code is 0x (no delegation)', async () => {
			const walletAddr = '0x' + 'ab'.repeat(20);

			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ result: '0x' })
			});

			const result = await gaslessWalletState.checkDelegation(walletAddr);
			expect(result).toBe(false);

			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(false);
			expect(state.delegateAddress).toBeNull();
		});

		it('throws on invalid wallet address', async () => {
			await expect(gaslessWalletState.checkDelegation('invalid')).resolves.toBe(false);
			const state = get(gaslessWalletState);
			expect(state.error).toContain('Invalid wallet address');
		});

		it('handles RPC error gracefully', async () => {
			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ error: { message: 'Internal error' } })
			});

			const result = await gaslessWalletState.checkDelegation('0x' + 'ab'.repeat(20));
			expect(result).toBe(false);

			const state = get(gaslessWalletState);
			expect(state.error).toContain('RPC error');
			expect(state.isDelegated).toBe(false);
		});

		it('handles network error gracefully', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await gaslessWalletState.checkDelegation('0x' + 'ab'.repeat(20));
			expect(result).toBe(false);

			const state = get(gaslessWalletState);
			expect(state.error).toBe('Network error');
		});

		it('updates lastChecked on success', async () => {
			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ result: '0x' })
			});

			const before = Date.now();
			await gaslessWalletState.checkDelegation('0x' + 'ab'.repeat(20));
			const after = Date.now();

			const state = get(gaslessWalletState);
			expect(state.lastChecked).toBeGreaterThanOrEqual(before);
			expect(state.lastChecked).toBeLessThanOrEqual(after);
		});
	});

	describe('state transitions', () => {
		it('setDelegated marks as delegated', () => {
			const delegateAddr = '0x' + 'cd'.repeat(20);
			gaslessWalletState.setDelegated(delegateAddr);

			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(true);
			expect(state.delegateAddress).toBe(delegateAddr);
			expect(state.enabling).toBe(false);
		});

		it('startEnabling sets enabling=true', () => {
			gaslessWalletState.startEnabling();
			expect(get(gaslessWalletState).enabling).toBe(true);
		});

		it('enableFailed sets error and clears enabling', () => {
			gaslessWalletState.startEnabling();
			gaslessWalletState.enableFailed('User rejected');

			const state = get(gaslessWalletState);
			expect(state.enabling).toBe(false);
			expect(state.error).toBe('User rejected');
		});

		it('setRevoked clears delegation state', () => {
			gaslessWalletState.setDelegated('0x' + 'cd'.repeat(20));
			gaslessWalletState.setRevoked();

			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(false);
			expect(state.delegateAddress).toBeNull();
			expect(state.revoking).toBe(false);
		});

		it('startRevoking sets revoking=true', () => {
			gaslessWalletState.startRevoking();
			expect(get(gaslessWalletState).revoking).toBe(true);
		});

		it('revokeFailed sets error and clears revoking', () => {
			gaslessWalletState.startRevoking();
			gaslessWalletState.revokeFailed('Transaction reverted');

			const state = get(gaslessWalletState);
			expect(state.revoking).toBe(false);
			expect(state.error).toBe('Transaction reverted');
		});

		it('clearError clears the error', () => {
			gaslessWalletState.enableFailed('test error');
			gaslessWalletState.clearError();
			expect(get(gaslessWalletState).error).toBeNull();
		});

		it('reset returns to initial state', () => {
			gaslessWalletState.setDelegated('0x' + 'cd'.repeat(20));
			gaslessWalletState.startEnabling();
			gaslessWalletState.reset();

			const state = get(gaslessWalletState);
			expect(state.isDelegated).toBe(false);
			expect(state.delegateAddress).toBeNull();
			expect(state.checking).toBe(false);
			expect(state.enabling).toBe(false);
			expect(state.revoking).toBe(false);
			expect(state.error).toBeNull();
			expect(state.lastChecked).toBe(0);
		});

		it('getImplAddress returns the implementation address', () => {
			expect(gaslessWalletState.getImplAddress()).toBe(
				'0xB2779581b8B1F816b747fBa66c64D22196c7D001'
			);
		});
	});

	describe('derived store integration', () => {
		it('isGaslessReady is true when delegated and not busy', () => {
			gaslessWalletState.setDelegated('0x' + 'cd'.repeat(20));
			expect(get(isGaslessReady)).toBe(true);
		});

		it('isGaslessReady is false when enabling', () => {
			gaslessWalletState.setDelegated('0x' + 'cd'.repeat(20));
			gaslessWalletState.startEnabling();
			expect(get(isGaslessReady)).toBe(false);
		});

		it('isDelegationStale is false after recent check', () => {
			gaslessWalletState.setDelegated('0x' + 'cd'.repeat(20));
			expect(get(isDelegationStale)).toBe(false);
		});

		it('isGaslessBusy is true when revoking', () => {
			gaslessWalletState.startRevoking();
			expect(get(isGaslessBusy)).toBe(true);
		});
	});
});
