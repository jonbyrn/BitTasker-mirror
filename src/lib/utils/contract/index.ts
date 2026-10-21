import { ethers, type JsonRpcProvider } from 'ethers';
import {
	getWallet as walletFromStore,
	getProvider as providerFromStore,
	walletManager
} from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';
import type { ContractChain, InitializedContract } from './types';

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
		await walletManager.initialize({ prompt: 'escrow' });
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
	return provider;
}

/**
 * Ensures wallet + provider for `chain` and returns an ethers Contract at `contractAddress`
 * bound to the signer (same ABI as v1 escrow).
 *
 * @param contractAddress - Required; no implicit default env address.
 * @param chain - Defaults to RSK.
 */
export async function initContract(
	contractAddress: string,
	chain: ContractChain = 'rsk',
	contractAbi: ethers.InterfaceAbi
): Promise<InitializedContract> {
	const trimmed = contractAddress?.trim();
	if (!trimmed) {
		const err = new Error('Contract address is required');
		d.error('initContract: invalid address', err);
		throw err;
	}

	//d.log('initContract: start', { chain, contractAddress: trimmed });

	let checksummed: string;
	try {
		checksummed = ethers.getAddress(trimmed.toLowerCase());
	} catch (e) {
		d.error('initContract: getAddress failed', e);
		throw new Error(`Invalid contract address: ${trimmed}`);
	}

	const [wallet, provider] = await Promise.all([getWallet(chain), getProvider(chain)]);

	const contract = new ethers.Contract(checksummed, contractAbi, wallet);

	d.log('initContract: ready', { chain, checksummed });
	return { contract, wallet, provider };
}
