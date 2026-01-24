import type { GasEstimation } from '@bittasker/wallet-core';
import type { ContractTransactionResult, DisputeProposal, EscrowData } from "$lib/types/wallet";
import type { Attachment } from '$lib/types/task';
import { getProvider, getWallet } from "$lib/stores/wallet.store";
import { t } from "svelte-i18n";
import { get } from "svelte/store";
import { appStore } from "$lib/stores/app.store";
import { ethers } from 'ethers';
import { EscrowStatus } from "$lib/utils/enums/escrow.enum";
import { FEE_TIERS, type FeeTier, type RSKNetwork } from "$lib/utils/wallet/networkConfig";
// Use ethers.getAddress for EIP-55 checksum address conversion
import escrowABI from '$lib/utils/constants/escrowABI.json';
import * as EscrowNostrEvent from '$lib/utils/wallet/escrowEvents';

let contract: ethers.Contract | null = null;
// Cache for legacy contracts to avoid recreating them
const legacyContracts = new Map<string, ethers.Contract>();

/**
 * Force reset the cached contract (useful when provider is destroyed)
 * Also clears legacy contract cache
 */
function resetCachedContract(): void {
    contract = null;
    legacyContracts.clear(); // Also clear legacy contracts cache
}

const getRSKWallet = () => getWallet('rsk');
const getRSKProvider = () => getProvider('rsk');

/**
 * Simple initialization check for escrow operations
 * Ensures wallet, contract, provider are ready and wallet has balance
 * 
 * @param contractAddress - Optional contract address for legacy contracts
 * @param requireBalance - Whether to check wallet balance (default: true for write operations)
 */
