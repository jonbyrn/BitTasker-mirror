/**
 * RIF Relay HTTP Client
 * Direct HTTP API implementation for RIF Relay without SDK dependency
 * 
 * This avoids the ethers v5/v6 compatibility issues with @rsksmart/rif-relay-client
 * by directly calling the RIF Relay HTTP API.
 * 
 * Based on official RIF Relay Integration documentation:
 * https://dev.rootstock.io/developers/integrate/rif-relay/integrate/
 * 
 * API Endpoint: POST http://<SERVER_URL>/relay
 * Request Format:
 * {
 *   "relayRequest": { request: {...}, relayData: {...} },
 *   "metadata": { relayHubAddress, signature, relayMaxNonce }
 * }
 */

import { ethers, type Wallet } from 'ethers';
import { getBoltzConfig, isRifRelayAvailable } from './config';

export interface RelayTransactionParams {
    smartWalletAddress: string;  // FROM address (Smart Wallet, not EOA)
    targetContract: string;      // TO address (contract to call)
    encodedData: string;         // Encoded function call data
    gas?: string;
    value?: string;
}

export interface RelayTransactionResult {
    hash: string;
    relayed: boolean;
}

export interface RelayMetadata {
    relayHubAddress: string;
    relayWorkerAddress: string;
    relayManagerAddress: string;
    feesReceiver: string;
    minGasPrice: string;
    ready: boolean;
    version: string;
    chainId: string;
    networkId: string;
    smartWalletFactoryAddress?: string;  // CRITICAL: Needed for Smart Wallet deployment!
}

export interface RelayVerifiers {
    trustedVerifiers: string[];
}

export class RifRelayHttpClientError extends Error {
    constructor(
        message: string,
        public code: string,
        public originalError?: unknown
    ) {
        super(message);
        this.name = 'RifRelayHttpClientError';
    }
}

/**
 * RIF Relay HTTP Client
 * Direct HTTP API integration without SDK dependency
 */
export class RifRelayHttpClient {
    private config = getBoltzConfig();
    private relayMetadata: RelayMetadata | null = null;

    /**
     * Get relay server metadata
     */
    async getRelayMetadata(): Promise<RelayMetadata> {
        if (this.relayMetadata) {
            return this.relayMetadata;
        }

        try {
            const response = await fetch(`${this.config.rifRelayServerUrl}/chain-info`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new RifRelayHttpClientError(
                    `Failed to fetch relay metadata: ${response.statusText}`,
                    'METADATA_FETCH_FAILED'
                );
            }

            this.relayMetadata = await response.json();
            return this.relayMetadata!;
        } catch (error) {
            console.error('❌ Failed to get relay metadata:', error);
            throw new RifRelayHttpClientError(
                'Failed to get relay metadata: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'METADATA_ERROR',
                error
            );
        }
    }

