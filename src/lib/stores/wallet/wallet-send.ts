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
 * built-in RSK wallet only when the gasless wallet is not initialized.
 *
 * When `feeToken` is provided (atomic claim+fee pattern), the gasless relay
 * is the ONLY path — there is no direct-tx fallback because the user has no
 * ETH on Arbitrum (that's the whole reason for gasless).
 */
export async function sendArbitrumTransaction(params: {
	to: string;
	data: string;
	value: string;
	gasLimit?: number;
	feeToken?: string;
	extraCalls?: Array<{ to: string; data: string; value: bigint }>;
}): Promise<string> {
	const { sendGaslessCalls, walletReady, estimateFee } = await import('$lib/wallet/gasless-store');
	const { get } = await import('svelte/store');

	// Gasless wallet not initialized — direct tx is the only option
	if (!get(walletReady)) {
		return sendDirectArbitrumTx(params);
	}

	const { TOKENS } = await import('$lib/wallet/gasless.config');
	const callValue = params.value ? BigInt(params.value) : 0n;

	// If a preferred fee token is provided (e.g., tBTC when claiming),
	// use it directly — the claim produces the tokens atomically in the
	// same executeBatch, so no pre-existing balance is needed.
	// This is gasless-only: no direct-tx fallback because the user has
	// no ETH on Arbitrum (that's the whole point of the gasless relay).
	if (params.feeToken) {
		// Prepend extraCalls (e.g., ERC-20 approve) BEFORE the primary call
		// so that approvals are granted before the swap/router pulls tokens.
		// The fee transfer is appended last by sendGaslessCalls.
		const actualCalls = [
			...(params.extraCalls ?? []).map((c) => ({ to: c.to, data: c.data, value: c.value })),
			{ to: params.to, data: params.data, value: callValue }
		];
		const estimate = await estimateFee(params.feeToken, 1n, params.to, actualCalls);
		const feeBuffer = BigInt(estimate.feeBuffer);
		const tokenInfo = TOKENS.find((t) => t.address.toLowerCase() === params.feeToken!.toLowerCase());
		console.log(`[sendArbitrumTransaction] Using preferred fee token ${tokenInfo?.symbol ?? params.feeToken}, feeBuffer=${feeBuffer}`);

		// Safety check: verify the fee token balance covers the fee buffer.
		// For atomic claim+fee patterns (e.g., Boltz tBTC claim), the balance
		// may be 0 before execution — skip the check in that case.
		const { queryERC20Balance } = await import('$lib/services/swap-chain/tx-helpers');
		const { gaslessWallet } = await import('$lib/wallet/gasless-store');
		const prefSender = get(gaslessWallet).address;
		if (prefSender) {
			const feeBalance = await queryERC20Balance(params.feeToken, prefSender, 'arbitrum');
			if (feeBalance !== null && feeBalance > 0n && feeBalance < feeBuffer) {
				console.warn(`[sendArbitrumTransaction] Insufficient ${tokenInfo?.symbol} for fee: have ${feeBalance}, need ${feeBuffer}`);
			}
		}

		const txHash = await Promise.race([
			sendGaslessCalls(
				actualCalls,
				params.feeToken,
				feeBuffer,
				estimate.estimatedGas
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Gasless relay timeout (30s)')), 30_000)
			)
		]);

		console.log(`[sendArbitrumTransaction] Gasless relay succeeded with preferred ${tokenInfo?.symbol ?? params.feeToken} fee`);
		void Promise.allSettled([loadAssets(), loadTransactions()]);
		return txHash;
	}

	// No preferred token — scan all allowed fee token balances
	const { queryERC20Balance } = await import('$lib/services/swap-chain/tx-helpers');
	const { gaslessWallet } = await import('$lib/wallet/gasless-store');
	const walletState = get(gaslessWallet);
	const sender = walletState.address;
	if (!sender) throw new Error('Gasless wallet address not available');

	// Check all allowed fee token balances in parallel
	const balanceChecks = await Promise.all(
		TOKENS.map(async (token) => {
			const balance = await queryERC20Balance(token.address, sender, 'arbitrum');
			return { token: token.address, symbol: token.symbol, balance: balance ?? 0n };
		})
	);

	// Sort by balance descending — prefer the token the user has the most of
	const sorted = balanceChecks.filter((b) => b.balance > 0n).sort((a, b) => (a.balance > b.balance ? -1 : 1));

	let lastErr: Error | null = null;

	// Try with fee buffer first (user has tokens)
	if (sorted.length > 0) {
		for (const { token: feeToken, symbol } of sorted) {
			try {
				const actualCalls = [
					...(params.extraCalls ?? []).map((c) => ({ to: c.to, data: c.data, value: c.value })),
					{ to: params.to, data: params.data, value: callValue }
				];
				const estimate = await estimateFee(feeToken, 1n, params.to, actualCalls);
				const feeBuffer = BigInt(estimate.feeBuffer);

				const tokenBalance = sorted.find((b) => b.token === feeToken)?.balance ?? 0n;
				if (tokenBalance < feeBuffer) {
					console.log(`[sendArbitrumTransaction] Insufficient ${symbol} for fee buffer: have ${tokenBalance}, need ${feeBuffer}`);
					continue;
				}

				// Safety warning: if the balance barely covers the fee buffer,
				// the swap may fail if the bridge pulls additional tokens.
				// The executor's capBalanceToWalletMax should prevent this,
				// but warn here as a defense-in-depth signal.
				const margin = tokenBalance - feeBuffer;
				if (margin < feeBuffer) {
					console.warn(
						`[sendArbitrumTransaction] Thin margin for ${symbol}: balance=${tokenBalance}, feeBuffer=${feeBuffer}, remaining=${margin}. ` +
						`If this token is also used for the swap, the bridge may fail.`
					);
				}

				const txHash = await Promise.race([
					sendGaslessCalls(
						actualCalls,
						feeToken,
						feeBuffer,
						estimate.estimatedGas
					),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('Gasless relay timeout (30s)')), 30_000)
					)
				]);

				console.log(`[sendArbitrumTransaction] Gasless relay succeeded with ${symbol} fee`);
				void Promise.allSettled([loadAssets(), loadTransactions()]);
				return txHash;
			} catch (err) {
				lastErr = err instanceof Error ? err : new Error(String(err));
				console.warn(`[sendArbitrumTransaction] Gasless relay with ${symbol} failed:`, lastErr.message);
				continue;
			}
		}
	}

	// No fee tokens available or all fee token attempts failed.
	// sendGaslessCalls requires a fee token — there is no "free" gasless path.
	// Throw the last error from the fee token loop, or a clear message.
	console.error('[sendArbitrumTransaction] All fee token attempts exhausted');
	throw lastErr
		?? new Error(
			'No fee token available for gasless transaction. ' +
			'Ensure you hold at least one of: USDT0, WBTC, or tBTC on Arbitrum to cover the relay fee.'
		);
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
 * Direct Arbitrum transaction path — signs with the built-in RSK wallet
 * using native ETH for gas. Only used when the gasless wallet is not
 * initialized (e.g. on a fresh device before the smart account is set up).
 */