export async function ensureEscrowReady(
    contractAddress?: string,
    requireBalance: boolean = true
): Promise<{
    contract: ethers.Contract;
    wallet: ethers.Wallet;
    provider: ethers.JsonRpcProvider;
}> {
    // Check and initialize wallet if needed
    let wallet = getRSKWallet();
    if (!wallet) {
        const { walletManager } = await import('$lib/stores/wallet.store');
        await walletManager.initialize();
        wallet = getRSKWallet();
        if (!wallet) {
            throw new Error('Failed to initialize wallet');
        }
    }

    // Check and get provider if needed
    let provider = getRSKProvider();
    if (!provider) {
        const { walletManager } = await import('$lib/stores/wallet.store');
        await walletManager.initialize();
        provider = getRSKProvider();
        if (!provider) {
            throw new Error('Failed to get provider');
        }
    }

    // Determine which contract to use/initialize
    let targetContract: ethers.Contract;

    if (!contractAddress) {
        // No contract address provided - use default contract
        if (!contract) {
            await connectToEscrowContract();
            if (!contract) {
                throw new Error('Failed to connect to contract');
            }
        }
        targetContract = contract;
    } else {
        // Contract address provided - check if it's default or legacy
        const defaultAddress = getDefaultContractAddress();

        if (contractAddress.toLowerCase() === defaultAddress?.toLowerCase()) {
            // Matches default - use default contract
            if (!contract) {
                await connectToEscrowContract();
                if (!contract) {
                    throw new Error('Failed to connect to contract');
                }
            }
            targetContract = contract;
        } else {
            // Legacy contract - check cache or create new instance
            const normalizedAddress = contractAddress.toLowerCase();

            if (legacyContracts.has(normalizedAddress)) {
                // Use cached legacy contract
                targetContract = legacyContracts.get(normalizedAddress)!;
            } else {
                // Create new legacy contract instance
                try {
                    const checksummedAddress = ethers.getAddress(contractAddress);
                    targetContract = new ethers.Contract(checksummedAddress, escrowABI, wallet);

                    // Cache it for future use
                    legacyContracts.set(normalizedAddress, targetContract);
                } catch (error) {
                    throw new Error(`Failed to connect to legacy contract at ${contractAddress}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
    }

    // Check wallet balance (only if required - write operations need balance, read operations don't)
    if (requireBalance) {
        const balance = await provider.getBalance(wallet.address);
        if (balance === 0n) {
            throw new Error('Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.');
        }
    }

    return { contract: targetContract, wallet, provider };
}

// Utility function to calculate fee amount
export function calculateFeeAmount(baseAmount: bigint, feeTier: FeeTier): bigint {
    const feePercentage = BigInt(FEE_TIERS[feeTier].percentage);
    return (baseAmount * feePercentage) / 10000n;
}

// Utility function to calculate total payment (base amount + client fee)
export function calculateTotalPayment(baseAmount: bigint, clientFeeTier: FeeTier): bigint {
    const clientFee = calculateFeeAmount(baseAmount, clientFeeTier);
    return baseAmount + clientFee;
}

// Utility function to calculate freelancer payout (base amount - freelancer fee)
export function calculateFreelancerPayout(baseAmount: bigint, freelancerFeeTier: FeeTier): bigint {
    const freelancerFee = calculateFeeAmount(baseAmount, freelancerFeeTier);
    return baseAmount - freelancerFee;
}

/**
 * Get the default contract address for the current network
 */
function getDefaultContractAddress(): string | undefined {
    const network: RSKNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
    return network === 'mainnet'
        ? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
        : import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;
}

// Connect to escrow contract
async function connectToEscrowContract(): Promise<void> {
    const wallet = getRSKWallet();
    const provider = getRSKProvider();

    if (!wallet || !provider) {
        throw new Error('RSK wallet not initialized. Please connect your wallet first.');
    }

    // Verify wallet has an address and is connected
    if (!wallet.address) {
        throw new Error('Wallet address not available. Please ensure wallet is properly connected.');
    }

    try {
        const network: RSKNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
        const contractAddress = getDefaultContractAddress();

        if (!contractAddress) {
            const envVarName = network === 'mainnet'
                ? 'VITE_RSK_CONTRACT_ADDRESS_MAINNET'
                : 'VITE_RSK_CONTRACT_ADDRESS_TESTNET';
            throw new Error(`Contract address not configured for ${network}. Please set ${envVarName} environment variable.`);
        }

        const contractConfig = {
            address: contractAddress.toLowerCase(),
            abi: escrowABI,
            network
        }

        // Ensure the contract address is properly checksummed
        const checksummedAddress = ethers.getAddress(contractConfig.address);

        contract = new ethers.Contract(checksummedAddress, contractConfig.abi, wallet);

        // Skip event listeners on RSK due to eth_getLogs compatibility issues
        // Event handling is now done directly in transaction receipts
        // TODO: Setup event listeners
    } catch (error) {
        throw new Error(`Failed to connect to contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Load escrow details from contract
async function loadEscrowDetails(escrowId: string, contractAddress?: string): Promise<EscrowData> {
    try {
        // Get the appropriate contract instance (no balance check needed for read operations)
        const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);

        if (!targetContract) throw new Error('Contract not found');

        const escrowData = await targetContract.getEscrow(escrowId);

        // Map contract state enum to our EscrowStatus
        const statusMapping: Record<number, EscrowStatus> = {
            0: EscrowStatus.Funded,
            1: EscrowStatus.InDispute,
            2: EscrowStatus.DisputeResolved,
            3: EscrowStatus.DisputeUnresolved,
            4: EscrowStatus.Completed,
            5: EscrowStatus.Cancelled
        };

        const escrow: EscrowData = {
            id: escrowId,
            client: escrowData.client?.toLowerCase() || '', // Ensure consistent address format
            freelancer: escrowData.freelancer?.toLowerCase() || '', // Ensure consistent address format
            baseAmount: ethers.formatEther(escrowData.amount),
            clientFee: '0', // Will be calculated based on fee tier
            freelancerFee: '0', // Will be calculated based on fee tier  
            totalAmount: ethers.formatEther(escrowData.amount),
            status: statusMapping[escrowData.state] || EscrowStatus.Funded,
            estimatedStartTime: Number(escrowData.estimatedStartTime),
            estimatedCompletionTime: Number(escrowData.estimatedCompletionTime),
            completionTime: 0, // Not stored in contract, would need separate call
            timelockExpiry: Number(escrowData.timelockEnd),
            clientFeeTier: escrowData.clientFeeTier as FeeTier,
            freelancerFeeTier: escrowData.freelancerFeeTier as FeeTier,
            createdAt: Number(escrowData.createdAt) * 1000, // Convert to milliseconds
            lastUpdated: Date.now()
        };

        return escrow;
    } catch (error) {
        throw new Error(`Failed to load escrow details for ID ${escrowId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Load dispute proposal details
async function getDisputeProposal(escrowId: string, contractAddress?: string): Promise<DisputeProposal | null> {
    try {
        // Get the appropriate contract instance (no balance check needed for read operations)
        const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);

        if (!targetContract) throw new Error('Contract not found');

        const proposalData = await targetContract.getDisputeProposal(escrowId);

        // Check if proposal exists (proposer is not zero address)
        if (!proposalData || proposalData.proposer === ethers.ZeroAddress) return null;

        // Validate freelancerAmount is not null/undefined before formatting
        if (proposalData.freelancerAmount == null) return null;

        const proposal: DisputeProposal = {
            escrowId,
            proposer: proposalData.proposer,
            freelancerAmount: ethers.formatEther(proposalData.freelancerAmount),
            timestamp: Number(proposalData.timestamp),
            accepted: proposalData.accepted
        };

        return proposal;
    } catch (error) {
        console.error('Failed to load dispute proposal:', error);
        return null;
    }
}

/**
 * Load all user escrows
 * @deprecated This function is not used
 */
async function loadUserEscrows(): Promise<void> {
    const wallet = getRSKWallet();
    if (!contract || !wallet) return;

    try {
        const userAddress = wallet.address;

        // Check if contract is properly deployed
        let nextEscrowId;
        try {
            nextEscrowId = await contract.nextEscrowId();
        } catch (error) {
            console.error('Failed to get nextEscrowId - contract may not be deployed correctly:', error);
            return;
        }

        const escrows: EscrowData[] = [];

        // Load recent escrows (last 50 to avoid too many calls)
        const startId = Math.max(0, Number(nextEscrowId) - 50);

        for (let i = startId; i < Number(nextEscrowId); i++) {
            try {
                const escrowData = await loadEscrowDetails(i.toString());
                if (escrowData) {
                    // Ensure all addresses are properly formatted for comparison
                    const clientAddr = escrowData.client.toLowerCase();
                    const freelancerAddr = escrowData.freelancer.toLowerCase();
                    const userAddr = userAddress.toLowerCase();

                    if (clientAddr === userAddr || freelancerAddr === userAddr) {
                        escrows.push(escrowData);
                    }
                }
            } catch (error) {
                // Skip failed escrows (might be non-existent IDs)
                console.warn(`Failed to load escrow ${i}:`, error);
                continue;
            }
        }
    } catch (error) {
        throw new Error(`Failed to load user escrows: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Create new escrow
async function createEscrow(
    freelancerAddress: string,
    baseAmount: string,
    estimatedStartTime: number,
    estimatedCompletionTime: number,
    clientFeeTier: FeeTier,
    freelancerFeeTier: FeeTier
): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Convert RSK address (EIP-1191) to Ethereum format (EIP-55) for ethers.js
        // This is necessary because RSK uses EIP-1191 checksums while ethers.js expects EIP-55
        const freelancerAddressEip55 = ethers.getAddress(freelancerAddress);

        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.createEscrow.estimateGas(
            freelancerAddressEip55,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment, gasPrice: gasPrice }
        );

        const tx = await contract.createEscrow(
            freelancerAddressEip55,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            {
                value: totalPayment,
                gasLimit: gasEstimate + (gasEstimate / 10n), // Add 10% buffer
                gasPrice: gasPrice
            }
        );

        // Return immediately with pending status for better UX
        const result: ContractTransactionResult = {
            hash: tx.hash,
            status: 'pending'
        };

        // Handle confirmation asynchronously and create Nostr contract directly
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();

                // Extract escrow ID from the EscrowCreated event in the receipt
                try {
                    if (!contract) {
                        console.error('Contract is null, cannot parse events');
                        return;
                    }

                    const escrowCreatedEvent = receipt.logs.find(log => {
                        try {
                            const parsedLog = contract.interface.parseLog({
                                topics: log.topics,
                                data: log.data
                            });
                            return parsedLog?.name === 'EscrowCreated';
                        } catch {
                            return false;
                        }
                    });

                    if (escrowCreatedEvent) {
                        const parsedLog = contract.interface.parseLog({
                            topics: escrowCreatedEvent.topics,
                            data: escrowCreatedEvent.data
                        });

                        if (parsedLog) {
                            const escrowId = parsedLog.args[0].toString();
                            const client = parsedLog.args[1];
                            const freelancer = parsedLog.args[2];
                            const amount = parsedLog.args[3].toString();

                            result.escrowId = escrowId;

                            await EscrowNostrEvent.handleEscrowCreated({
                                escrowId,
                                transactionHash: receipt.hash,
                                client,
                                freelancer,
                                amount
                            });
                        }
                    } else {
                        console.warn('EscrowCreated event not found in transaction receipt');
                    }
                } catch (error) {
                    console.error('Failed to extract escrow ID from receipt:', error);
                }
            } else {
                result.status = 'failed';
                console.error('Transaction receipt is null');
            }
        }).catch((error: unknown) => {
            console.error('Transaction failed:', error);
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Complete task - Freelancer Only
async function completeTask(escrowId: string, contractEventId?: string, completionAttachments?: Attachment[]): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.completeTask.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.completeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingCompletion,
                completionAttachments
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task completion transaction confirmed:', receipt);

                if (contractEventId) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.Completed,
                        completionAttachments
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Task completion transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
            }
        }).catch((error: unknown) => {
            console.error('Task completion transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
        });

        return result;

    } catch (error) {
        console.error('Error completing task:', error);
        throw new Error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept task
async function acceptTask(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.acceptTask.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.acceptTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingAcceptance
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task acceptance transaction confirmed:', receipt);

                if (contractEventId) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.FundsReleased
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Task acceptance transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.payment_released_error'));
            }
        }).catch((error: unknown) => {
            console.error('Task acceptance transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.payment_released_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Cancel escrow
async function cancelEscrow(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.cancelEscrow.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.cancelEscrow(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingCancellation
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Escrow cancellation transaction confirmed:', receipt);

                if (contractEventId) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.Cancelled
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Escrow cancellation transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.escrow_cancelled_error'));
            }
        }).catch((error: unknown) => {
            console.error('Escrow cancellation transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.escrow_cancelled_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Dispute task
async function disputeTask(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.disputeTask.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.disputeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingDispute
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task dispute transaction confirmed:', receipt);

                if (contractEventId) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.InDispute
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Task dispute transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.dispute_raised_error'));
            }
        }).catch((error: unknown) => {
            console.error('Task dispute transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.dispute_raised_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to dispute task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Propose resolution
async function proposeResolution(
    escrowId: string,
    freelancerAmount: string,
    contractEventId?: string,
    proposedClientAmount?: string,
    proposedFreelancerAmount?: string
): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        const freelancerAmountWei = ethers.parseEther(freelancerAmount);

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.proposeResolution.estimateGas(
            escrowId,
            freelancerAmountWei,
            { gasPrice: gasPrice }
        );

        const tx = await contract.proposeResolution(
            escrowId,
            freelancerAmountWei,
            {
                gasLimit: gasEstimate + (gasEstimate / 10n),
                gasPrice: gasPrice
            }
        );

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId && proposedClientAmount && proposedFreelancerAmount) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingResolutionProposal,
                proposedClientAmount,
                proposedFreelancerAmount
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Resolution proposal transaction confirmed:', receipt);

                if (contractEventId && proposedClientAmount && proposedFreelancerAmount) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.DisputeResolutionProposed,
                        proposedClientAmount,
                        proposedFreelancerAmount
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Resolution proposal transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.resolution_proposed_error'));
            }
        }).catch((error: unknown) => {
            console.error('Resolution proposal transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.resolution_proposed_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to propose resolution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept proposal
async function acceptProposal(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.acceptProposal.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.acceptProposal(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingProposalAcceptance
            });
        }

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Proposal acceptance transaction confirmed:', receipt);

                if (contractEventId) {
                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: EscrowStatus.DisputeResolved
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Proposal acceptance transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.proposal_accepted_error'));
            }
        }).catch((error: unknown) => {
            console.error('Proposal acceptance transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.proposal_accepted_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Resolve after timelock
async function resolveAfterTimelock(escrowId: string, escrowStatus: EscrowStatus, contractEventId?: string): Promise<ContractTransactionResult> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.resolveAfterTimelock.estimateGas(escrowId, {
            gasPrice: gasPrice
        });
        const tx = await contract.resolveAfterTimelock(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n),
            gasPrice: gasPrice
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        // CRITICAL: Publish pending status BEFORE showing toast
        // This prevents double-submissions during ~30s blockchain confirmation
        if (contractEventId) {
            await EscrowNostrEvent.publishEscrowStatus({
                escrowId,
                contractEventId,
                transactionHash: tx.hash,
                status: EscrowStatus.PendingTimelockResolution
            });
        }

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.timelock_resolving_message'));

        // Handle confirmation asynchronously
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Timelock resolution transaction confirmed:', receipt);

                if (contractEventId) {
                    // CRITICAL: Check blockchain state BEFORE transaction to determine correct final status
                    // - From Completed (4): Freelancer gets paid → FundsReleased
                    // - From InDispute (1): Client gets refund → DisputeUnresolved
                    let finalStatus: EscrowStatus;

                    if (escrowStatus === EscrowStatus.Completed) {
                        // Outcome #10: Completion timeout - freelancer gets paid
                        finalStatus = EscrowStatus.FundsReleased;
                    } else if (escrowStatus === EscrowStatus.InDispute) {
                        // Outcome #9: Dispute timeout - client gets refund
                        finalStatus = EscrowStatus.DisputeUnresolved;
                    } else {
                        // Fallback (shouldn't happen, but defensive)
                        console.warn(`Unexpected prior status for timelock resolution: ${escrowStatus}`);
                        finalStatus = EscrowStatus.DisputeUnresolved;
                    }

                    await EscrowNostrEvent.publishEscrowStatus({
                        escrowId,
                        contractEventId,
                        transactionHash: receipt.hash,
                        status: finalStatus
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Timelock resolution transaction receipt is null');
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.timelock_resolved_error'));
            }
        }).catch((error: unknown) => {
            console.error('Timelock resolution transaction failed:', error);
            result.status = 'failed';
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.timelock_resolved_error'));
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to resolve after timelock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Estimate gas for escrow creation
 * @deprecated This function is not used
 */
async function estimateEscrowCreationGas(
    freelancerAddress: string,
    baseAmount: string,
    estimatedStartTime: number,
    estimatedCompletionTime: number,
    clientFeeTier: FeeTier,
    freelancerFeeTier: FeeTier
): Promise<GasEstimation> {
    try {
        // Gas estimation is a read-only operation, doesn't require balance
        const { contract, provider } = await ensureEscrowReady(undefined, false);

        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        const gasLimit = await contract.createEscrow.estimateGas(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment }
        );

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);
        const totalCost = gasLimit * gasPrice;

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.toString(),
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Estimate gas for contract function
 * @test This function is used for debugging only
 */
async function estimateContractGas(functionName: string, escrowId: string, ...args: any[]): Promise<GasEstimation> {
    const GAS_ESTIMATION_TIMEOUT_MS = 30000; // 30 seconds timeout

    try {
        // Gas estimation is a read-only operation, doesn't require balance
        const { contract, provider } = await ensureEscrowReady(undefined, false);

        const contractFunction = contract[functionName];
        if (!contractFunction) {
            throw new Error(`Function ${functionName} not found`);
        }

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Handle proposeResolution specially - convert RBTC string to Wei
        let processedArgs: any[];
        if (functionName === 'proposeResolution' && args.length > 0) {
            // First arg should be freelancerAmount in RBTC (string), convert to Wei
            const freelancerAmountWei = ethers.parseEther(args[0]);
            processedArgs = [freelancerAmountWei];
        } else {
            processedArgs = args;
        }

        // Estimate gas with timeout to prevent hanging
        const gasEstimatePromise = contractFunction.estimateGas(escrowId, ...processedArgs, {
            gasPrice: gasPrice
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Gas estimation timeout after 30 seconds'));
            }, GAS_ESTIMATION_TIMEOUT_MS);
        });

        // Race between gas estimation and timeout
        const gasEstimate = await Promise.race([gasEstimatePromise, timeoutPromise]);

        // Add 10% buffer to match actual transaction behavior
        const gasLimitWithBuffer = gasEstimate + (gasEstimate / 10n);
        const totalCost = gasLimitWithBuffer * gasPrice;

        return {
            gasLimit: gasLimitWithBuffer.toString(),
            gasPrice: gasPrice.toString(),
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

    } catch (error) {
        // Preserve original error structure when wrapping
        // This allows error detection to work properly
        if (error instanceof Error) {
            const wrappedError = new Error(`Gas estimation failed: ${error.message}`);
            // Preserve error code if it exists (ethers.js errors have a code property)
            if ('code' in error && typeof (error as any).code === 'string') {
                (wrappedError as any).code = (error as any).code;
            }
            // Store original error in cause for error detection
            (wrappedError as any).cause = error;
            throw wrappedError;
        }
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Check if contract is paused
async function isContractPaused(): Promise<boolean> {
    try {
        const { contract } = await ensureEscrowReady();
        return await contract.paused();
    } catch (error) {
        console.error('Failed to check contract pause status:', error);
        return true;
    }
}

/**
 * Check if an escrow was ever funded using blockchain validation
 * This is the source of truth - checks the escrow contract directly
 * @param escrowId The escrow ID to check
 * @returns Object with wasFunded flag and escrow data if it exists
 */
async function checkEscrowFundingStatus(escrowId: string): Promise<{
    wasFunded: boolean;
    escrowData: EscrowData | null;
    error?: typeof EscrowError;
}> {
    const { createEscrowError, isEscrowNotFoundError, EscrowError } = await import('$lib/utils/helpers/escrowErrors');

    try {
        const escrowData = await loadEscrowDetails(escrowId);

        if (!escrowData) {
            // Escrow doesn't exist - never funded
            return { wasFunded: false, escrowData: null };
        }

        // If escrow exists, check if it was ever funded
        // Since createEscrow is payable, if escrow exists, it was funded
        // However, for cancelled escrows, we need to check the amount
        // If amount > 0, it was funded; if amount = 0, funding might have failed

        if (escrowData.status === EscrowStatus.Cancelled) {
            // For cancelled escrows, check if amount > 0 (was funded)
            const amount = parseFloat(escrowData.baseAmount);
            if (amount > 0) {
                // Escrow exists with amount > 0 - was funded
                return { wasFunded: true, escrowData };
            } else {
                // Escrow exists but amount = 0 - funding failed
                return { wasFunded: false, escrowData };
            }
        } else {
            // For all other statuses (Funded, InDispute, Completed, etc.), escrow was funded
            // These statuses can only be reached after funding
            return { wasFunded: true, escrowData };
        }
    } catch (error) {
        if (isEscrowNotFoundError(error)) {
            // Escrow doesn't exist - never funded
            return { wasFunded: false, escrowData: null };
        }

        // Other error - return error for caller to handle
        const escrowError = createEscrowError(error, `Failed to check escrow funding status for ${escrowId}`);
        return { wasFunded: false, escrowData: null, error: escrowError as unknown as typeof EscrowError };
    }
}

/**
 * Check if escrow funds were released by checking for internal transactions
 * from the escrow contract to the client or freelancer addresses
 * @param escrowId The escrow ID to check
 * @param escrowData The escrow data containing client and freelancer addresses
 * @param contractAddress Optional contract address for legacy contracts
 * @returns Object with payment information or null if no payment found
 */
async function checkEscrowPayment(
    escrowId: string,
    escrowData: EscrowData,
    contractAddress?: string
): Promise<{
    paidOut: boolean;
    recipient: 'client' | 'freelancer' | null;
    recipientAddress: string | null;
    amount: string | null;
    timestamp: number | null;
} | null> {
    try {
        // Get contract address
        const getDefaultContractAddress = (): string | null => {
            const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
            return network === 'mainnet'
                ? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
                : import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;
        };

        const escrowContractAddress = contractAddress || getDefaultContractAddress();
        if (!escrowContractAddress) {
            console.warn('[escrow] Contract address not configured, cannot check payment');
            return null;
        }

        // Get network configuration
        const { getRSKConfig } = await import('./networkConfig');
        const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
        const rskConfig = getRSKConfig(network);
        const explorerApiUrl = rskConfig.explorerApiUrl;

        // Normalize addresses for comparison
        const contractAddr = escrowContractAddress.toLowerCase();
        const clientAddr = escrowData.client.toLowerCase();
        const freelancerAddr = escrowData.freelancer.toLowerCase();

        // Check internal transactions for both client and freelancer
        const addressesToCheck = [clientAddr, freelancerAddr];
        let paymentFound: {
            recipient: 'client' | 'freelancer';
            recipientAddress: string;
            amount: string;
            timestamp: number;
        } | null = null;

        for (const recipientAddr of addressesToCheck) {
            try {
                // Query internal transactions for the recipient address
                // The API returns transactions where this address is involved (as sender or recipient)
                const response = await fetch(
                    `${explorerApiUrl}/v2/addresses/${recipientAddr}/internal-transactions`,
                    { signal: AbortSignal.timeout(10000) } // 10 second timeout
                );

                if (!response.ok) {
                    console.debug(`[escrow] Failed to fetch internal transactions for ${recipientAddr}:`, response.status);
                    continue;
                }

                const data = await response.json();
                if (!data || !data.items || !Array.isArray(data.items)) {
                    continue;
                }

                // Look for transfers from the escrow contract to this recipient
                for (const tx of data.items) {
                    const txFrom = (tx.from?.hash || tx.from || '').toLowerCase();
                    const txTo = (tx.to?.hash || tx.to || '').toLowerCase();
                    const value = tx.value || '0';

                    // Check if this is a transfer from the escrow contract to the recipient
                    if (txFrom === contractAddr && txTo === recipientAddr && value !== '0') {
                        // Parse value
                        let amountWei: bigint;
                        if (typeof value === 'string' && value.startsWith('0x')) {
                            amountWei = BigInt(value);
                        } else {
                            amountWei = BigInt(value);
                        }

                        if (amountWei > 0n) {
                            // Found a payment - use the most recent one
                            const timestamp = tx.timestamp
                                ? (typeof tx.timestamp === 'string' ? parseInt(tx.timestamp) : tx.timestamp) * 1000
                                : Date.now();

                            // If we already found a payment, keep the most recent one
                            if (!paymentFound || (timestamp > (paymentFound.timestamp || 0))) {
                                paymentFound = {
                                    recipient: recipientAddr === clientAddr ? 'client' : 'freelancer',
                                    recipientAddress: recipientAddr,
                                    amount: ethers.formatEther(amountWei),
                                    timestamp
                                };
                            }
                        }
                    }
                }
            } catch (error) {
                console.debug(`[escrow] Error checking internal transactions for ${recipientAddr}:`, error);
                // Continue checking other addresses
                continue;
            }
        }

        if (paymentFound) {
            return {
                paidOut: true,
                recipient: paymentFound.recipient,
                recipientAddress: paymentFound.recipientAddress,
                amount: paymentFound.amount,
                timestamp: paymentFound.timestamp
            };
        }

        return {
            paidOut: false,
            recipient: null,
            recipientAddress: null,
            amount: null,
            timestamp: null
        };
    } catch (error) {
        console.warn(`[escrow] Failed to check escrow payment for ${escrowId}:`, error);
        return null;
    }
}

export const escrow = {
    ensureEscrowReady,
    createEscrow,
    completeTask,
    acceptTask,
    cancelEscrow,
    disputeTask,
    proposeResolution,
    acceptProposal,
    resolveAfterTimelock,
    estimateContractGas,
    getEscrow: loadEscrowDetails,
    getDisputeProposal,
    isContractPaused,
    checkEscrowFundingStatus,
    checkEscrowPayment,
    resetCachedContract
}
