/**
 * @deprecated This file utilities is deprecated in favor of wallet package.
 */

import type { Transaction } from '$lib/types/wallet';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { getUSDTToken, getBoltzConfig, getRSKConfig, getBSCConfig } from '$lib/utils/wallet/networkConfig';
import { ethers } from 'ethers';
import { detectContractInteraction, batchCheckContractAddresses } from './contractDetection';
import { parseFunction } from './functionParsing';
import { classifyTransactionType } from './transactionClassification';
import { getTransactionTitle } from './titleGeneration';
import { getTaskInfoForTransaction, generateTaskLink } from './taskLinking';
import { setEtherSwapContractAddress, getEtherSwapContractAddress } from './contractRegistry';

type Network = 'rsk' | 'bsc';
type Environment = 'mainnet' | 'testnet';

/**
 * Process a single transaction with contract detection and function parsing
 */
export async function processTransactionWithContractDetection(
	tx: {
		hash: string;
		from: { hash?: string } | string;
		to?: { hash?: string } | string | null;
		value: string;
		input?: string;
		data?: string;
		gas_used?: string;
		gas_price?: string;
		gasUsed?: string;
		gasPrice?: string;
		block_number?: string;
		blockNumber?: string;
		timestamp: string | number;
		status?: string;
		method?: string;
	},
	userAddress: string,
	provider: ethers.Provider | null,
	network: Network,
	environment: Environment,
	etherSwapAddress: string | null
): Promise<Transaction | null> {
	try {
		const txFrom = typeof tx.from === 'string' ? tx.from : (tx.from?.hash || '');
		const txTo = typeof tx.to === 'string' ? tx.to : (tx.to?.hash || null);
		const txInput = tx.input || tx.data || '';
		const txValue = tx.value || '0';
		const txMethod = tx.method?.toLowerCase() || '';

		// Check if this is a swap transaction (preserve existing logic)
		const isSwapClaim =
			etherSwapAddress &&
			txTo?.toLowerCase() === etherSwapAddress &&
			txFrom.toLowerCase() === userAddress &&
			(txMethod === 'claim' || txMethod.includes('claim'));

		// Detect contract interaction
		const contractDetection = await detectContractInteraction(
			{
				to: txTo,
				from: txFrom,
				input: txInput
			},
			provider,
			network,
			environment,
			userAddress
		);

		// Parse function if it's a contract interaction
		let parsedFunction = null;
		let contractFunction: string | undefined;
		let contractMetadata: Transaction['contractMetadata'] = {
			network,
			environment
		};

		if (contractDetection.isContract) {
			// Map contractType for parseFunction (etherSwap -> unknown for parsing)
			const parseContractType = contractDetection.contractType === 'etherSwap' 
				? 'unknown' 
				: (contractDetection.contractType || 'unknown');
			
			parsedFunction = parseFunction(txInput, parseContractType);
			
			if (parsedFunction) {
				contractFunction = parsedFunction.functionName || undefined;
				contractMetadata.functionName = parsedFunction.functionName || undefined;
				contractMetadata.functionSelector = parsedFunction.functionSelector;
				contractMetadata.escrowId = parsedFunction.escrowId;
				contractMetadata.contractType = contractDetection.contractType === 'etherSwap' 
					? 'swap' 
					: (contractDetection.contractType || 'unknown');
			}
		}

		// Log transaction details before classification
		const txValueBigInt = BigInt(txValue || '0');
		const hasValue = txValueBigInt > BigInt(0);
		const isFromUser = txFrom.toLowerCase() === userAddress.toLowerCase();
		const isToUser = txTo?.toLowerCase() === userAddress.toLowerCase();
		
		console.log(`[TransactionProcessing] Processing transaction ${tx.hash.substring(0, 10)}...:`, {
			from: txFrom.substring(0, 10) + '...',
			to: txTo?.substring(0, 10) + '...' || 'null',
			userAddress: userAddress.substring(0, 10) + '...',
			value: txValue,
			hasValue,
			isFromUser,
			isToUser,
			isContract: contractDetection.isContract,
			contractType: contractDetection.contractType,
			contractAddress: contractDetection.isContract ? txTo : null,
			hasInput: !!txInput && txInput.length > 0,
			inputLength: txInput?.length || 0,
			parsedFunction: parsedFunction?.functionName || null,
			escrowId: contractMetadata.escrowId || null
		});

		// Classify transaction type
		const transactionType = classifyTransactionType({
			from: txFrom,
			to: txTo || null,
			value: txValue,
			isContractInteraction: contractDetection.isContract || false,
			contractType: contractDetection.contractType === 'etherSwap' ? null : contractDetection.contractType,
			userAddress,
			isSwap: isSwapClaim || false
		});
		
		console.log(`[TransactionProcessing] Transaction ${tx.hash.substring(0, 10)}... classified as: ${transactionType}`);

		// Calculate fee
		const gasUsed = tx.gas_used || tx.gasUsed || '0';
		const gasPrice = tx.gas_price || tx.gasPrice || '0';
		let fee: number | undefined;
		if (gasUsed && gasUsed !== '0' && gasPrice && gasPrice !== '0') {
			try {
				const feeWei = BigInt(gasUsed) * BigInt(gasPrice);
				fee = parseFloat(ethers.formatEther(feeWei));
			} catch (error) {
				console.debug('Failed to calculate transaction fee:', error);
			}
		}

		// Convert amount
		const amount = parseFloat(ethers.formatEther(txValue));
		const sats = Math.floor(amount * 100_000_000);
		const formattedSats = sats.toLocaleString();

		// Get task info if escrowId is present
		const taskInfo = contractMetadata.escrowId
			? getTaskInfoForTransaction({ contractMetadata })
			: null;

		if (taskInfo) {
			contractMetadata.taskId = taskInfo.id;
			contractMetadata.taskTitle = taskInfo.title;
		}

		// Generate title
		const title = getTransactionTitle({
			type: transactionType,
			contractFunction,
			contractMetadata
		} as Transaction);

		// Build transaction object
		const transaction: Transaction = {
			hash: tx.hash,
			from: txFrom,
			to: txTo || '0x0000000000000000000000000000000000000000',
			value: txValue,
			gasUsed: gasUsed.toString(),
			gasPrice: gasPrice.toString(),
			blockNumber: parseInt(tx.block_number || tx.blockNumber || '0'),
			timestamp: typeof tx.timestamp === 'string' ? new Date(tx.timestamp).getTime() : tx.timestamp,
			status: tx.status === 'ok' || tx.status === '1' ? 'confirmed' : 'failed',
			type: transactionType,
			network,
			id: tx.hash,
			asset: network === 'rsk' ? 'rBTC' : 'BNB',
			formattedAmount: `${formattedSats} Sats`,
			description: title,
			fee,
			address: txTo || '0x0000000000000000000000000000000000000000',
			txHash: tx.hash,
			contractAddress: contractDetection.isContract ? (txTo || undefined) : undefined,
			contractFunction,
			contractMetadata: Object.keys(contractMetadata).length > 2 ? contractMetadata : undefined
		};

		// Add swap-specific fields if it's a swap
		if (isSwapClaim) {
			transaction.swapType = 'reverse';
			transaction.tokenSymbol = 'rBTC';
		}

		return transaction;
	} catch (error) {
		console.error('[TransactionProcessing] Failed to process transaction:', error);
		return null;
	}
}

