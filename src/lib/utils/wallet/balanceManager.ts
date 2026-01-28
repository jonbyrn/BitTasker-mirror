import { ethers } from 'ethers';
import { walletStore, getWallet, getProvider } from '$lib/stores/wallet.store';
import { getUSDTToken, ERC20_ABI } from '@bittasker/wallet-core';

/**
 * Update BSC wallet balances (BNB and USDT)
 */
export async function updateBSCBalances(): Promise<void> {
    const wallet = getWallet('bsc');
    const provider = getProvider('bsc');

    if (!wallet || !provider) return;

    try {
        // Update BNB balance
        const bnbBalance = await provider.getBalance(wallet.address);
        const formattedBnb = ethers.formatEther(bnbBalance);

        // Get USDT contract and balance
        const usdtToken = getUSDTToken();

        if (!usdtToken) {
            throw new Error('USDT token not found');
        }

        const usdtContract = new ethers.Contract(usdtToken.address, ERC20_ABI, provider);

        // Update USDT balance
        const usdtBalance = await usdtContract.balanceOf(wallet.address);
        const decimals = await usdtContract.decimals();
        const formattedUsdt = ethers.formatUnits(usdtBalance, decimals);

        walletStore.update((state) => ({
            ...state,
            bsc: {
                ...state.bsc,
                bnbBalance: bnbBalance.toString(),
                formattedBnbBalance: parseFloat(formattedBnb).toFixed(6),
                usdtBalance: usdtBalance.toString(),
                formattedUsdtBalance: parseFloat(formattedUsdt).toFixed(6),
            }
        }));

    } catch (error) {
        console.error('Failed to update BSC balances:', error);
        // Don't retry automatically to avoid infinite loops
        walletStore.update((state) => ({
            ...state,
            bsc: {
                ...state.bsc,
                error: 'Failed to update balances. Please check your network connection.'
            }
        }));
    }
}

