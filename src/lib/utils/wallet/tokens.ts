import type { RSKToken, RSKTransaction, TokenBalance } from '$lib/types/wallet';
import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { ERC20_ABI, RSK_NETWORKS, type RSKNetwork } from '$lib/utils/wallet/escrowContract';
import { getRSKProvider, getRSKWallet, rskWallet, rskWalletStore } from '$lib/stores/rskWallet.store';

// Load token balances
async function loadTokenBalances(): Promise<void> {
    const wallet = getRSKWallet();
    const provider = getRSKProvider();

    if (!wallet || !provider) return;

    try {
        const network = get(rskWalletStore).network;
        const networkConfig = RSK_NETWORKS[network as RSKNetwork];
        const tokenBalances: TokenBalance[] = [];

        // Check if tokens are defined for this network
        if ('tokens' in networkConfig && networkConfig.tokens) {
            const tokens = networkConfig.tokens as RSKToken[];

            for (const token of tokens) {
                try {
                    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
                    const balance = await tokenContract.balanceOf(wallet.address);
                    const formattedBalance = ethers.formatUnits(balance, token.decimals);

                    tokenBalances.push({
                        token,
                        balance,
                        formattedBalance
                    });
                } catch (error) {
                    console.error(`Failed to load balance for token ${token.symbol}:`, error);
                    // Add zero balance for failed tokens
                    tokenBalances.push({
                        token,
                        balance: BigInt(0),
                        formattedBalance: '0.0'
                    });
                }
            }
        }

        rskWalletStore.update(state => ({
            ...state,
            tokenBalances
        }));

    } catch (error) {
        console.error('Failed to load token balances:', error);
    }
}

// Send ERC-20 token
async function sendToken(tokenAddress: string, to: string, amount: string): Promise<string> {
    const wallet = getRSKWallet();

    if (!wallet) {
        throw new Error('Wallet not initialized');
    }

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

        // Get token decimals
        const decimals = await tokenContract.decimals();

        // Parse amount with correct decimals
        const parsedAmount = ethers.parseUnits(amount, decimals);

        const tx = await tokenContract.transfer(to, parsedAmount);

        // Add to pending transactions
        const pendingTx: RSKTransaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: parsedAmount.toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send'
        };

        rskWalletStore.update(state => ({
            ...state,
            pendingTransactions: [pendingTx, ...state.pendingTransactions]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();

        // Update transaction status
        rskWallet.updateTransactionStatus(tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`Token transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for token transfer
async function estimateTokenGas(tokenAddress: string, to: string, amount: string): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    const wallet = getRSKWallet();
    const provider = getRSKProvider();

    if (!wallet || !provider) {
        throw new Error('Wallet not initialized');
    }

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const decimals = await tokenContract.decimals();
        const parsedAmount = ethers.parseUnits(amount, decimals);

        const gasPrice = await provider.getFeeData();
        const gasLimit = await tokenContract.transfer.estimateGas(to, parsedAmount);

        const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.gasPrice?.toString() || '0',
            totalCost: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export const rskTokens = {
    loadTokenBalances,
    sendToken,
    estimateTokenGas
}