async function sendDirectArbitrumTx(params: {
	to: string;
	data: string;
	value: string;
	gasLimit?: number;
}): Promise<string> {
	console.warn('[sendArbitrumTransaction] Using direct tx path (gasless wallet not initialized)');
	const manager = getWalletManager();
	const wallet = manager.rskWallet.getWallet() as import('ethers').Wallet;
	const ARB_RPC = import.meta.env.VITE_ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc';
	const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
	const arbWallet = wallet.connect(arbProvider);

	const arbEthBalance = await arbProvider.getBalance(arbWallet.address);
	if (arbEthBalance === 0n) {
		throw new Error(
			'No ETH on Arbitrum for gas. The gasless relay is not initialized. ' +
			'Please fund your Arbitrum wallet with ETH to execute this transaction, ' +
			'or ensure the gasless relay is configured.'
		);
	}

	const txHash = await Promise.race([
		(async () => {
			const tx = await arbWallet.sendTransaction({
				to: params.to,
				data: params.data,
				value: params.value,
				...(params.gasLimit !== undefined && { gasLimit: params.gasLimit })
			});
			return tx.hash;
		})(),
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Arbitrum transaction timeout (60s) — RPC may be unreachable')), 60_000)
		)
	]);
	console.warn('[sendArbitrumTransaction] Direct tx submitted: %s', txHash);
	await Promise.allSettled([loadAssets(), loadTransactions()]);
	return txHash;
}

/**
 * Send ERC-20 token transaction.
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
