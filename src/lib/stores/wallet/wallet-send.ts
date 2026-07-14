/**
 * Wallet Send — transaction sending and gas estimation
 */

import { type GasEstimation, ERC20_ABI } from '@bittasker/wallet-core';
import { get } from 'svelte/store';
import { ethers } from 'ethers';
import tokenBalanceService from '$lib/api/services/token-balance.service';
import { walletStore, getWalletManager } from './wallet-state';
import { loadAssets } from './wallet-balances';
import { loadTransactions } from './wallet-transactions';

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Send RBTC transaction.
 */
export async function sendRBTC(to: string, amount: string): Promise<string> {
	const manager = getWalletManager();
	const txHash = await manager.rskWallet.send(to, amount);

	void Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Send a raw transaction with calldata (for contract interactions like LI.FI swaps).
 */
export async function sendRawTransaction(params: {
	to: string;
	data: string;
	value: string;
	gasLimit?: number;
	chain?: 'rsk' | 'bsc';
}): Promise<string> {
	const manager = getWalletManager();
	const chain = params.chain ?? 'rsk';
	const wallet =
		chain === 'bsc'
			? (manager.bscWallet.getWallet() as import('ethers').Wallet)
			: (manager.rskWallet.getWallet() as import('ethers').Wallet);

	const tx = await wallet.sendTransaction({
		to: params.to,
		data: params.data,
		value: params.value,
		...(params.gasLimit !== undefined && { gasLimit: params.gasLimit })
	});
	await Promise.allSettled([loadAssets(), loadTransactions()]);
	return tx.hash;
}

/**
 * Send a transaction on Arbitrum.
 *
 * Tries the gasless relay first (via EIP-7702 smart account) when the gasless
 * wallet is initialized. Falls back to a direct transaction signed by the
 * built-in RSK wallet if the relay is unavailable or fails.
 */
export async function sendArbitrumTransaction(params: {
	to: string;
	data: string;
	value: string;
	gasLimit?: number;
}): Promise<string> {
	// --- Gasless path (smart account via ERC-4337 relay) ---
	try {
		const { sendGaslessCalls, walletReady } = await import('$lib/wallet/gasless-store');
		const { get } = await import('svelte/store');

		if (get(walletReady)) {
			const jwt = (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) || '';
			if (jwt) {
				const { USDT0_ADDRESS, FEE_BUFFER_MIN } = await import('$lib/wallet/gasless.config');
				const feeToken = USDT0_ADDRESS;
				const feeBuffer = FEE_BUFFER_MIN[feeToken.toLowerCase()] ?? 10_000n;

				const callValue = params.value ? BigInt(params.value) : 0n;
				// Add 30s timeout to gasless relay — if it hangs, fall through to direct tx
				const txHash = await Promise.race([
					sendGaslessCalls(
						[{ to: params.to, data: params.data, value: callValue }],
						feeToken,
						feeBuffer,
						jwt
					),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('Gasless relay timeout (30s)')), 30_000)
					)
				]);

				await Promise.allSettled([loadAssets(), loadTransactions()]);
				return txHash;
			}
		}
	} catch (gaslessErr) {
		// Gasless relay unavailable or failed — fall through to direct transaction
		console.warn(
			'[sendArbitrumTransaction] Gasless relay failed, falling back to direct tx:',
			gaslessErr
		);
	}

	// --- Direct path (RSK wallet signs and sends with ETH for gas) ---
	console.warn('[sendArbitrumTransaction] Falling back to direct tx with ETH for gas');
	const manager = getWalletManager();
	const wallet = manager.rskWallet.getWallet() as import('ethers').Wallet;
	const ARB_RPC = import.meta.env.VITE_ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc';
	const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
	const arbWallet = wallet.connect(arbProvider);
	const tx = await arbWallet.sendTransaction({
		to: params.to,
		data: params.data,
		value: params.value,
		...(params.gasLimit !== undefined && { gasLimit: params.gasLimit })
	});
	console.warn('[sendArbitrumTransaction] Direct tx submitted: %s', tx.hash);
	await Promise.allSettled([loadAssets(), loadTransactions()]);
	return tx.hash;
}

/**
 * Send ERC-20 token transaction.
 */