    /**
     * Get relay verifiers
     */
    async getRelayVerifiers(): Promise<RelayVerifiers> {
        try {
            const response = await fetch(`${this.config.rifRelayServerUrl}/verifiers`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new RifRelayHttpClientError(
                    `Failed to fetch relay verifiers: ${response.statusText}`,
                    'VERIFIERS_FETCH_FAILED'
                );
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get relay verifiers:', error);
            throw new RifRelayHttpClientError(
                'Failed to get relay verifiers: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'VERIFIERS_ERROR',
                error
            );
        }
    }

    /**
     * Check if relay server is healthy and ready
     */
    async checkHealth(): Promise<boolean> {
        try {
            const metadata = await this.getRelayMetadata();
            return metadata.ready === true;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return false;
        }
    }

    /**
     * Relay a transaction through RIF Relay (gasless)
     * 
     * This method constructs a relay request according to the official RIF Relay API spec
     * and submits it to the RIF Relay server which will pay the gas fees and broadcast it.
     * 
     * IMPORTANT: The transaction must be FROM a Smart Wallet, not an EOA.
     * Ensure Smart Wallet is deployed before calling this method.
     * 
     * Reference: https://dev.rootstock.io/developers/integrate/rif-relay/integrate/
     * 
     * @param txParams - Transaction parameters (from Smart Wallet)
     * @param ownerWallet - EOA wallet that owns the Smart Wallet (for signing)
     * @returns Transaction hash
     */
    async relayTransaction(
        txParams: RelayTransactionParams,
        ownerWallet: Wallet
    ): Promise<RelayTransactionResult> {
        try {
            if (!isRifRelayAvailable()) {
                throw new RifRelayHttpClientError(
                    'RIF Relay is not available for this environment',
                    'RIF_RELAY_UNAVAILABLE'
                );
            }

            console.log('🚀 Relaying transaction via RIF Relay HTTP API:', {
                smartWallet: txParams.smartWalletAddress,
                targetContract: txParams.targetContract,
                dataLength: txParams.encodedData.length,
                gas: txParams.gas,
                value: txParams.value || '0'
            });

            // Get relay metadata
            const metadata = await this.getRelayMetadata();

            if (!metadata.ready) {
                throw new RifRelayHttpClientError(
                    'RIF Relay server is not ready',
                    'RELAY_NOT_READY'
                );
            }

            // Get nonce for Smart Wallet
            const nonce = await ownerWallet.provider!.getTransactionCount(txParams.smartWalletAddress);

            // Build relay request according to RIF Relay specification
            // Based on @rsksmart/rif-relay-contracts ForwardRequestStruct:
            // - Addresses are strings
            // - Numeric values (value, gas, nonce, tokenAmount, tokenGas, validUntilTime) are BigNumberish (numbers)
            const relayRequest = {
                request: {
                    relayHub: metadata.relayHubAddress,      // Relay hub address (string)
                    from: txParams.smartWalletAddress,       // Smart Wallet address (string)
                    to: txParams.targetContract,             // Target contract (string)
                    tokenContract: ethers.ZeroAddress,       // No token payment (string)
                    value: parseInt(txParams.value || '0'),  // Value in wei (number!)
                    gas: parseInt(txParams.gas || '200000'), // Gas limit (number!)
                    nonce: nonce,                            // Nonce (number!)
                    tokenAmount: 0,                          // Token amount (number!)
                    tokenGas: 0,                             // Token gas (number!)
                    validUntilTime: 0,                       // No expiry (number!)
                    data: txParams.encodedData               // Encoded function call (string)
                },
                relayData: {
                    gasPrice: metadata.minGasPrice,          // Gas price (string)
                    feesReceiver: metadata.feesReceiver,     // Fees receiver (string)
                    callForwarder: txParams.smartWalletAddress,  // Smart Wallet (string)
                    callVerifier: metadata.relayHubAddress   // Using RelayHub as verifier (string)
                }
            };

            // Get chain ID
            const network = await ownerWallet.provider!.getNetwork();
            const chainId = Number(network.chainId);
            
            // Sign with EIP-712 _signTypedData (NOT signMessage!)
            // The verifyingContract in the domain is the callForwarder (Smart Wallet)
            const signature = await this.signRelayRequest(
                relayRequest,
                chainId,
                ownerWallet
            );

            console.log('📝 Request signed by Smart Wallet owner:', ownerWallet.address);

            // Convert numbers to strings for HTTP API (matching @rsksmart/rif-relay-client)
            const stringifiedRequest = {
                request: {
                    ...relayRequest.request,
                    value: relayRequest.request.value.toString(),
                    gas: relayRequest.request.gas.toString(),
                    nonce: relayRequest.request.nonce.toString(),
                    tokenAmount: relayRequest.request.tokenAmount.toString(),
                    tokenGas: relayRequest.request.tokenGas.toString(),
                    validUntilTime: relayRequest.request.validUntilTime.toString()
                },
                relayData: {
                    ...relayRequest.relayData,
                    gasPrice: relayRequest.relayData.gasPrice.toString()
                }
            };

            // Submit relay request to RIF Relay server
            const response = await fetch(`${this.config.rifRelayServerUrl}/relay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    relayRequest: stringifiedRequest,
                    metadata: {
                        relayHubAddress: metadata.relayHubAddress,
                        relayMaxNonce: 1000000,  // Max nonce for relay server
                        signature
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ RIF Relay server error:', response.status, errorText);
                throw new RifRelayHttpClientError(
                    `Relay request failed: ${response.status} ${errorText}`,
                    'RELAY_REQUEST_FAILED'
                );
            }

            const result = await response.json();

            console.log('📋 Relay response:', result);

            // CRITICAL: RIF Relay returns signedTx (raw signed transaction), not txHash!
            const signedTx = result.signedTx;
            const error = result.error;

            if (error) {
                throw new RifRelayHttpClientError(
                    `RIF Relay server error: ${error}`,
                    'RELAY_SERVER_ERROR'
                );
            }

            if (!signedTx) {
                console.error('❌ Response structure:', {
                    keys: Object.keys(result),
                    fullResult: result
                });
                throw new RifRelayHttpClientError(
                    `No signedTx in relay response. Response keys: ${Object.keys(result).join(', ')}`,
                    'INVALID_RELAY_RESPONSE'
                );
            }

            // Parse the signed transaction to get the hash
            const tx = ethers.Transaction.from(signedTx);
            const txHash = tx.hash;

            if (!txHash) {
                throw new RifRelayHttpClientError(
                    'Could not parse transaction hash from signedTx',
                    'INVALID_SIGNED_TX'
                );
            }

            console.log('✅ Transaction relayed successfully:', txHash);
            console.log('📋 Signed transaction:', signedTx);

            // Optionally broadcast the transaction ourselves (RIF Relay should do this, but as backup)
            try {
                await ownerWallet.provider!.sendTransaction(signedTx);
                console.log('📡 Transaction broadcast successful');
            } catch (broadcastError) {
                // It's ok if this fails - relay server probably already broadcast it
                console.log('ℹ️ Transaction already in mempool or broadcast by relay server');
            }

            return {
                hash: txHash,
                relayed: true
            };
        } catch (error) {
            console.error('❌ Failed to relay transaction:', error);

            if (error instanceof RifRelayHttpClientError) {
                throw error;
            }

            throw new RifRelayHttpClientError(
                'Transaction relay failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'RELAY_FAILED',
                error
            );
        }
    }

    /**
     * Sign relay request using EIP-712 _signTypedData
     * 
     * CRITICAL: Based on @rsksmart/rif-relay-client implementation:
     * - Uses wallet._signTypedData() NOT signMessage()
     * - Domain verifyingContract is callForwarder (Smart Wallet), NOT callVerifier!
     */
    private async signRelayRequest(
        relayRequest: any,
        chainId: number,
        wallet: Wallet
    ): Promise<string> {
        // EIP-712 Domain - CRITICAL: verifyingContract is callForwarder (Smart Wallet)!
        const domain = {
            name: 'RSK Enveloping Transaction',
            version: '2',
            chainId: chainId,
            verifyingContract: relayRequest.relayData.callForwarder  // Smart Wallet address!
        };

        // EIP-712 Types (from @rsksmart/rif-relay-client/dist/typedRequestData.utils.js)
        const types = {
            RelayRequest: [
                { name: 'relayHub', type: 'address' },
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'tokenContract', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'gas', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'tokenAmount', type: 'uint256' },
                { name: 'tokenGas', type: 'uint256' },
                { name: 'validUntilTime', type: 'uint256' },
                { name: 'data', type: 'bytes' },
                { name: 'relayData', type: 'RelayData' }
            ],
            RelayData: [
                { name: 'gasPrice', type: 'uint256' },
                { name: 'feesReceiver', type: 'address' },
                { name: 'callForwarder', type: 'address' },
                { name: 'callVerifier', type: 'address' }
            ]
        };

        // Value to sign
        const value = {
            ...relayRequest.request,
            relayData: relayRequest.relayData
        };

        // Sign using wallet._signTypedData (EIP-712)
        return await wallet.signTypedData(domain, types, value);
    }

    /**
     * Check if a Smart Wallet already exists for a given owner
     * Scans recent blocks for Smart Wallet contracts owned by the user
     */
    private async getExistingSmartWallet(
        ownerAddress: string,
        ownerWallet: Wallet,
        index: number
    ): Promise<string | null> {
        try {
            // Method 1: Scan recent blocks for Smart Wallet deployments
            const currentBlock = await ownerWallet.provider!.getBlockNumber();
            const startBlock = Math.max(0, currentBlock - 1000); // Check last 1000 blocks
            
            console.log(`📋 Scanning blocks ${startBlock} to ${currentBlock} for Smart Wallets...`);
            
            // Get all blocks in range
            for (let blockNum = currentBlock; blockNum >= startBlock; blockNum--) {
                const block = await ownerWallet.provider!.getBlock(blockNum, true);
                if (!block || !block.transactions) continue;
                
                for (const tx of block.transactions) {
                    if (typeof tx === 'string') continue;
                    
                    const receipt = await ownerWallet.provider!.getTransactionReceipt(tx.hash);
                    if (!receipt) continue;
                    
                    // Check all addresses in this transaction
                    const addressesToCheck: string[] = [];
                    
                    // Check contract creation
                    if (receipt.contractAddress) {
                        addressesToCheck.push(receipt.contractAddress);
                    }
                    
                    // Check all log addresses
                    for (const log of receipt.logs) {
                        if (log.address && !addressesToCheck.includes(log.address.toLowerCase())) {
                            addressesToCheck.push(log.address);
                        }
                    }
                    
                    // Check each address to see if it's a Smart Wallet owned by our user
                    for (const addr of addressesToCheck) {
                        const code = await ownerWallet.provider!.getCode(addr);
                        if (code && code !== '0x' && code.length > 100) {
                            // Has contract code, check if it has owner() method
                            try {
                                const contract = new ethers.Contract(
                                    addr,
                                    ['function owner() view returns (address)'],
                                    ownerWallet.provider
                                );
                                const owner = await contract.owner();
                                
                                if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
                                    console.log('✅ Found existing Smart Wallet:', addr, 'in block', blockNum);
                                    return ethers.getAddress(addr);
                                }
                            } catch {
                                // Not a Smart Wallet or doesn't have owner() method
                                continue;
                            }
                        }
                    }
                }
                
                // Log progress every 100 blocks
                if ((currentBlock - blockNum) % 100 === 0) {
                    console.log(`📋 Scanned ${currentBlock - blockNum} blocks...`);
                }
            }
            
            console.log('📋 No existing Smart Wallet found in recent blocks');
            return null;
        } catch (error) {
            console.error('❌ Error checking for existing Smart Wallet:', error);
            return null;
        }
    }

    /**
     * Deploy a Smart Wallet for a user (gasless)
     * 
     * This deploys a new Smart Wallet contract owned by the user's EOA.
     * The Smart Wallet can then be used for gasless transactions via RIF Relay.
     * 
     * @param ownerAddress - EOA address that will own the Smart Wallet
     * @param ownerWallet - EOA wallet for signing the deployment request
     * @param index - Smart Wallet index (usually 0 for first wallet)
     * @returns Smart Wallet contract address
     */
    async deploySmartWallet(
        ownerAddress: string,
        ownerWallet: Wallet,
        index: number = 0
    ): Promise<string> {
        try {
            console.log('🚀 Deploying Smart Wallet for owner:', ownerAddress);
            
            // FIRST: Check if Smart Wallet already exists!
            // The deployment might have succeeded in a previous attempt
            console.log('📋 Checking if Smart Wallet already exists...');
            const existingWallet = await this.getExistingSmartWallet(ownerAddress, ownerWallet, index);
            if (existingWallet) {
                console.log('✅ Smart Wallet already exists:', existingWallet);
                return existingWallet;
            }
            console.log('📋 No existing Smart Wallet found, proceeding with deployment...');

            // Get relay metadata
            const metadata = await this.getRelayMetadata();

            if (!metadata.ready) {
                throw new RifRelayHttpClientError(
                    'RIF Relay server is not ready',
                    'RELAY_NOT_READY'
                );
            }

            // Get verifiers (we need DeployVerifier for deployment)
            const verifiers = await this.getRelayVerifiers();
            
            if (!verifiers.trustedVerifiers || verifiers.trustedVerifiers.length === 0) {
                throw new RifRelayHttpClientError(
                    'No trusted verifiers found',
                    'NO_VERIFIERS'
                );
            }
            
            // First verifier should be the DeployVerifier
            const deployVerifier = verifiers.trustedVerifiers[0];
            console.log('📋 Using DeployVerifier:', deployVerifier);
            
            // CRITICAL: Get Smart Wallet Factory address from config
            const config = getBoltzConfig();
            const factoryAddress = config.smartWalletFactoryAddress;
            
            if (!factoryAddress || factoryAddress === ethers.ZeroAddress) {
                throw new RifRelayHttpClientError(
                    'Smart Wallet Factory address not configured. Please add it to src/lib/integrations/boltz/config.ts.\n' +
                    'You can find it in your RIF Relay deployment logs by searching for "MinimalBoltzSmartWalletFactory".',
                    'FACTORY_ADDRESS_NOT_CONFIGURED'
                );
            }
            console.log('📋 Using Smart Wallet Factory:', factoryAddress);

            // Get nonce for owner EOA
            const nonce = await ownerWallet.provider!.getTransactionCount(ownerAddress);

            // Build deploy request
            // Based on @rsksmart/rif-relay-contracts DeployRequestStruct
            // Important: DeployRequestStruct does NOT have a 'gas' field!
            // Fields: relayHub, from, to, tokenContract, recoverer, value, nonce, tokenAmount, tokenGas, validUntilTime, index, data
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 2);
            tomorrow.setHours(0, 0, 0, 0);
            // CRITICAL: validUntilTime is in SECONDS, not milliseconds!
            const tomorrowTimestamp = Math.round(tomorrow.getTime() / 1000);

            // IMPORTANT: According to RIF Relay docs, for deployment:
            // - callForwarder should be the Smart Wallet Factory address
            // - callVerifier should be the DeployVerifier address
            const deployRequest = {
                request: {
                    relayHub: metadata.relayHubAddress,  // Relay hub address (string)
                    from: ownerAddress,                  // Owner EOA (string)
                    to: ethers.ZeroAddress,              // Deploy (no target) (string)
                    tokenContract: ethers.ZeroAddress,   // Token contract (string)
                    recoverer: ethers.ZeroAddress,       // No recovery address (string)
                    value: "0",                          // Value in wei (string!)
                    nonce: nonce.toString(),                        // Nonce (string!)
                    tokenAmount: "0",                      // Token amount (string!)
                    tokenGas: "0",                         // Token gas (string!)
                    validUntilTime: tomorrowTimestamp,                   // Valid until time (number!)
                    index: Number(index),                // Smart Wallet index (number!)
                    data: '0x'                           // No initialization data (string)
                },
                relayData: {
                    gasPrice: metadata.minGasPrice,      // Gas price (string)
                    feesReceiver: metadata.feesReceiver, // Fees receiver (string)
                    callForwarder: factoryAddress,       // ✅ Smart Wallet Factory (NOT owner!)
                    callVerifier: deployVerifier         // ✅ DeployVerifier
                }
            };

            console.log('📝 Deploy request structure:', {
                indexType: typeof deployRequest.request.index,
                indexValue: deployRequest.request.index,
                nonceType: typeof deployRequest.request.nonce,
                validUntilTimeType: typeof deployRequest.request.validUntilTime,
                valueType: typeof deployRequest.request.value
            });

            console.log('📝 Full deploy request before hashing:', JSON.stringify(deployRequest, null, 2));

            // Get chain ID
            const network = await ownerWallet.provider!.getNetwork();
            const chainId = Number(network.chainId);
            console.log('📋 Chain ID:', chainId);

            // Sign with EIP-712 _signTypedData (NOT signMessage!)
            // The verifyingContract in the domain is the callForwarder (Factory for deploy)
            const signature = await this.signDeployRequest(
                deployRequest,
                chainId,
                ownerWallet
            );

            console.log('📝 Deployment request signed by owner');

            // Submit deploy request to RIF Relay server
            const response = await fetch(`${this.config.rifRelayServerUrl}/relay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    relayRequest: deployRequest,
                    metadata: {
                        relayHubAddress: metadata.relayHubAddress,
                        relayMaxNonce: 1000000,
                        signature
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Smart Wallet deployment failed:', response.status, errorText);
                throw new RifRelayHttpClientError(
                    `Deployment failed: ${response.status} ${errorText}`,
                    'DEPLOYMENT_FAILED'
                );
            }

            const result = await response.json();

            console.log('📋 Deployment response:', result);
            console.log('📋 Response keys:', Object.keys(result));
            console.log('📋 Full response structure:', JSON.stringify(result, null, 2));

            // CRITICAL: RIF Relay returns signedTx (raw signed transaction), not txHash!
            const signedTx = result.signedTx;
            const error = result.error;

            if (error) {
                throw new RifRelayHttpClientError(
                    `RIF Relay deployment error: ${error}`,
                    'DEPLOYMENT_SERVER_ERROR'
                );
            }

            if (!signedTx) {
                throw new RifRelayHttpClientError(
                    `No signedTx in deployment response. Available fields: ${Object.keys(result).join(', ')}`,
                    'INVALID_DEPLOYMENT_RESPONSE'
                );
            }

            // Parse the signed transaction to get the hash
            const tx = ethers.Transaction.from(signedTx);
            const txHash = tx.hash;

            if (!txHash) {
                throw new RifRelayHttpClientError(
                    'Could not parse transaction hash from signedTx',
                    'INVALID_SIGNED_TX'
                );
            }

            console.log('📋 Deployment transaction hash:', txHash);
            console.log('📋 Signed transaction:', signedTx);

            // Broadcast the transaction ourselves (RIF Relay should do this, but as backup)
            try {
                await ownerWallet.provider!.sendTransaction(signedTx);
                console.log('📡 Deployment transaction broadcast successful');
            } catch (broadcastError) {
                // It's ok if this fails - relay server probably already broadcast it
                console.log('ℹ️ Deployment transaction already in mempool or broadcast by relay server');
            }

            console.log('⏳ Waiting for deployment transaction to be mined...');

            // Wait for transaction to be mined
            const receipt = await ownerWallet.provider!.waitForTransaction(txHash);

            if (!receipt) {
                throw new RifRelayHttpClientError(
                    'Deployment transaction receipt not found',
                    'TX_RECEIPT_NOT_FOUND'
                );
            }

            console.log('✅ Deployment transaction mined in block:', receipt.blockNumber);
            console.log('📋 Full receipt:', {
                blockNumber: receipt.blockNumber,
                transactionHash: receipt.hash,
                contractAddress: receipt.contractAddress,
                logsLength: receipt.logs.length,
                status: receipt.status,
                to: receipt.to,
                from: receipt.from
            });

            // Extract Smart Wallet address from contract deployment
            // The deployed contract address is in receipt.contractAddress for direct deployments,
            // but for factory deployments, we need to look at the logs
            let smartWalletAddress: string | null = null;

            // First try: contractAddress (for direct CREATE)
            if (receipt.contractAddress && receipt.contractAddress !== ethers.ZeroAddress) {
                smartWalletAddress = receipt.contractAddress;
                console.log('📋 Smart Wallet address from receipt.contractAddress:', smartWalletAddress);
            } else {
                // Second try: Parse logs for Deployed event
                // Factory contracts emit: Deployed(address smartWallet, uint256 index)
                console.log('📋 Looking for Deployed event in logs...');
                console.log('📋 Number of logs:', receipt.logs.length);
                
                if (receipt.logs.length === 0) {
                console.warn('⚠️ No logs found in receipt - deployment likely created Smart Wallet internally');
                
                // IMPORTANT: The deployment transaction succeeded (status: 1)
                // The Smart Wallet WAS created, we just can't see it in logs
                // Try to find it by checking if our owner address now points to a Smart Wallet
                
                // First check if the owner address itself became a contract (proxied deployment)
                console.log('📋 Checking if owner address has contract code...');
                const ownerCode = await ownerWallet.provider!.getCode(ownerAddress);
                if (ownerCode && ownerCode !== '0x') {
                    console.log('✅ Owner address has contract code! This is the Smart Wallet (proxy pattern)');
                    smartWalletAddress = ownerAddress;
                } else {
                    console.log('⚠️ Owner address is still an EOA, Smart Wallet is at a different address');
                }
                
                // The Smart Wallet was created as an internal transaction by the RelayHub
                // We need to look at the debug trace to find the contract creation address
                try {
                    console.log('📋 Fetching transaction trace...');
                    
                    // Method 1: Check for contract creations using eth_getTransactionReceipt logs
                    // Sometimes internal contract creations don't emit logs in the outer receipt
                    
                    // Method 2: Query all transactions in the block and find new contract addresses
                    const block = await ownerWallet.provider!.getBlock(receipt.blockNumber, true);
                    console.log('📋 Block has', block?.transactions?.length, 'transactions');
                    
                    if (block && block.transactions) {
                        for (const tx of block.transactions) {
                            if (typeof tx === 'string') continue;
                            
                            const txReceipt = await ownerWallet.provider!.getTransactionReceipt(tx.hash);
                            
                            // Check if this transaction created a contract
                            if (txReceipt && txReceipt.contractAddress) {
                                console.log('📋 Found contract creation:', txReceipt.contractAddress, 'in tx:', tx.hash);
                                
                                // Check if this contract is a Smart Wallet by checking its code
                                const code = await ownerWallet.provider!.getCode(txReceipt.contractAddress);
                                if (code && code !== '0x' && code.length > 100) {
                                    // This looks like a contract (has code)
                                    // Check if it's owned by our user by trying to call owner()
                                    try {
                                        const possibleSW = new ethers.Contract(
                                            txReceipt.contractAddress,
                                            ['function owner() view returns (address)'],
                                            ownerWallet.provider
                                        );
                                        const owner = await possibleSW.owner();
                                        
                                        if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
                                            smartWalletAddress = txReceipt.contractAddress;
                                            console.log('✅ Found Smart Wallet by owner check:', smartWalletAddress);
                                            break;
                                        }
                                    } catch {
                                        // Not a Smart Wallet or doesn't have owner() method
                                    }
                                }
                            }
                        }
                    }
                    
                    // Method 3: Try trace_transaction if available (some nodes support this)
                    if (!smartWalletAddress) {
                        console.log('📋 Trying eth_traceTransaction...');
                        try {
                            const trace = await ownerWallet.provider!.send('debug_traceTransaction', [
                                txHash,
                                { tracer: 'callTracer' }
                            ]);
                            
                            console.log('📋 Transaction trace:', trace);
                            
                            // Look for contract creations in the trace
                            const findContractCreation = (call: any): string | null => {
                                if (call.type === 'CREATE' || call.type === 'CREATE2') {
                                    console.log('📋 Found CREATE/CREATE2 call:', call);
                                    return call.to;
                                }
                                if (call.calls) {
                                    for (const subcall of call.calls) {
                                        const addr = findContractCreation(subcall);
                                        if (addr) return addr;
                                    }
                                }
                                return null;
                            };
                            
                            const createdAddress = findContractCreation(trace);
                            if (createdAddress) {
                                smartWalletAddress = createdAddress;
                                console.log('✅ Found Smart Wallet from trace:', smartWalletAddress);
                            } else {
                                console.log('⚠️ No CREATE/CREATE2 found in trace - Smart Wallet may already exist');
                                
                                // Check if there's a call to a potential Smart Wallet address
                                // The RelayHub might call an existing Smart Wallet
                                const findCalls = (call: any): string[] => {
                                    const addresses: string[] = [];
                                    if (call.to && call.to !== metadata.relayHubAddress.toLowerCase()) {
                                        addresses.push(call.to);
                                    }
                                    if (call.calls) {
                                        for (const subcall of call.calls) {
                                            addresses.push(...findCalls(subcall));
                                        }
                                    }
                                    return addresses;
                                };
                                
                                const calledAddresses = findCalls(trace);
                                console.log('📋 All called addresses in trace:', calledAddresses);
                                
                                // Check each address to see if it's a Smart Wallet
                                for (const addr of calledAddresses) {
                                    if (addr === ownerAddress.toLowerCase()) {
                                        // This might be the Smart Wallet if the owner's address appears as a contract call
                                        // But first check if it has contract code
                                        const code = await ownerWallet.provider!.getCode(addr);
                                        if (code && code !== '0x') {
                                            console.log('📋 Found contract at owner address - this must be the Smart Wallet!');
                                            smartWalletAddress = ethers.getAddress(addr);
                                            break;
                                        } else {
                                            console.log('⚠️ Owner address has no contract code, it\'s an EOA');
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('⚠️ debug_traceTransaction not supported on this node:', e);
                        }
                    }
                } catch (e) {
                    console.error('❌ Failed to find Smart Wallet address:', e);
                }
                }
                
                for (const log of receipt.logs) {
                    console.log('📋 Log:', {
                        address: log.address,
                        topics: log.topics,
                        data: log.data
                    });
                    
                    try {
                        // Deployed event signature: Deployed(address,uint256)
                        const deployedTopic = ethers.id('Deployed(address,uint256)');
                        
                        if (log.topics[0] === deployedTopic) {
                            // First indexed parameter (address) is in topics[1]
                            smartWalletAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
                            console.log('✅ Smart Wallet address from Deployed event:', smartWalletAddress);
                            break;
                        }
                    } catch (e) {
                        // Skip logs that don't match
                        console.log('⚠️ Could not parse log:', e);
                        continue;
                    }
                }
            }

            if (!smartWalletAddress) {
                console.error('❌ Could not extract Smart Wallet address from transaction receipt');
                console.error('Receipt logs:', receipt.logs);
                throw new RifRelayHttpClientError(
                    'Could not extract Smart Wallet address from deployment transaction',
                    'SMART_WALLET_ADDRESS_NOT_FOUND'
                );
            }

            console.log('✅ Smart Wallet deployed successfully:', smartWalletAddress);

            return smartWalletAddress;
        } catch (error) {
            console.error('❌ Failed to deploy Smart Wallet:', error);

            if (error instanceof RifRelayHttpClientError) {
                throw error;
            }

            throw new RifRelayHttpClientError(
                'Smart Wallet deployment failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'DEPLOYMENT_FAILED',
                error
            );
        }
    }

    /**
     * Sign deploy request using EIP-712 _signTypedData
     * 
     * CRITICAL: Based on @rsksmart/rif-relay-client implementation:
     * - Uses wallet._signTypedData() NOT signMessage()
     * - Domain verifyingContract is callForwarder (Factory), NOT callVerifier!
     * - This matches how the RIF Relay server verifies the signature
     */
    private async signDeployRequest(
        deployRequest: any,
        chainId: number,
        wallet: Wallet
    ): Promise<string> {
        // EIP-712 Domain - CRITICAL: verifyingContract is callForwarder (Factory)!
        const domain = {
            name: 'RSK Enveloping Transaction',
            version: '2',
            chainId: chainId,
            verifyingContract: deployRequest.relayData.callForwarder  // Factory address!
        };

        // EIP-712 Types (from @rsksmart/rif-relay-client/dist/typedRequestData.utils.js)
        const types = {
            RelayRequest: [
                { name: 'relayHub', type: 'address' },
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'tokenContract', type: 'address' },
                { name: 'recoverer', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'tokenAmount', type: 'uint256' },
                { name: 'tokenGas', type: 'uint256' },
                { name: 'validUntilTime', type: 'uint256' },
                { name: 'index', type: 'uint256' },
                { name: 'data', type: 'bytes' },
                { name: 'relayData', type: 'RelayData' }
            ],
            RelayData: [
                { name: 'gasPrice', type: 'uint256' },
                { name: 'feesReceiver', type: 'address' },
                { name: 'callForwarder', type: 'address' },
                { name: 'callVerifier', type: 'address' }
            ]
        };

        // Value to sign (all request fields + nested relayData)
        const value = {
            ...deployRequest.request,
            relayData: deployRequest.relayData
        };

        // Sign using wallet._signTypedData (EIP-712)
        return await wallet.signTypedData(domain, types, value);
    }

    /**
     * Estimate relay transaction fees
     */
    async estimateRelayFees(txParams: RelayTransactionParams): Promise<bigint> {
        try {
            const metadata = await this.getRelayMetadata();
            const gasLimit = BigInt(txParams.gas || '200000');
            const gasPrice = BigInt(metadata.minGasPrice);
            return gasLimit * gasPrice;
        } catch (error) {
            console.error('❌ Failed to estimate relay fees:', error);
            // Return a safe default estimate
            return BigInt('200000') * BigInt('60000000'); // ~0.012 RBTC
        }
    }

    /**
     * Reset cached metadata (for testing or error recovery)
     */
    reset(): void {
        this.relayMetadata = null;
        console.log('🔄 RIF Relay HTTP client reset');
    }
}

// Export singleton instance
export const rifRelayHttpClient = new RifRelayHttpClient();

