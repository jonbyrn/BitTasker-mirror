import { ethers, type JsonRpcProvider } from 'ethers';
import {
	getWallet as walletFromStore,
	getProvider as providerFromStore,
	walletManager
} from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';
import type { ContractChain } from './types';

const d = createDebug('contract');

/**
 * EVM contract helpers (RSK, BSC, …): wallet/provider resolution and contract instances.
 * Initialization is encapsulated here — callers do not re-implement walletManager.initialize().
 */

function isProviderDestroyed(provider: JsonRpcProvider): boolean {
	const p = provider as JsonRpcProvider & { destroyed?: boolean; _destroyed?: boolean };
	return p._destroyed === true || p.destroyed === true;
}

/**
 * Returns a connected wallet for the chain, initializing the wallet manager if needed.
 */
export async function getWallet(chain: ContractChain = 'rsk'): Promise<ethers.Wallet> {
	let wallet = walletFromStore(chain);
	if (!wallet) {
		d.log('getWallet: store empty, initializing', { chain });
		await walletManager.initialize();
		wallet = walletFromStore(chain);
	}
	if (!wallet) {
		const err = new Error(`Failed to initialize ${chain} wallet`);
		d.error('getWallet: still no wallet after initialize', err);
		throw err;
	}
	if (!wallet.address) {
		const err = new Error('Wallet address not available. Connect your wallet first.');
		d.error('getWallet: missing address', err);
		throw err;
	}
	d.log('getWallet: ok', { chain, address: wallet.address });
	return wallet;
}

/**
 * Returns an RPC provider for the chain, re-initializing if missing or destroyed.
 */
export async function getProvider(chain: ContractChain = 'rsk'): Promise<ethers.JsonRpcProvider> {
	let provider = providerFromStore(chain);
	if (!provider || isProviderDestroyed(provider)) {
		d.log('getProvider: missing or destroyed, initializing', { chain });
		await walletManager.initialize();
		provider = providerFromStore(chain);
	}
	if (!provider || isProviderDestroyed(provider)) {
		const err = new Error(`Failed to initialize ${chain} provider`);
		d.error('getProvider: failed after initialize', err);
		throw err;
	}
	d.log('getProvider: ok', { chain });
	return provider;
}
