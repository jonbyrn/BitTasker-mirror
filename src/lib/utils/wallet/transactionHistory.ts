import type { Transaction } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { getUSDTToken } from './networkConfig';
import { ethers } from 'ethers';

/**
 * Load RSK transaction history using RSK Explorer API
 * Identify and include swap transactions (EtherSwap contract interactions)
 */
export async function loadRSKTransactions(): Promise<Transaction[]> {
    try {
        const state = get(walletStore);
        if (!state.rsk.connected || !state.rsk.provider || !state.rsk.wallet) {
            return [];
        }

        const transactions: Transaction[] = [];
        const address = state.rsk.wallet.address.toLowerCase();
        const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

        // Get EtherSwap contract address for swap detection
        let etherSwapAddress: string | null = null;
        try {
            const apiUrl = network === 'mainnet'
                ? 'https://api.boltz.exchange'
                : 'http://localhost:9001';

            const contractResponse = await fetch(`${apiUrl}/v2/chain/RBTC/contracts`);
            if (contractResponse.ok) {
                const contracts = await contractResponse.json();
                etherSwapAddress = contracts.swapContracts?.EtherSwap?.toLowerCase() || null;
            }
        } catch (error) {
            console.warn('Could not fetch EtherSwap contract address:', error);
        }

        // Use RSK Explorer API to get transaction history
        const explorerApiUrl =
            network === 'mainnet'
                ? 'https://rootstock.blockscout.com/api'
                : 'https://rootstock-testnet.blockscout.com/api';

        try {
            // Fetch transactions from RSK Explorer API
            const response = await fetch(`${explorerApiUrl}/v2/addresses/${address}/transactions`);

            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status}`);
            }

            const data = await response.json();

            if (data.items && Array.isArray(data.items)) {
                for (const tx of data.items.slice(0, 50)) {
                    // Limit to 50 most recent
                    const txTo = (tx.to?.hash || tx.to || '').toLowerCase();
                    const txFrom = (tx.from?.hash || tx.from || '').toLowerCase();
                    const txMethod = tx.method?.toLowerCase() || '';

                    // Check if this is a swap transaction
                    const isSwapClaim =
                        etherSwapAddress &&
                        txTo === etherSwapAddress &&
                        txFrom === address &&
                        (txMethod === 'claim' || txMethod.includes('claim'));

                    if (isSwapClaim) {
                        // This is a swap claim transaction (user received RBTC)
                        const amount = parseFloat(ethers.formatEther(tx.value || '0'));
                        // TODO:: Currently we default to 'reverse' type. In the future, we could
                        // enhance this by analyzing swap details from the transaction data
                        const swapType: 'chain' | 'reverse' = 'reverse';

                        // Calculate fee
                        let fee: number | undefined;
                        if (tx.gas_used && tx.gas_used !== '0' && tx.gas_price && tx.gas_price !== '0') {
                            try {
                                const feeWei = BigInt(tx.gas_used) * BigInt(tx.gas_price);
                                fee = parseFloat(ethers.formatEther(feeWei));
                            } catch (error) {
                                console.debug('Failed to calculate swap fee:', error);
                            }
                        }

                        const transaction: Transaction = {
                            hash: tx.hash,
                            from: txFrom,
                            to: txTo,
                            value: tx.value || '0',
                            gasUsed: tx.gas_used?.toString() || '0',
                            gasPrice: tx.gas_price?.toString() || '0',
                            blockNumber: parseInt(tx.block_number) || 0,
                            timestamp: new Date(tx.timestamp).getTime(),
                            status: tx.status === 'ok' ? 'confirmed' : 'failed',
                            type: 'swap',
                            network: 'rsk',
                            tokenSymbol: 'rBTC',
                            swapType,
                            id: tx.hash,
                            asset: 'rBTC',
                            formattedAmount: `${amount.toFixed(6)} rBTC`,
                            // TODO: show generic swap description. Could be enhanced to show
                            // specific swap type (Lightning/L-BTC) based on transaction analysis
                            description: 'Swap claimed',
                            fee,
                            address: txTo,
                            txHash: tx.hash
                        };

                        transactions.push(transaction);
                    } else {
                        // Regular RSK transaction
                        const amount = parseFloat(ethers.formatEther(tx.value || '0'));
                        const txType = tx.from.hash.toLowerCase() === address ? 'send' : 'receive';

                        // Calculate fee
                        let fee: number | undefined;
                        if (tx.gas_used && tx.gas_used !== '0' && tx.gas_price && tx.gas_price !== '0') {
                            try {
                                const feeWei = BigInt(tx.gas_used) * BigInt(tx.gas_price);
                                fee = parseFloat(ethers.formatEther(feeWei));
                            } catch (error) {
                                console.debug('Failed to calculate transaction fee:', error);
                            }
                        }

                        const transaction: Transaction = {
                            hash: tx.hash,
                            from: tx.from.hash,
                            to: tx.to?.hash || '0x0000000000000000000000000000000000000000',
                            value: tx.value || '0',
                            gasUsed: tx.gas_used?.toString() || '0',
                            gasPrice: tx.gas_price?.toString() || '0',
                            blockNumber: parseInt(tx.block_number) || 0,
                            timestamp: new Date(tx.timestamp).getTime(),
                            status: tx.status === 'ok' ? 'confirmed' : 'failed',
                            type: txType,
                            network: 'rsk',
                            id: tx.hash,
                            asset: 'rBTC',
                            formattedAmount: `${amount.toFixed(6)} rBTC`,
                            description: txType === 'send' ? 'RSK transaction sent' : 'RSK payment received',
                            fee,
                            address: tx.to?.hash || '0x0000000000000000000000000000000000000000',
                            txHash: tx.hash
                        };

                        transactions.push(transaction);
                    }
                }
            }
        } catch (apiError) {
            console.error('Failed to fetch from RSK explorer API:', apiError);

            // Try alternative API endpoint format
            try {
                const altResponse = await fetch(
                    `${explorerApiUrl}/v2/addresses/${address}/transactions?type=all`
                );

                if (altResponse.ok) {
                    const altData = await altResponse.json();

                    if (altData.items && Array.isArray(altData.items)) {
                        for (const tx of altData.items.slice(0, 50)) {
                            const txTo = (tx.to?.hash || tx.to || '').toLowerCase();
                            const txFrom = (tx.from?.hash || tx.from || '').toLowerCase();
                            const txMethod = tx.method?.toLowerCase() || '';

                            // Check if this is a swap transaction
                            const isSwapClaim =
                                etherSwapAddress &&
                                txTo === etherSwapAddress &&
                                txFrom === address &&
                                (txMethod === 'claim' || txMethod.includes('claim'));

                            if (isSwapClaim) {
                                // Swap transaction
                                const amount = parseFloat(ethers.formatEther(tx.value || '0'));
                                const swapType: 'chain' | 'reverse' = 'reverse';

                                let fee: number | undefined;
                                if (tx.gas_used && tx.gas_used !== '0' && tx.gas_price && tx.gas_price !== '0') {
                                    try {
                                        const feeWei = BigInt(tx.gas_used) * BigInt(tx.gas_price);
                                        fee = parseFloat(ethers.formatEther(feeWei));
                                    } catch (error) {
                                        console.debug('Failed to calculate swap fee:', error);
                                    }
                                }

                                const transaction: Transaction = {
                                    hash: tx.hash,
                                    from: txFrom,
                                    to: txTo,
                                    value: tx.value || '0',
                                    gasUsed: tx.gas_used?.toString() || '0',
                                    gasPrice: tx.gas_price?.toString() || '0',
                                    blockNumber: parseInt(tx.block_number) || 0,
                                    timestamp: new Date(tx.timestamp).getTime(),
                                    status: tx.status === 'ok' ? 'confirmed' : 'failed',
                                    type: 'swap',
                                    network: 'rsk',
                                    tokenSymbol: 'rBTC',
                                    swapType,
                                    id: tx.hash,
                                    asset: 'rBTC',
                                    formattedAmount: `${amount.toFixed(6)} rBTC`,
                                    description: 'Swap claimed',
                                    fee,
                                    address: txTo,
                                    txHash: tx.hash
                                };

                                transactions.push(transaction);
                            } else {
                                // Regular transaction
                                const amount = parseFloat(ethers.formatEther(tx.value || '0'));
                                const txType = (tx.from?.hash || tx.from)?.toLowerCase() === address ? 'send' : 'receive';

                                let fee: number | undefined;
                                if (tx.gas_used && tx.gas_used !== '0' && tx.gas_price && tx.gas_price !== '0') {
                                    try {
                                        const feeWei = BigInt(tx.gas_used) * BigInt(tx.gas_price);
                                        fee = parseFloat(ethers.formatEther(feeWei));
                                    } catch (error) {
                                        console.debug('Failed to calculate transaction fee:', error);
                                    }
                                }

                                const transaction: Transaction = {
                                    hash: tx.hash,
                                    from: tx.from?.hash || tx.from,
                                    to: tx.to?.hash || tx.to || '0x0000000000000000000000000000000000000000',
                                    value: tx.value || '0',
                                    gasUsed: tx.gas_used?.toString() || '0',
                                    gasPrice: tx.gas_price?.toString() || '0',
                                    blockNumber: parseInt(tx.block_number) || 0,
                                    timestamp: new Date(tx.timestamp).getTime(),
                                    status: tx.status === 'ok' ? 'confirmed' : 'failed',
                                    type: txType,
                                    network: 'rsk',
                                    id: tx.hash,
                                    asset: 'rBTC',
                                    formattedAmount: `${amount.toFixed(6)} rBTC`,
                                    description: txType === 'send' ? 'RSK transaction sent' : 'RSK payment received',
                                    fee,
                                    address: tx.to?.hash || tx.to || '0x0000000000000000000000000000000000000000',
                                    txHash: tx.hash
                                };

                                transactions.push(transaction);
                            }
                        }
                    }
                }
            } catch (altError) {
                console.error('Alternative RSK API also failed:', altError);

                // Try v1 API as final fallback
                try {
                    const v1Response = await fetch(
                        `${explorerApiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`
                    );

                    if (v1Response.ok) {
                        const v1Data = await v1Response.json();

                        if (v1Data.result && Array.isArray(v1Data.result)) {
                            for (const tx of v1Data.result.slice(0, 50)) {
                                const amount = parseFloat(ethers.formatEther(tx.value || '0'));
                                const txType = tx.from.toLowerCase() === address ? 'send' : 'receive';

                                let fee: number | undefined;
                                if (tx.gasUsed && tx.gasUsed !== '0' && tx.gasPrice && tx.gasPrice !== '0') {
                                    try {
                                        const feeWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
                                        fee = parseFloat(ethers.formatEther(feeWei));
                                    } catch (error) {
                                        console.debug('Failed to calculate transaction fee:', error);
                                    }
                                }

                                const transaction: Transaction = {
                                    hash: tx.hash,
                                    from: tx.from,
                                    to: tx.to || '0x0000000000000000000000000000000000000000',
                                    value: tx.value || '0',
                                    gasUsed: tx.gasUsed?.toString() || '0',
                                    gasPrice: tx.gasPrice?.toString() || '0',
                                    blockNumber: parseInt(tx.blockNumber) || 0,
                                    timestamp: parseInt(tx.timeStamp) * 1000, // Convert to milliseconds
                                    status: tx.isError === '0' ? 'confirmed' : 'failed',
                                    type: txType,
                                    network: 'rsk',
                                    id: tx.hash,
                                    asset: 'rBTC',
                                    formattedAmount: `${amount.toFixed(6)} rBTC`,
                                    description: txType === 'send' ? 'RSK transaction sent' : 'RSK payment received',
                                    fee,
                                    address: tx.to || '0x0000000000000000000000000000000000000000',
                                    txHash: tx.hash
                                };

                                transactions.push(transaction);
                            }
                        }
                    }
                } catch (v1Error) {
                    console.error('V1 RSK API also failed:', v1Error);

                    // Final fallback: Check transaction count
                    const txCount = await state.rsk.provider.getTransactionCount(state.rsk.wallet.address);

                    if (txCount > 0) {
                        console.warn(`RSK address has ${txCount} transactions, but all APIs are unavailable`);
                    }
                }
            }
        }

        return transactions;
    } catch (error) {
        console.error('Failed to load RSK transactions:', error);
        return [];
    }
}

/**
 * Load BSC transaction history using BSCScan API
 */
export async function loadBSCTransactions(): Promise<Transaction[]> {
    const state = get(walletStore);
    if (!state.bsc.connected || !state.bsc.provider || !state.bsc.wallet) {
        return [];
    }

    try {
        const transactions: Transaction[] = [];
        const address = state.bsc.wallet.address.toLowerCase();
        const network = import.meta.env.VITE_BSC_NETWORK || 'testnet';

        // Get BSCScan API key from environment
        const apiKey = import.meta.env.VITE_BSCSCAN_API_KEY;

        // Use BSCScan API to get transaction history
        const explorerApiUrl = 'https://api.etherscan.io/v2/api'

        try {
            // Fetch BNB transactions using V2 API
            const bnbUrl = `${explorerApiUrl}?chainid=${network === 'mainnet' ? 56 : 97}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;

            const bnbResponse = await fetch(bnbUrl);

            if (bnbResponse.ok) {
                const bnbData = await bnbResponse.json();

                // Check for API success status (V2 API returns status field)
                if (bnbData.status === '1' && bnbData.result && Array.isArray(bnbData.result)) {
                    for (const tx of bnbData.result.slice(0, 50)) {
                        // Determine transaction type based on user's address
                        const isFromUser = tx.from.toLowerCase() === address;
                        const isToUser = tx.to && tx.to.toLowerCase() === address;

                        let transactionType: 'send' | 'receive' | 'contract';
                        if (isFromUser && isToUser) {
                            // Self-transaction (sending to self)
                            transactionType = 'send';
                        } else if (isFromUser) {
                            // User sent the transaction
                            transactionType = 'send';
                        } else if (isToUser) {
                            // User received the transaction
                            transactionType = 'receive';
                        } else {
                            // Contract interaction or other
                            transactionType = 'contract';
                        }

                        const amount = parseFloat(ethers.formatEther(tx.value || '0'));

                        let fee: number | undefined;
                        if (tx.gasUsed && tx.gasUsed !== '0' && tx.gasPrice && tx.gasPrice !== '0') {
                            try {
                                const feeWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
                                fee = parseFloat(ethers.formatEther(feeWei));
                            } catch (error) {
                                console.debug('Failed to calculate BSC transaction fee:', error);
                            }
                        }

                        const transaction: Transaction = {
                            hash: tx.hash,
                            from: tx.from,
                            to: tx.to || '0x0000000000000000000000000000000000000000',
                            value: tx.value || '0',
                            gasUsed: tx.gasUsed?.toString() || '0',
                            gasPrice: tx.gasPrice?.toString() || '0',
                            blockNumber: parseInt(tx.blockNumber) || 0,
                            timestamp: parseInt(tx.timeStamp) * 1000,
                            status: tx.isError === '0' ? 'confirmed' : 'failed',
                            type: transactionType,
                            network: 'bsc',
                            // UI display fields
                            id: tx.hash,
                            asset: 'BNB',
                            formattedAmount: `${amount.toFixed(6)} BNB`,
                            description: transactionType === 'send' ? 'BSC BNB sent' : 'BSC BNB received',
                            fee,
                            address: tx.to || '0x0000000000000000000000000000000000000000',
                            txHash: tx.hash
                        };

                        transactions.push(transaction);
                    }
                } else if (bnbData.status === '0') {
                    console.warn('BSCScan API returned error for BNB transactions:', bnbData.message || bnbData.result);
                }
            } else {
                console.error('Failed to fetch BNB transactions:', bnbResponse.status, bnbResponse.statusText);
            }

            // Fetch USDT token transactions
            const usdtToken = getUSDTToken(network);

            if (usdtToken) {
                const usdtResponse = await fetch(
                    `${explorerApiUrl}?chainid=${network === 'mainnet' ? 56 : 97}&module=account&action=tokentx&contractaddress=${usdtToken.address}&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`
                );

                if (usdtResponse.ok) {
                    const usdtData = await usdtResponse.json();

                    // Check for API success status (V2 API returns status field)
                    if (usdtData.status === '1' && usdtData.result && Array.isArray(usdtData.result)) {
                        for (const tx of usdtData.result.slice(0, 50)) {
                            // Determine transaction type based on user's address
                            const isFromUser = tx.from.toLowerCase() === address;
                            const isToUser = tx.to && tx.to.toLowerCase() === address;

                            let transactionType: 'send' | 'receive' | 'contract';
                            if (isFromUser && isToUser) {
                                // Self-transaction (sending to self)
                                transactionType = 'send';
                            } else if (isFromUser) {
                                // User sent the transaction
                                transactionType = 'send';
                            } else if (isToUser) {
                                // User received the transaction
                                transactionType = 'receive';
                            } else {
                                // Contract interaction or other
                                transactionType = 'contract';
                            }

                            const tokenSymbol = tx.tokenSymbol || 'USDT';
                            const amount = parseFloat(ethers.formatUnits(tx.value || '0', 18));

                            let fee: number | undefined;
                            if (tx.gasUsed && tx.gasUsed !== '0' && tx.gasPrice && tx.gasPrice !== '0') {
                                try {
                                    const feeWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
                                    fee = parseFloat(ethers.formatEther(feeWei));
                                } catch (error) {
                                    console.debug('Failed to calculate BSC USDT transaction fee:', error);
                                }
                            }

                            const transaction: Transaction = {
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to || '0x0000000000000000000000000000000000000000',
                                value: tx.value || '0',
                                gasUsed: tx.gasUsed?.toString() || '0',
                                gasPrice: tx.gasPrice?.toString() || '0',
                                blockNumber: parseInt(tx.blockNumber) || 0,
                                timestamp: parseInt(tx.timeStamp) * 1000,
                                status: tx.isError === '0' ? 'confirmed' : 'failed',
                                type: transactionType,
                                network: 'bsc',
                                tokenSymbol,
                                // UI display fields
                                id: tx.hash,
                                asset: tokenSymbol,
                                formattedAmount: `${amount.toFixed(6)} ${tokenSymbol}`,
                                description: transactionType === 'send' ? `BSC ${tokenSymbol} sent` : `BSC ${tokenSymbol} received`,
                                fee,
                                address: tx.to || '0x0000000000000000000000000000000000000000',
                                txHash: tx.hash
                            };

                            transactions.push(transaction);
                        }
                    }
                }
            }

        } catch (apiError) {
            console.error('Failed to fetch from BSCScan API:', apiError);
            return [];
        }

        // Sort transactions by timestamp and remove duplicates
        const uniqueTransactions = transactions
            .filter((tx, index, self) =>
                index === self.findIndex(t => t.hash === tx.hash)
            )
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100); // Limit to 100 most recent

        return uniqueTransactions;

    } catch (error) {
        console.error('Failed to load BSC transaction history:', error);
        return [];
    }
}


/**
 * Update transaction status in the wallet store
 */
export function updateTransactionStatus(network: 'rsk' | 'bsc', hash: string, receipt: any): void {
    if (!receipt) return;

    walletStore.update((state) => {
        // Update transaction in combined transactions array
        const updatedTransactions = state.transactions.map((tx) => {
            // Check if this is a Transaction object (not Payment) and matches the hash
            if ('hash' in tx && tx.hash === hash) {
                return {
                    ...tx,
                    gasUsed: receipt.gasUsed.toString(),
                    gasPrice: receipt.gasPrice?.toString() || '0',
                    blockNumber: receipt.blockNumber,
                    timestamp: Date.now(),
                    status: receipt.status === 1 ? 'confirmed' : 'failed'
                } as Transaction;
            }
            return tx;
        });

        return {
            ...state,
            transactions: updatedTransactions
        };
    });
}