export async function sendRSKToken(
	tokenAddress: string,
	to: string,
	amount: string
): Promise<string> {
	const manager = getWalletManager();
	const wallet = manager.rskWallet.getWallet();
	const provider = manager.rskWallet.getProvider();

	if (!wallet || !provider) {
		throw new Error('RSK wallet not initialized');
	}

	// Normalize addresses to EIP-55 checksum format (required by ethers v6)
	const normalizedTokenAddress = ethers.getAddress(tokenAddress.toLowerCase());
	const normalizedTo = ethers.getAddress(to.toLowerCase());

	// Create ERC-20 contract instance
	const tokenContract = new ethers.Contract(normalizedTokenAddress, ERC20_ABI, wallet);

	// Get token decimals
	const decimals = await tokenContract.decimals();

	// Parse amount with correct decimals
	const amountWei = ethers.parseUnits(amount, decimals);

	// Send transaction with normalized address
	const tx = await tokenContract.transfer(normalizedTo, amountWei);

	const receipt = await tx.wait();
	if (!receipt) {
		throw new Error('Transaction receipt is null');
	}

	// Refresh data and invalidate token cache
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	// Invalidate token balance cache after successful send
	const state = get(walletStore);
	if (state.rsk?.address) {
		tokenBalanceService.clearBalanceCache(state.rsk.address);
	}

	return receipt.hash;
}

/**
 * Send BSC USDT transaction.
 */
export async function sendBSCUSDT(to: string, amount: string): Promise<string> {
	const manager = getWalletManager();
	const txHash = await manager.bscWallet.sendUSDT(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Send BSC BNB transaction.
 */
export async function sendBSCBNB(to: string, amount: string): Promise<string> {
	const manager = getWalletManager();
	if (!manager.bscWallet) {
		throw new Error('BSC wallet not initialized — cannot send BNB');
	}
	const txHash = await manager.bscWallet.sendBNB(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Send USDT0 on RSK (ERC-20 transfer via RSKWallet.sendToken).
 */
export async function sendRSKUSDT0(to: string, amount: string): Promise<string> {
	const manager = getWalletManager();
	if (!manager.rskWallet) {
		throw new Error('RSK wallet not initialized — cannot send USDT0');
	}
	const USDT0_RSK_ADDRESS = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';
	const txHash = await manager.rskWallet.sendToken(USDT0_RSK_ADDRESS, to, amount, 6);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Estimate gas for ERC-20 token transfer.
 */
export async function estimateERC20Gas(
	tokenAddress: string,
	to: string,
	amount: string
): Promise<GasEstimation> {
	try {
		const storeState = get(walletStore);
		if (!storeState.rsk.wallet || !storeState.rsk.provider) {
			console.error('[WALLET-STORE] estimateERC20Gas() - Wallet not initialized:', {
				hasWallet: !!storeState.rsk.wallet,
				hasProvider: !!storeState.rsk.provider
			});
			throw new Error('RSK wallet not initialized');
		}

		const provider = storeState.rsk.provider;
		const wallet = storeState.rsk.wallet;

		// Normalize addresses to EIP-55 checksum format
		const normalizedTokenAddress = ethers.getAddress(tokenAddress.toLowerCase());
		const normalizedTo = ethers.getAddress(to.toLowerCase());

		// Create ERC-20 contract instance
		const tokenContract = new ethers.Contract(normalizedTokenAddress, ERC20_ABI, wallet);

		// Get token decimals
		const decimals = await tokenContract.decimals();

		// Parse amount with correct decimals
		const amountWei = ethers.parseUnits(amount, decimals);

		// Estimate gas for transfer
		const gasEstimate = await tokenContract.transfer.estimateGas(normalizedTo, amountWei);

		// Get gas price
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);

		// Calculate total cost (gas only, no value for ERC-20)
		const gasCost = gasEstimate * gasPrice;

		return {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			totalCost: gasCost.toString(),
			totalCostFormatted: ethers.formatEther(gasCost)
		};
	} catch (error) {
		throw new Error(
			`ERC-20 gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Estimate gas for RBTC transaction.
 */
export async function estimateRBTCGas(to: string, amount: string): Promise<GasEstimation> {
	try {
		const manager = getWalletManager();
		return await manager.rskWallet.estimateGas(to, amount);
	} catch (error) {
		throw new Error(
			`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