/**
 * Load RSK transaction history using RSK Explorer API
 * Identify and include swap transactions (EtherSwap contract interactions)
 */
export async function loadRSKTransactions(): Promise<Transaction[]> {
    const startTime = performance.now();
    console.log('[RSK Transactions] Starting RSK transaction load...');
    
    try {
        const state = get(walletStore);
        if (!state.rsk.connected || !state.rsk.provider || !state.rsk.wallet) {
            console.log('[RSK Transactions] RSK wallet not connected, skipping');
            return [];
        }

        const transactions: Transaction[] = [];
        const address = state.rsk.wallet.address.toLowerCase();
        const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

        // Get network configurations
        const configStartTime = performance.now();
        const boltzConfig = getBoltzConfig(network);
        const rskConfig = getRSKConfig(network);
        const configDuration = performance.now() - configStartTime;
        console.log(`[RSK Transactions] Config loaded in ${configDuration.toFixed(2)}ms`);

        // Get EtherSwap contract address for swap detection
        let etherSwapAddress: string | null = null;
        const etherSwapStartTime = performance.now();
        try {
            console.log('[RSK Transactions] Fetching EtherSwap contract address...');
            const contractResponse = await fetch(`${boltzConfig.boltzApiUrl}/v2/chain/RBTC/contracts`);
            const etherSwapFetchTime = performance.now() - etherSwapStartTime;
            console.log(`[RSK Transactions] EtherSwap contract fetch completed in ${etherSwapFetchTime.toFixed(2)}ms`);
            
            if (contractResponse.ok) {
                const contracts = await contractResponse.json();
                etherSwapAddress = contracts.swapContracts?.EtherSwap?.toLowerCase() || null;
                console.log(`[RSK Transactions] EtherSwap address: ${etherSwapAddress || 'not found'}`);
            }
        } catch (error) {
            const etherSwapErrorTime = performance.now() - etherSwapStartTime;
            console.warn(`[RSK Transactions] Could not fetch EtherSwap contract address after ${etherSwapErrorTime.toFixed(2)}ms:`, error);
        }

        // Use RSK Explorer API to get transaction history
        const explorerApiUrl = rskConfig.explorerApiUrl;

        // Fetch regular and internal transactions in parallel
        const parallelFetchStartTime = performance.now();
        console.log('[RSK Transactions] Fetching regular and internal transactions in parallel...');
        
        const [regularResponse, internalResponse] = await Promise.allSettled([
            fetch(`${explorerApiUrl}/v2/addresses/${address}/transactions`),
            fetch(`${explorerApiUrl}/v2/addresses/${address}/internal-transactions`)
        ]);
        
        const parallelFetchDuration = performance.now() - parallelFetchStartTime;
        console.log(`[RSK Transactions] Parallel API fetching completed in ${parallelFetchDuration.toFixed(2)}ms`);
        
        // Log internal transaction fetch status
        if (internalResponse.status === 'fulfilled') {
            console.log(`[RSK Transactions] Internal transactions API response status: ${internalResponse.value.status} ${internalResponse.value.ok ? 'OK' : 'FAILED'}`);
            if (!internalResponse.value.ok) {
                console.warn(`[RSK Transactions] Internal transactions API returned non-OK status: ${internalResponse.value.status}`);
            }
        } else {
            console.error(`[RSK Transactions] Internal transactions API fetch failed:`, internalResponse.reason);
        }

        try {
            // Process regular transactions first (needed for internal transaction processing)
            if (regularResponse.status === 'fulfilled' && regularResponse.value.ok) {
                const regularTxStartTime = performance.now();
                const response = regularResponse.value;
                console.log(`[RSK Transactions] Regular transactions API call completed (status: ${response.status})`);

            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status}`);
            }

            const parseStartTime = performance.now();
            const data = await response.json();
            const parseDuration = performance.now() - parseStartTime;
            console.log(`[RSK Transactions] JSON parsing completed in ${parseDuration.toFixed(2)}ms`);

            if (data.items && Array.isArray(data.items)) {
                const processStartTime = performance.now();
                console.log(`[RSK Transactions] Processing ${data.items.length} transactions (limiting to 50)...`);
                // Process transactions with contract detection
                const processPromises = data.items.slice(0, 50).map(async (tx: any) => {
                    return await processTransactionWithContractDetection(
                        tx,
                        address,
                        state.rsk.provider,
                        'rsk',
                        network as Environment,
                        etherSwapAddress
                    );
                });

                const processedTransactions = await Promise.allSettled(processPromises);
                for (const result of processedTransactions) {
                    if (result.status === 'fulfilled' && result.value) {
                        transactions.push(result.value);
                    }
                }
                const processDuration = performance.now() - processStartTime;
                console.log(`[RSK Transactions] Regular transaction processing completed in ${processDuration.toFixed(2)}ms (${transactions.length} transactions)`);
                }
            } else if (regularResponse.status === 'rejected') {
                console.error('[RSK Transactions] Regular transactions fetch failed:', regularResponse.reason);
            } else if (regularResponse.status === 'fulfilled' && !regularResponse.value.ok) {
                console.error(`[RSK Transactions] Regular transactions API returned status ${regularResponse.value.status}`);
            }
        } catch (apiError) {
            console.error('[RSK Transactions] Failed to process regular transactions:', apiError);

            // Try alternative API endpoint format
            try {
                const altResponse = await fetch(
                    `${explorerApiUrl}/v2/addresses/${address}/transactions?type=all`
                );

                if (altResponse.ok) {
                    const altData = await altResponse.json();

                    if (altData.items && Array.isArray(altData.items)) {
                        // Process transactions with contract detection
                        const processPromises = altData.items.slice(0, 50).map(async (tx) => {
                            return await processTransactionWithContractDetection(
                                tx,
                                address,
                                state.rsk.provider,
                                'rsk',
                                network as Environment,
                                etherSwapAddress
                            );
                        });

                        const processedTransactions = await Promise.allSettled(processPromises);
                        for (const result of processedTransactions) {
                            if (result.status === 'fulfilled' && result.value) {
                                transactions.push(result.value);
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

                                // Convert rBTC to sats (1 rBTC = 100,000,000 sats)
                                const sats = Math.floor(amount * 100_000_000);
                                const formattedSats = sats.toLocaleString();

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
                                    formattedAmount: `${formattedSats} Sats`,
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

        // Process internal transactions (using data from parallel fetch)
        if (internalResponse.status === 'fulfilled' && internalResponse.value.ok) {
            const internalTxStartTime = performance.now();
            try {
                console.log(`[RSK Transactions] Processing internal transactions (status: ${internalResponse.value.status})...`);
                const parseStartTime = performance.now();
                const internalData = await internalResponse.value.json();
                const parseDuration = performance.now() - parseStartTime;
                console.log(`[RSK Transactions] Internal transactions JSON parsing completed in ${parseDuration.toFixed(2)}ms`);
                
                // Log internal transaction count
                if (internalData && internalData.items && Array.isArray(internalData.items)) {
                    console.log(`[RSK Transactions] Found ${internalData.items.length} internal transactions from API`);
                } else {
                    console.warn(`[RSK Transactions] Internal transactions API response structure unexpected:`, internalData);
                }

                // Validate API response structure
                if (internalData && internalData.items && Array.isArray(internalData.items)) {
                    const setupStartTime = performance.now();
                    // Create Maps for O(1) lookups instead of O(n) find() operations
                    const existingTxIds = new Set(transactions.map(tx => tx.id?.toLowerCase()).filter(Boolean));
                    const existingTxHashes = new Set(transactions.map(tx => tx.hash?.toLowerCase()).filter(Boolean));
                    const parentTxMap = new Map<string, Transaction>();
                    
                    // Build parent transaction map for timestamp lookups
                    for (const tx of transactions) {
                        if (tx.hash) {
                            parentTxMap.set(tx.hash.toLowerCase(), tx);
                        }
                    }
                    const setupDuration = performance.now() - setupStartTime;
                    console.log(`[RSK Transactions] Internal transaction setup (maps/lookups) completed in ${setupDuration.toFixed(2)}ms`);

                    // Cache current block number outside the loop to avoid repeated async calls
                    // This is used for timestamp estimation when block timestamps are not available
                    const blockInfoStartTime = performance.now();
                    let currentBlockNumber: number | null = null;
                    let currentBlockTimestamp: number | null = null;
                    if (state.rsk.provider) {
                        try {
                            currentBlockNumber = await state.rsk.provider.getBlockNumber();
                            // Try to get the actual block timestamp for more accurate estimation
                            try {
                                const currentBlock = await state.rsk.provider.getBlock(currentBlockNumber);
                                if (currentBlock?.timestamp) {
                                    currentBlockTimestamp = currentBlock.timestamp * 1000; // Convert to milliseconds
                                }
                            } catch {
                                // If we can't get block details, we'll use estimation
                            }
                        } catch {
                            // Provider unavailable, will skip timestamp estimation
                            console.debug('[RSK Transactions] Provider unavailable for block number lookup');
                        }
                    }
                    const blockInfoDuration = performance.now() - blockInfoStartTime;
                    console.log(`[RSK Transactions] Block info fetch completed in ${blockInfoDuration.toFixed(2)}ms`);

                    // Process internal transactions (limit to 100 to match total limit)
                    const processStartTime = performance.now();
                    console.log(`[RSK Transactions] Processing ${internalData.items.length} internal transactions (limiting to 100)...`);
                    const initialTxCount = transactions.length;
                    let internalTxIndex = 0;
                    for (const internalTx of internalData.items.slice(0, 100)) {
                        internalTxIndex++;
                        try {
                            // Validate internal transaction structure
                            if (!internalTx || typeof internalTx !== 'object') {
                                console.log(`[RSK Transactions] Internal transaction ${internalTxIndex}: Skipped - invalid structure`);
                                continue;
                            }

                            const internalTxTo = (internalTx.to?.hash || internalTx.to || '').toLowerCase();
                            const internalTxFrom = (internalTx.from?.hash || internalTx.from || '').toLowerCase();
                            
                            // Only include internal transactions that involve the user's address
                            const isUserInvolved = 
                                internalTxFrom === address || internalTxTo === address;
                            
                            console.log(`[RSK Transactions] Internal transaction ${internalTxIndex}:`, {
                               	from: internalTxFrom.substring(0, 10) + '...' || 'unknown',
                               	to: internalTxTo.substring(0, 10) + '...' || 'unknown',
                               	userAddress: address.substring(0, 10) + '...',
                               	value: internalTx.value || '0',
                               	parentTxHash: internalTx.transaction_hash || internalTx.tx_hash || internalTx.hash || 'unknown',
                               	isUserInvolved,
                               	isFromUser: internalTxFrom === address,
                               	isToUser: internalTxTo === address
                            });
                            
                            if (!isUserInvolved) {
                                console.log(`[RSK Transactions] Internal transaction ${internalTxIndex}: Skipped - user not involved`);
                                continue;
                            }

                            // Normalize and validate value
                            let value: string;
                            let amount: number;
                            const rawValue = internalTx.value || '0';
                            try {
                                
                                // Handle hex values (most common format from API)
                                if (rawValue.startsWith('0x')) {
                                    const valueBigInt = BigInt(rawValue);
                                    if (valueBigInt === 0n) continue; // Skip zero value
                                    // Keep value as hex string for Transaction interface
                                    value = rawValue;
                                    // Convert to amount for calculations (wei to rBTC)
                                    amount = parseFloat(ethers.formatEther(valueBigInt));
                                } else {
                                    // Handle decimal string values
                                    // Blockscout API may return values in different formats:
                                    // 1. Hex string (0x...) - already handled above
                                    // 2. Decimal string in wei format (large number like "33215624491200000000")
                                    // 3. Decimal string in rBTC format (small number like "0.0000332156244912")
                                    
                                    // First, try to parse as a number
                                    const valueNum = parseFloat(rawValue);
                                    if (isNaN(valueNum) || valueNum <= 0) continue;
                                    
                                    // Detect format based on magnitude
                                    // If number is >= 1e10, it's likely in wei format (decimal representation)
                                    // If number is < 1e10, it's likely in rBTC format
                                    // Threshold: 1e10 wei = 0.00000001 rBTC (very small)
                                    // This is safer than 1e15 because we want to catch wei values earlier
                                    const WEI_THRESHOLD = 1e10;
                                    
                                    if (valueNum >= WEI_THRESHOLD) {
                                        // Value is in wei format (decimal representation of wei)
                                        // Convert to rBTC for amount calculation
                                        // Use BigInt to avoid precision loss with very large numbers
                                        // parseFloat can lose precision for numbers > Number.MAX_SAFE_INTEGER
                                        // So we need to parse the string directly as BigInt
                                        let valueBigInt: bigint;
                                        try {
                                            // Try to parse as BigInt directly from string to avoid precision loss
                                            valueBigInt = BigInt(rawValue);
                                        } catch {
                                            // If that fails, use Math.floor (may lose precision for very large numbers)
                                            valueBigInt = BigInt(Math.floor(valueNum));
                                        }
                                        amount = parseFloat(ethers.formatEther(valueBigInt));
                                        // Convert to hex string for consistency
                                        value = '0x' + valueBigInt.toString(16);
                                    } else {
                                        // Value is in rBTC format (already in rBTC)
                                        // Use it directly as the amount
                                        amount = valueNum;
                                        // Convert to wei hex string for consistency
                                        // This ensures tx.value is always in wei format (hex string)
                                        const valueWei = ethers.parseEther(valueNum.toString());
                                        // ethers.parseEther() returns a bigint in v6, convert to hex string
                                        value = '0x' + valueWei.toString(16);
                                    }
                                }
                                
                                // Validate the calculated amount
                                if (!isFinite(amount) || isNaN(amount)) {
                                    console.debug('Invalid amount calculated from internal transaction value:', rawValue, amount);
                                    continue;
                                }
                                
                                // Skip if amount is zero or very small (dust)
                                if (amount <= 0 || amount < 0.00000001) continue;
                            } catch (valueError) {
                                console.debug('Failed to parse internal transaction value:', rawValue, valueError);
                                continue;
                            }

                            // Get the parent transaction hash (the external tx that triggered this internal tx)
                            const parentTxHash = (internalTx.transaction_hash || internalTx.tx_hash || internalTx.hash || '').toLowerCase();
                            
                            // Get block number for unique ID generation
                            const blockNumber = parseInt(internalTx.block_number || internalTx.block || '0');
                            
                            // Create a unique ID for this internal transaction
                            // Use parent hash + block number + trace index for uniqueness
                            const internalIndex = internalTx.index || internalTx.trace_address || internalTx.trace_id || '';
                            const hasValidIndex = internalIndex !== '' && internalIndex !== null && internalIndex !== undefined;
                            
                            let uniqueId: string;
                            // Ensure we have valid addresses for unique ID generation
                            const safeFrom = internalTxFrom && internalTxFrom.length >= 8 ? internalTxFrom.slice(0, 8) : 'unknown';
                            const safeTo = internalTxTo && internalTxTo.length >= 8 ? internalTxTo.slice(0, 8) : 'unknown';
                            
                            if (parentTxHash && hasValidIndex) {
                                uniqueId = `${parentTxHash}-internal-${blockNumber}-${internalIndex}`;
                            } else if (parentTxHash) {
                                uniqueId = `${parentTxHash}-internal-${blockNumber}-${safeFrom}-${safeTo}`;
                            } else {
                                // Fallback: use block number + from/to addresses + index
                                // Use a counter or timestamp to ensure uniqueness when index is missing
                                const fallbackIndex = hasValidIndex ? internalIndex : `${Date.now()}-${Math.random().toString(36).substring(7)}`;
                                uniqueId = `internal-${blockNumber}-${internalTxFrom || 'unknown'}-${internalTxTo || 'unknown'}-${fallbackIndex}`;
                            }
                            
                            // Skip if we already have this exact internal transaction
                            if (existingTxIds.has(uniqueId.toLowerCase())) {
                                continue;
                            }

                            // Check for duplicate by transaction details (same parent hash, from, to, value)
                            if (parentTxHash && parentTxHash !== '') {
                                const parentTx = parentTxMap.get(parentTxHash);
                                if (parentTx) {
                                    // Compare values by converting to BigInt (handles both hex and decimal)
                                    const existingValue = parentTx.value || '0';
                                    let existingValueBigInt: bigint;
                                    let currentValueBigInt: bigint;
                                    
                                    try {
                                        existingValueBigInt = existingValue.startsWith('0x')
                                            ? BigInt(existingValue)
                                            : BigInt(ethers.parseEther(existingValue));
                                        currentValueBigInt = value.startsWith('0x')
                                            ? BigInt(value)
                                            : BigInt(ethers.parseEther(value));
                                        
                                        // Check if this is a duplicate
                                        if (parentTx.from?.toLowerCase() === internalTxFrom &&
                                            parentTx.to?.toLowerCase() === internalTxTo &&
                                            existingValueBigInt === currentValueBigInt) {
                                            continue; // Skip duplicate
                                        }
                                    } catch {
                                        // If value parsing fails, skip duplicate check but continue processing
                                        // This transaction might still be valid
                                    }
                                }
                            }

                            // Determine transaction type based on user's address
                            const isFromUser = internalTxFrom === address;
                            const txType: 'send' | 'receive' = isFromUser ? 'send' : 'receive';

                            // Validate amount before converting to sats
                            // Amount should be in rBTC format (typically < 1)
                            // If amount is suspiciously large (> 1e9), something went wrong
                            if (amount > 1e9) {
                                console.warn('Suspiciously large amount detected for internal transaction:', {
                                    rawValue: internalTx.value,
                                    amount,
                                    from: internalTxFrom,
                                    to: internalTxTo
                                });
                                // Skip this transaction as it's likely a parsing error
                                continue;
                            }

                            // Convert rBTC to sats (1 rBTC = 100,000,000 sats)
                            const sats = Math.floor(amount * 100_000_000);
                            
                            // Validate sats value (should be reasonable - not trillions)
                            // Maximum reasonable sats: 21 million BTC * 100M sats = 2.1e15 sats
                            // But for a single transaction, it should be much smaller
                            if (sats > 1e12) {
                                console.warn('Suspiciously large sats value detected:', {
                                    rawValue: internalTx.value,
                                    amount,
                                    sats,
                                    from: internalTxFrom,
                                    to: internalTxTo
                                });
                                // Skip this transaction as it's likely a parsing error
                                continue;
                            }
                            
                            const formattedSats = sats.toLocaleString();

                            // Get timestamp from internal transaction or parent transaction
                            let timestamp: number | undefined;
                            try {
                                if (internalTx.timestamp) {
                                    timestamp = new Date(internalTx.timestamp).getTime();
                                    if (isNaN(timestamp)) timestamp = undefined;
                                } else if (internalTx.created_at) {
                                    timestamp = new Date(internalTx.created_at).getTime();
                                    if (isNaN(timestamp)) timestamp = undefined;
                                }
                                
                                // Try to get timestamp from parent transaction
                                if (!timestamp && parentTxHash && parentTxHash !== '') {
                                    const parentTx = parentTxMap.get(parentTxHash);
                                    if (parentTx?.timestamp) {
                                        timestamp = parentTx.timestamp;
                                    }
                                }
                                
                                // If still no timestamp, try to get from block number (estimate)
                                // Use block time estimation: ~30 seconds per block on RSK (average)
                                if (!timestamp && blockNumber > 0 && currentBlockNumber !== null) {
                                    const blocksAgo = currentBlockNumber - blockNumber;
                                    
                                    // Handle negative blocksAgo (blockNumber > currentBlockNumber)
                                    // This can happen due to reorgs, testnet issues, or API inconsistencies
                                    if (blocksAgo < 0) {
                                        // Block is in the future relative to current block - use current time
                                        // This is likely a data inconsistency, so we use a safe fallback
                                        timestamp = currentBlockTimestamp || Date.now();
                                    } else {
                                        // Estimate timestamp based on block time
                                        // RSK average block time is ~30 seconds, but can vary
                                        const estimatedBlockTime = 30 * 1000; // 30 seconds in ms
                                        
                                        // Use actual current block timestamp if available for better accuracy
                                        if (currentBlockTimestamp) {
                                            timestamp = currentBlockTimestamp - (blocksAgo * estimatedBlockTime);
                                        } else {
                                            // Fallback to Date.now() if we don't have current block timestamp
                                            timestamp = Date.now() - (blocksAgo * estimatedBlockTime);
                                        }
                                        
                                        // Ensure timestamp is not in the future (safety check)
                                        const maxTimestamp = currentBlockTimestamp || Date.now();
                                        if (timestamp > maxTimestamp) {
                                            timestamp = maxTimestamp;
                                        }
                                        
                                        // Ensure timestamp is not too old (more than 1 year ago)
                                        // This prevents extremely inaccurate timestamps for very old blocks
                                        const minTimestamp = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
                                        if (timestamp < minTimestamp && blocksAgo > 10000) {
                                            // For very old blocks (>10000 blocks ago), skip if estimation is too inaccurate
                                            console.debug(`Skipping internal transaction with very old block (${blocksAgo} blocks ago)`);
                                            timestamp = undefined;
                                        }
                                    }
                                }
                                
                                // Skip if we still don't have a valid timestamp
                                if (!timestamp || isNaN(timestamp)) {
                                    console.debug('Skipping internal transaction without valid timestamp');
                                    continue;
                                }
                            } catch (timestampError) {
                                console.debug('Failed to parse internal transaction timestamp:', timestampError);
                                continue;
                            }

                            // Get block number (already parsed above)
                            const parsedBlockNumber = blockNumber > 0 ? blockNumber : 0;

                            // Determine status
                            const status: 'confirmed' | 'failed' = 
                                (internalTx.status === 'ok' || internalTx.success === true || internalTx.success !== false) 
                                    ? 'confirmed' 
                                    : 'failed';

                            // Use parent transaction hash for explorer links
                            // For explorer links, we need the actual transaction hash, not a custom ID
                            // If we don't have a valid transaction hash, skip this transaction
                            // as explorer links won't work without a valid hash
                            const explorerHash = parentTxHash && parentTxHash !== '' && parentTxHash.startsWith('0x') && parentTxHash.length === 66
                                ? parentTxHash 
                                : (internalTx.hash && internalTx.hash.startsWith('0x') && internalTx.hash.length === 66
                                    ? internalTx.hash.toLowerCase()
                                    : null);
                            
                            // Skip transactions without valid explorer hash
                            // We can't create valid explorer links without a real transaction hash
                            if (!explorerHash) {
                                console.debug('Skipping internal transaction without valid transaction hash');
                                continue;
                            }

                            const transaction: Transaction = {
                                hash: explorerHash, // Always use actual hash for explorer links
                                from: internalTxFrom,
                                to: internalTxTo || '0x0000000000000000000000000000000000000000',
                                value: value,
                                gasUsed: internalTx.gas_used?.toString() || '0',
                                gasPrice: internalTx.gas_price?.toString() || '0',
                                blockNumber: parsedBlockNumber,
                                timestamp: timestamp,
                                status: status,
                                type: txType,
                                network: 'rsk',
                                id: uniqueId, // Unique ID for deduplication
                                asset: 'rBTC',
                                formattedAmount: `${formattedSats} Sats`,
                                description: txType === 'send' ? 'RSK transaction sent' : 'RSK payment received',
                                fee: undefined, // Internal transactions don't have separate fees
                                address: internalTxTo || '0x0000000000000000000000000000000000000000',
                                txHash: explorerHash // Use actual hash for compatibility
                            };

                            console.log(`[RSK Transactions] Internal transaction ${internalTxIndex}: Created transaction:`, {
                               	hash: transaction.hash?.substring(0, 10) + '...' || 'unknown',
                               	type: transaction.type,
                               	from: transaction.from?.substring(0, 10) + '...' || 'unknown',
                               	to: transaction.to?.substring(0, 10) + '...' || 'unknown',
                               	value: transaction.value || '0',
                               	parentTxHash: (internalTx.transaction_hash || internalTx.tx_hash || internalTx.hash || 'unknown').substring(0, 10) + '...',
                               	timestamp: new Date(transaction.timestamp).toISOString()
                            });

                            transactions.push(transaction);
                            // Add to lookup maps
                            existingTxIds.add(uniqueId.toLowerCase());
                            if (explorerHash && explorerHash !== uniqueId) {
                                existingTxHashes.add(explorerHash.toLowerCase());
                                parentTxMap.set(explorerHash.toLowerCase(), transaction);
                            }
                        } catch (txError) {
                            console.debug('[RSK Transactions] Error processing internal transaction:', txError);
                            // Continue processing other transactions
                            continue;
                        }
                    }
                    const processDuration = performance.now() - processStartTime;
                    const addedTxCount = transactions.length - initialTxCount;
                    const totalInternalTime = performance.now() - internalTxStartTime;
                    console.log(`[RSK Transactions] Internal transaction processing completed in ${processDuration.toFixed(2)}ms (added ${addedTxCount} transactions, total: ${totalInternalTime.toFixed(2)}ms)`);
                } else {
                    console.debug('[RSK Transactions] Invalid internal transactions API response structure:', internalData);
            }
        } catch (internalError) {
                const internalErrorTime = performance.now() - internalTxStartTime;
                console.error(`[RSK Transactions] ❌ Failed to process internal transactions after ${internalErrorTime.toFixed(2)}ms:`, internalError);
                console.error(`[RSK Transactions] ❌ Internal transactions are CRITICAL for contract interactions - missing received transactions may not appear!`);
            // Continue even if internal transactions fail - regular transactions are still available
            }
        } else if (internalResponse.status === 'rejected') {
            console.error('[RSK Transactions] ❌ Internal transactions fetch failed:', internalResponse.reason);
            console.error('[RSK Transactions] ❌ Internal transactions are CRITICAL for contract interactions - missing received transactions may not appear!');
            // Continue even if internal transactions fail - regular transactions are still available
        } else if (internalResponse.status === 'fulfilled' && !internalResponse.value.ok) {
            console.warn(`[RSK Transactions] ⚠️ Internal transactions API returned status ${internalResponse.value.status}`);
            console.warn(`[RSK Transactions] ⚠️ Internal transactions may not be available - this will cause missing received transactions from contracts!`);
        }

        // Sort all transactions by timestamp (newest first) and remove duplicates
        const dedupeStartTime = performance.now();
        console.log(`[RSK Transactions] Starting deduplication and sorting (${transactions.length} transactions)...`);
        // Use Map for O(1) deduplication instead of O(n²) filter
        const uniqueTxMap = new Map<string, Transaction>();
        
        for (const tx of transactions) {
            const key = tx.id?.toLowerCase() || tx.hash?.toLowerCase() || '';
            if (key && !uniqueTxMap.has(key)) {
                uniqueTxMap.set(key, tx);
            } else if (!key) {
                // Fallback: use hash + from + to + value as key
                const fallbackKey = `${tx.hash || ''}-${tx.from || ''}-${tx.to || ''}-${tx.value || ''}`.toLowerCase();
                if (!uniqueTxMap.has(fallbackKey)) {
                    uniqueTxMap.set(fallbackKey, tx);
                }
            }
        }
        const dedupeDuration = performance.now() - dedupeStartTime;
        console.log(`[RSK Transactions] Deduplication completed in ${dedupeDuration.toFixed(2)}ms (${uniqueTxMap.size} unique transactions)`);
        
        const sortStartTime = performance.now();
        const uniqueTransactions = Array.from(uniqueTxMap.values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 100); // Limit to 100 most recent total
        const sortDuration = performance.now() - sortStartTime;
        console.log(`[RSK Transactions] Sorting and limiting completed in ${sortDuration.toFixed(2)}ms (${uniqueTransactions.length} final transactions)`);

        const totalDuration = performance.now() - startTime;
        console.log(`[RSK Transactions] Total RSK transaction load completed in ${totalDuration.toFixed(2)}ms`);
        return uniqueTransactions;
    } catch (error) {
        const errorDuration = performance.now() - startTime;
        console.error(`[RSK Transactions] Failed to load RSK transactions after ${errorDuration.toFixed(2)}ms:`, error);
        return [];
    }
}

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

/**
 * Load BSC transaction history using BSCScan API
 * Includes timeout protection to prevent blocking other operations
 */
export async function loadBSCTransactions(): Promise<Transaction[]> {
    const startTime = performance.now();
    console.log('[BSC Transactions] Starting BSC transaction load...');
    
    const state = get(walletStore);
    if (!state.bsc.connected || !state.bsc.provider || !state.bsc.wallet) {
        console.log('[BSC Transactions] BSC wallet not connected, skipping');
        return [];
    }

    try {
        const transactions: Transaction[] = [];
        const address = state.bsc.wallet.address.toLowerCase();
        const network = import.meta.env.VITE_BSC_NETWORK || 'testnet';

        // Get network configuration
        const configStartTime = performance.now();
        const bscConfig = getBSCConfig(network);
        const configDuration = performance.now() - configStartTime;
        console.log(`[BSC Transactions] Config loaded in ${configDuration.toFixed(2)}ms`);

        // Get BSCScan API key from environment
        const apiKey = import.meta.env.VITE_BSCSCAN_API_KEY;

        // Use BSCScan API to get transaction history
        const explorerApiUrl = bscConfig.explorerApiUrl;

        // Fetch BNB and USDT transactions in parallel
        const usdtToken = getUSDTToken(network);
        const parallelFetchStartTime = performance.now();
        console.log('[BSC Transactions] Fetching BNB and USDT transactions in parallel...');
        
            const bnbUrl = `${explorerApiUrl}?chainid=${bscConfig.chainId}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
        const usdtUrl = usdtToken 
            ? `${explorerApiUrl}?chainid=${bscConfig.chainId}&module=account&action=tokentx&contractaddress=${usdtToken.address}&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`
            : null;
        
        const fetchPromises: Promise<Response>[] = [
            fetchWithTimeout(bnbUrl, 15000)
        ];
        
        if (usdtUrl) {
            fetchPromises.push(fetchWithTimeout(usdtUrl, 15000));
        }
        
        const results = await Promise.allSettled(fetchPromises);
        const bnbResult = results[0];
        const usdtResult = usdtUrl ? results[1] : null;
        const parallelFetchDuration = performance.now() - parallelFetchStartTime;
        console.log(`[BSC Transactions] Parallel API fetching completed in ${parallelFetchDuration.toFixed(2)}ms`);

        // Process BNB transactions
        if (bnbResult.status === 'fulfilled') {
            const bnbStartTime = performance.now();
            try {
                const bnbResponse = bnbResult.value;
                console.log(`[BSC Transactions] Processing BNB transactions (status: ${bnbResponse.status})...`);

                if (bnbResponse.ok) {
                const parseStartTime = performance.now();
                const bnbData = await bnbResponse.json();
                const parseDuration = performance.now() - parseStartTime;
                console.log(`[BSC Transactions] BNB transactions JSON parsing completed in ${parseDuration.toFixed(2)}ms`);

                // Check for API success status (V2 API returns status field)
                if (bnbData.status === '1' && bnbData.result && Array.isArray(bnbData.result)) {
                    const processStartTime = performance.now();
                    console.log(`[BSC Transactions] Processing ${bnbData.result.length} BNB transactions (limiting to 50)...`);
                    // Process transactions with contract detection
                    const processPromises = bnbData.result.slice(0, 50).map(async (tx: any) => {
                        // Convert BSCScan API format to our format
                        const normalizedTx = {
                            hash: tx.hash,
                            from: tx.from,
                            to: tx.to,
                            value: tx.value || '0',
                            input: tx.input,
                            data: tx.input,
                            gas_used: tx.gasUsed,
                            gas_price: tx.gasPrice,
                            gasUsed: tx.gasUsed,
                            gasPrice: tx.gasPrice,
                            block_number: tx.blockNumber,
                            blockNumber: tx.blockNumber,
                            timestamp: parseInt(tx.timeStamp) * 1000,
                            status: tx.isError === '0' ? 'ok' : 'failed',
                            method: tx.methodID ? `0x${tx.methodID}` : undefined
                        };
                        
                        return await processTransactionWithContractDetection(
                            normalizedTx,
                            address,
                            state.bsc.provider,
                            'bsc',
                            'mainnet' as Environment,
                            null // No EtherSwap on BSC
                        );
                    });

                    const processedTransactions = await Promise.allSettled(processPromises);
                    for (const result of processedTransactions) {
                        if (result.status === 'fulfilled' && result.value) {
                            transactions.push(result.value);
                        }
                    }
                    const processDuration = performance.now() - processStartTime;
                    const totalBnbTime = performance.now() - bnbStartTime;
                    console.log(`[BSC Transactions] BNB transaction processing completed in ${processDuration.toFixed(2)}ms (${transactions.length} transactions, total: ${totalBnbTime.toFixed(2)}ms)`);
                } else if (bnbData.status === '0') {
                    console.warn('[BSC Transactions] BSCScan API returned error for BNB transactions:', bnbData.message || bnbData.result);
                }
            } else {
                console.error(`[BSC Transactions] Failed to process BNB transactions: ${bnbResponse.status} ${bnbResponse.statusText}`);
            }
            } catch (bnbError) {
                const bnbErrorTime = performance.now() - bnbStartTime;
                const errorMessage = bnbError instanceof Error ? bnbError.message : String(bnbError);
                if (errorMessage.includes('timeout')) {
                    console.warn(`[BSC Transactions] BSCScan API request timed out for BNB transactions after ${bnbErrorTime.toFixed(2)}ms - transaction history may be incomplete`);
                } else {
                    console.error(`[BSC Transactions] Failed to process BNB transactions after ${bnbErrorTime.toFixed(2)}ms:`, bnbError);
                }
            }
        } else if (bnbResult.status === 'rejected') {
            const errorMessage = bnbResult.reason instanceof Error ? bnbResult.reason.message : String(bnbResult.reason);
            if (errorMessage.includes('timeout')) {
                console.warn('[BSC Transactions] BSCScan API request timed out for BNB transactions - transaction history may be incomplete');
            } else {
                console.error('[BSC Transactions] Failed to fetch BNB transactions:', bnbResult.reason);
            }
        }

        // Process USDT token transactions (from parallel fetch)
        if (usdtToken && usdtResult !== null && usdtResult.status === 'fulfilled') {
            const usdtStartTime = performance.now();
            try {
                const usdtResponse = usdtResult.value;
                console.log(`[BSC Transactions] Processing USDT transactions (status: ${usdtResponse.status})...`);

                if (usdtResponse.ok) {
                    const parseStartTime = performance.now();
                    const usdtData = await usdtResponse.json();
                    const parseDuration = performance.now() - parseStartTime;
                    console.log(`[BSC Transactions] USDT transactions JSON parsing completed in ${parseDuration.toFixed(2)}ms`);

                    // Check for API success status (V2 API returns status field)
                    if (usdtData.status === '1' && usdtData.result && Array.isArray(usdtData.result)) {
                        const processStartTime = performance.now();
                        console.log(`[BSC Transactions] Processing ${usdtData.result.length} USDT transactions (limiting to 50)...`);
                        const initialTxCount = transactions.length;
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
                        const processDuration = performance.now() - processStartTime;
                        const addedTxCount = transactions.length - initialTxCount;
                        const totalUsdtTime = performance.now() - usdtStartTime;
                        console.log(`[BSC Transactions] USDT transaction processing completed in ${processDuration.toFixed(2)}ms (added ${addedTxCount} transactions, total: ${totalUsdtTime.toFixed(2)}ms)`);
                    }
                }
            } catch (usdtError) {
                // Log error but continue - don't let USDT fetch failure block return of BNB transactions
                const usdtErrorTime = performance.now() - usdtStartTime;
                const errorMessage = usdtError instanceof Error ? usdtError.message : String(usdtError);
                if (errorMessage.includes('timeout')) {
                    console.warn(`[BSC Transactions] BSCScan API request timed out for USDT transactions after ${usdtErrorTime.toFixed(2)}ms - transaction history may be incomplete`);
                } else {
                    console.error(`[BSC Transactions] Failed to process USDT transactions after ${usdtErrorTime.toFixed(2)}ms:`, usdtError);
                }
            }
        } else if (usdtToken && usdtResult !== null && usdtResult.status === 'rejected') {
            const errorMessage = usdtResult.reason instanceof Error ? usdtResult.reason.message : String(usdtResult.reason);
            if (errorMessage.includes('timeout')) {
                console.warn('[BSC Transactions] BSCScan API request timed out for USDT transactions - transaction history may be incomplete');
            } else {
                console.error('[BSC Transactions] Failed to fetch USDT transactions:', usdtResult.reason);
                }
        } else if (usdtToken && usdtResult !== null && usdtResult.status === 'fulfilled' && !usdtResult.value.ok) {
            console.error(`[BSC Transactions] USDT transactions API returned status ${usdtResult.value.status}`);
        }

        // Sort transactions by timestamp and remove duplicates
        const dedupeStartTime = performance.now();
        console.log(`[BSC Transactions] Starting deduplication and sorting (${transactions.length} transactions)...`);
        const uniqueTransactions = transactions
            .filter((tx, index, self) =>
                index === self.findIndex(t => t.hash === tx.hash)
            )
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100); // Limit to 100 most recent
        const dedupeDuration = performance.now() - dedupeStartTime;
        console.log(`[BSC Transactions] Deduplication and sorting completed in ${dedupeDuration.toFixed(2)}ms (${uniqueTransactions.length} final transactions)`);

        const totalDuration = performance.now() - startTime;
        console.log(`[BSC Transactions] Total BSC transaction load completed in ${totalDuration.toFixed(2)}ms`);
        return uniqueTransactions;

    } catch (error) {
        const errorDuration = performance.now() - startTime;
        console.error(`[BSC Transactions] Failed to load BSC transaction history after ${errorDuration.toFixed(2)}ms:`, error);
        return [];
    }
}


/**
 * Update transaction status in the wallet store
 * Note: This invalidates the transactionsLastLoaded timestamp since we're modifying transactions
 * This ensures the component will refresh on next open to get the latest data
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
            transactions: updatedTransactions,
            // Invalidate timestamp to ensure fresh data on next load
            // Set to null so component knows to refresh
            transactionsLastLoaded: null
        };
    });
}

