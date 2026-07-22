/**
 * use-gasless-wallet.svelte.ts
 *
 * Manages EIP-7702 delegation state for connected wallets.
 * Detects whether a connected wallet has an active delegation, provides
 * enable/disable actions, and handles graceful degradation when delegation
 * is revoked externally.
 *
 * Key invariant: with EIP-7702, the smart account IS the EOA address.
 * Tokens stay at the EOA — no transfer needed for enablement or revocation.
 */

import { writable, derived } from 'svelte/store';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('gasless-wallet');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELEGATION_PREFIX = '0xef0100';
const SIMPLE_7702_IMPL = '0xB2779581b8B1F816b747fBa66c64D22196c7D001';
const STALE_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GaslessWalletState {
	isDelegated: boolean;
	delegateAddress: string | null;
	checking: boolean;
	enabling: boolean;
	revoking: boolean;
	error: string | null;
	lastChecked: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function createGaslessWalletStore() {
	const { subscribe, update, set } = writable<GaslessWalletState>({
		isDelegated: false,
		delegateAddress: null,
		checking: false,
		enabling: false,
		revoking: false,
		error: null,
		lastChecked: 0
	});

	return {
		subscribe,

		/**
		 * Check if a connected wallet has an active EIP-7702 delegation.
		 * Calls eth_getCode on the wallet address and checks for the delegation prefix.
		 */
		async checkDelegation(walletAddress: string, rpcUrl?: string): Promise<boolean> {
			update((s) => ({ ...s, checking: true, error: null }));

			try {
				if (!walletAddress || !walletAddress.startsWith('0x')) {
					throw new Error('Invalid wallet address');
				}

				const rpc = rpcUrl || 'https://arb1.arbitrum.io/rpc';
				const response = await fetch(rpc, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getCode',
						params: [walletAddress, 'latest'],
						id: 1
					}),
					signal: AbortSignal.timeout(10000)
				});

				const data = (await response.json()) as { result?: string; error?: { message: string } };
				if (data.error) {
					throw new Error(`RPC error: ${data.error.message}`);
				}

				const code = data.result || '0x';
				const isDelegated = code.toLowerCase().startsWith(DELEGATION_PREFIX);
				const delegateAddress = isDelegated ? '0x' + code.slice(10) : null;

				d.log(
					'Delegation check: addr=%s delegated=%s delegate=%s',
					walletAddress.substring(0, 10),
					isDelegated,
					delegateAddress?.substring(0, 10)
				);

				update((s) => ({
					...s,
					isDelegated,
					delegateAddress,
					checking: false,
					lastChecked: Date.now()
				}));

				return isDelegated;
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Delegation check failed';
				d.error('Delegation check failed: %s', msg);
				update((s) => ({
					...s,
					checking: false,
					error: msg,
					isDelegated: false,
					delegateAddress: null
				}));
				return false;
			}
		},

		/** Mark delegation as active after signing is confirmed on-chain. */
		setDelegated(delegateAddress: string): void {
			d.log('Delegation enabled: %s', delegateAddress.substring(0, 10));
			update((s) => ({
				...s,
				isDelegated: true,
				delegateAddress,
				enabling: false,
				error: null,
				lastChecked: Date.now()
			}));
		},

		/** Mark enablement as in progress (MetaMask popup open). */
		startEnabling(): void {
			update((s) => ({ ...s, enabling: true, error: null }));
		},

		/** Mark enablement as failed. */
		enableFailed(error: string): void {
			d.error('Enablement failed: %s', error);
			update((s) => ({ ...s, enabling: false, error }));
		},

		/** Mark delegation as revoked after revocation is confirmed on-chain. */
		setRevoked(): void {
			d.log('Delegation revoked');
			update((s) => ({
				...s,
				isDelegated: false,
				delegateAddress: null,
				revoking: false,
				error: null,
				lastChecked: Date.now()
			}));
		},

		/** Mark revocation as in progress. */
		startRevoking(): void {
			update((s) => ({ ...s, revoking: true, error: null }));
		},

		/** Mark revocation as failed. */
		revokeFailed(error: string): void {
			d.error('Revocation failed: %s', error);
			update((s) => ({ ...s, revoking: false, error }));
		},

		/** Reset state (e.g., when wallet disconnects). */
		reset(): void {
			set({
				isDelegated: false,
				delegateAddress: null,
				checking: false,
				enabling: false,
				revoking: false,
				error: null,
				lastChecked: 0
			});
		},

		/** Clear error state. */
		clearError(): void {
			update((s) => ({ ...s, error: null }));
		},

		/** Get the Simple7702Account implementation address. */
		getImplAddress(): string {
			return SIMPLE_7702_IMPL;
		}
	};
}

export const gaslessWalletState = createGaslessWalletStore();

// ---------------------------------------------------------------------------
// Derived stores
// ---------------------------------------------------------------------------

export const isGaslessReady = derived(
	gaslessWalletState,
	($s) => $s.isDelegated && !$s.checking && !$s.enabling
);

export const isGaslessBusy = derived(
	gaslessWalletState,
	($s) => $s.checking || $s.enabling || $s.revoking
);

export const isDelegationStale = derived(gaslessWalletState, ($s) => {
	if ($s.lastChecked === 0) return true;
	return Date.now() - $s.lastChecked > STALE_MS;
});
