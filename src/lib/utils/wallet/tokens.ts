import type { ERC20Token, Transaction, TokenBalance, NetworkType } from '$lib/types/wallet';
import { ethers } from 'ethers';
import { ERC20_ABI, RSK_NETWORKS, BSC_NETWORKS } from '$lib/utils/wallet/networkConfig';
import { getProvider, getWallet, walletStore } from '$lib/stores/wallet.store';

// Load token balances for RSK or BSC
async function loadTokenBalances(walletType: 'rsk' | 'bsc'): Promise<void> {
    const wallet = getWallet(walletType);
    const provider = getProvider(walletType);

    if (!wallet || !provider) return;

    try {
        const network: NetworkType = import.meta.env.VITE_RSK_NETWORK || 'testnet';
        const networkConfig = walletType === 'rsk' ? RSK_NETWORKS[network] : BSC_NETWORKS[network];
        const tokenBalances: TokenBalance[] = [];

        // Check if tokens are defined for this network
        if (networkConfig && 'tokens' in networkConfig && networkConfig.tokens) {
            const tokens = networkConfig.tokens as ERC20Token[];

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
                    console.error(`Failed to load balance for ${walletType} token ${token.symbol}:`, error);
                    // Add zero balance for failed tokens
                    tokenBalances.push({
                        token,
                        balance: BigInt(0),
                        formattedBalance: '0.0'
                    });
                }
            }
        }

        walletStore.update(state => ({
            ...state,
            [walletType]: {
                ...state[walletType],
                tokenBalances
            }
        }));

    } catch (error) {
        console.error(`Failed to load ${walletType} token balances:`, error);
    }
}

// TODO: Unused function - Move function from wallet.store.ts to tokens.ts
// Send ERC-20 token
async function sendToken(tokenAddress: string, to: string, amount: string, walletType: 'rsk' | 'bsc'): Promise<string> {
    const wallet = getWallet(walletType);

    if (!wallet) {
        throw new Error(`${walletType} wallet not initialized`);
    }

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

        // Get token decimals and symbol
        const decimals = await tokenContract.decimals();
        const tokenSymbol = await tokenContract.symbol();

        // Parse amount with correct decimals
        const parsedAmount = ethers.parseUnits(amount, decimals);

        const tx = await tokenContract.transfer(to, parsedAmount);

        // Add to pending transactions
        const pendingTx: Transaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: parsedAmount.toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send',
            network: walletType,
            tokenSymbol
        };

        walletStore.update(state => ({
            ...state,
            transactions: [pendingTx, ...state.transactions]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();

        // Update transaction status - this would need to be implemented in wallet store
        // updateTransactionStatus(walletType, tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`${walletType} token transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// TODO: Unused function - Move function from wallet.store.ts to tokens.ts
// Estimate gas for token transfer
async function estimateTokenGas(tokenAddress: string, to: string, amount: string, walletType: 'rsk' | 'bsc'): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    const wallet = getWallet(walletType);
    const provider = getProvider(walletType);

    if (!wallet || !provider) {
        throw new Error(`${walletType} wallet not initialized`);
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

export const tokens = {
    loadTokenBalances
}