import type { ContractTransactionResult, DisputeProposal, EscrowData, GasEstimation } from "$lib/types/wallet";
import type { Attachment } from '$lib/types/task';
import { getProvider, getWallet, rskAddress, walletStore } from "$lib/stores/wallet.store";
import { t } from "svelte-i18n";
import { get } from "svelte/store";
import { derived } from 'svelte/store';
import { appStore } from "$lib/stores/app.store";
import { ethers } from 'ethers';
import { EscrowStatus } from "$lib/utils/enums/wallet.enum";
import { FEE_TIERS, type FeeTier, type RSKNetwork } from "$lib/utils/wallet/networkConfig";
import escrowABI from '$lib/utils/constants/escrowABI.json';
import { updateCompletionStatus, clearCompletionAttempt } from '$lib/stores/completionCache.store';

let contract: ethers.Contract | null = null;

const getRSKWallet = () => getWallet('rsk');
const getRSKProvider = () => getProvider('rsk');

/**
 * Simple initialization check for escrow operations
 * Ensures wallet, contract, provider are ready and wallet has balance
 */
export async function ensureEscrowReady(): Promise<{
    contract: ethers.Contract;
    wallet: ethers.Wallet;
    provider: ethers.JsonRpcProvider;
}> {
    // Check and initialize wallet if needed
    let wallet = getRSKWallet();
    if (!wallet) {
        const { walletManager } = await import('$lib/stores/wallet.store');
        await walletManager.initializeRSKWallet();
        wallet = getRSKWallet();
        if (!wallet) {
            throw new Error('Failed to initialize wallet');
        }
    }

    // Check and get provider if needed
    let provider = getRSKProvider();
    if (!provider) {
        const { walletManager } = await import('$lib/stores/wallet.store');
        await walletManager.initializeRSKWallet();
        provider = getRSKProvider();
        if (!provider) {
            throw new Error('Failed to get provider');
        }
    }

    // Check and connect contract if needed
    if (!contract) {
        await connectToEscrowContract();
        if (!contract) {
            throw new Error('Failed to connect to contract');
        }
    }

    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    if (balance === 0n) {
        throw new Error('Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.');
    }

    return { contract, wallet, provider };
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
        const contractAddress = network === 'mainnet'
            ? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
            : import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;
        
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

        // Update the unified wallet store with contract connection info
        walletStore.update(state => ({
            ...state,
            rsk: {
                ...state.rsk,
                contractAddress: contractConfig.address,
                contractConnected: true
            }
        }));

        // Skip event listeners on RSK due to eth_getLogs compatibility issues
        // Event handling is now done directly in transaction receipts
        // TODO: Setup event listeners

        // Validate contract deployment before loading escrows
        try {
            // Test if contract is deployed by checking if it has code
            const code = await provider.getCode(checksummedAddress);
            if (code === '0x') {
                throw new Error(`No contract deployed at address ${checksummedAddress}`);
            }

            // Test if contract has the expected interface
            await contract.nextEscrowId();

            // Load existing escrows for the user
            await loadUserEscrows();
        } catch (error) {
            console.warn('Contract validation failed, skipping escrow loading:', error);
            // Don't throw here - allow connection to succeed even if contract validation fails
            // This allows the UI to show but with a warning
        }
    } catch (error) {
        throw new Error(`Failed to connect to contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Load escrow details from contract
async function loadEscrowDetails(escrowId: string): Promise<EscrowData | null> {
    if (!contract) {
        await ensureEscrowReady();
        if (!contract) return null;
    }

    try {
        const escrowData = await contract.getEscrow(escrowId);

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
            client: escrowData.client.toLowerCase(), // Ensure consistent address format
            freelancer: escrowData.freelancer.toLowerCase(), // Ensure consistent address format
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
        console.error('Failed to load escrow details:', error);
        return null;
    }
}

// Load dispute proposal details
async function getDisputeProposal(escrowId: string): Promise<DisputeProposal | null> {
    if (!contract) {
        await ensureEscrowReady();
        if (!contract) return null;
    }

    try {
        const proposalData = await contract.getDisputeProposal(escrowId);

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

// Load all user escrows
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
            // Set escrows to empty array and return
            walletStore.update(state => ({
                ...state,
                rsk: {
                    ...state.rsk,
                    escrows: []
                }
            }));
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

        walletStore.update(state => ({
            ...state,
            rsk: {
                ...state.rsk,
                escrows: escrows.sort((a, b) => b.createdAt - a.createdAt)
            }
        }));

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

        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        // Fetch current gas price in real-time (RSK uses legacy gasPrice)
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);

        // Estimate gas with the same gas price that will be used in the transaction
        const gasEstimate = await contract.createEscrow.estimateGas(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment, gasPrice: gasPrice }
        );

        const tx = await contract.createEscrow(
            freelancerAddress,
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
        console.log({result})

        // Handle confirmation asynchronously and create Nostr contract directly
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            console.log({receipt})
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Escrow transaction confirmed, extracting escrow ID...', receipt);

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

                            // Handle escrow created event through our event management system
                            const { handleEscrowCreated } = await import('$lib/utils/wallet/escrowEvents');
                            await handleEscrowCreated({
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

// Complete task
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.task_completing_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task completion transaction confirmed:', receipt);

                // Handle task completed event through our event management system
                if (contractEventId) {
                    const { handleTaskCompleted } = await import('$lib/utils/wallet/escrowEvents');
                    await handleTaskCompleted({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId,
                        completionAttachments
                    });
                }
            } else {
                result.status = 'failed';
                console.error('Task completion transaction receipt is null');
                
                // Clear cache on failure to allow retry
                clearCompletionAttempt(escrowId);
                
                appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
            }
        }).catch((error: unknown) => {
            console.error('Task completion transaction failed:', error);
            result.status = 'failed';
            
            // Clear cache on failure to allow retry
            clearCompletionAttempt(escrowId);
            
            // Update cache status to failed
            updateCompletionStatus(escrowId, 'failed');
            
            appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
        });

        return result;

    } catch (error) {
        // Handle immediate errors (before transaction is sent)
        console.error('Error completing task:', error);
        
        // Clear cache on error to allow retry
        clearCompletionAttempt(escrowId);
        
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.task_accepting_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task acceptance transaction confirmed:', receipt);

                // Handle task accepted event through our event management system
                if (contractEventId) {
                    const { handleTaskAccepted } = await import('$lib/utils/wallet/escrowEvents');
                    await handleTaskAccepted({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.escrow_cancelling_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Escrow cancellation transaction confirmed:', receipt);

                // Handle escrow cancelled event through our event management system
                if (contractEventId) {
                    const { handleEscrowCancelled } = await import('$lib/utils/wallet/escrowEvents');
                    await handleEscrowCancelled({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.dispute_raising_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Task dispute transaction confirmed:', receipt);

                // Handle task disputed event through our event management system
                if (contractEventId) {
                    const { handleTaskDisputed } = await import('$lib/utils/wallet/escrowEvents');
                    await handleTaskDisputed({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.resolution_proposing_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Resolution proposal transaction confirmed:', receipt);

                // Handle resolution proposed event through our event management system
                if (contractEventId && proposedClientAmount && proposedFreelancerAmount) {
                    const { handleResolutionProposed } = await import('$lib/utils/wallet/escrowEvents');
                    await handleResolutionProposed({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId,
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.proposal_accepting_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Proposal acceptance transaction confirmed:', receipt);

                // Handle proposal accepted event through our event management system
                if (contractEventId) {
                    const { handleProposalAccepted } = await import('$lib/utils/wallet/escrowEvents');
                    await handleProposalAccepted({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId
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
async function resolveAfterTimelock(escrowId: string, contractEventId?: string): Promise<ContractTransactionResult> {
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

        appStore.showInfoToast(get(t)('dashboard.contracts.actions.timelock_resolving_message'));

        // Handle confirmation asynchronously using the same pattern as createEscrow
        tx.wait().then(async (receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
                console.log('Timelock resolution transaction confirmed:', receipt);

                // Handle timelock resolved event through our event management system
                if (contractEventId) {
                    const { handleTimelockResolved } = await import('$lib/utils/wallet/escrowEvents');
                    await handleTimelockResolved({
                        escrowId,
                        transactionHash: receipt.hash,
                        contractEventId
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

// Estimate gas for escrow creation
async function estimateEscrowCreationGas(
    freelancerAddress: string,
    baseAmount: string,
    estimatedStartTime: number,
    estimatedCompletionTime: number,
    clientFeeTier: FeeTier,
    freelancerFeeTier: FeeTier
): Promise<GasEstimation> {
    try {
        const { contract, provider } = await ensureEscrowReady();

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

// Estimate gas for contract function
async function estimateContractGas(functionName: string, escrowId: string, ...args: any[]): Promise<GasEstimation> {
    try {
        const { contract, provider } = await ensureEscrowReady();

        const contractFunction = contract[functionName];
        if (!contractFunction) {
            throw new Error(`Function ${functionName} not found`);
        }

        const gasLimit = await contractFunction.estimateGas(escrowId, ...args);
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
	error?: EscrowError;
}> {
	const { createEscrowError, isEscrowNotFoundError, EscrowError, EscrowErrorCode } = await import('$lib/utils/errors/escrowErrors');
	
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
		return { wasFunded: false, escrowData: null, error: escrowError };
	}
}

export const escrow = {
    connectToEscrowContract,
    ensureEscrowReady,
    createEscrow,
    completeTask,
    acceptTask,
    cancelEscrow,
    disputeTask,
    proposeResolution,
    acceptProposal,
    resolveAfterTimelock,
    estimateEscrowCreationGas,
    estimateContractGas,
    getEscrow: loadEscrowDetails,
    getDisputeProposal,
    refreshEscrows: loadUserEscrows,
    loadUserEscrows,
    isContractPaused,
    checkEscrowFundingStatus
}

// Enhanced derived stores for escrow data
export const rskActiveEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow =>
        escrow.status === EscrowStatus.Funded ||
        escrow.status === EscrowStatus.Completed ||
        escrow.status === EscrowStatus.InDispute
    )
);

export const rskClientEscrows = derived([walletStore, rskAddress], ([$store, $address]) =>
    ($store.rsk.escrows || []).filter(escrow => escrow.client.toLowerCase() === $address?.toLowerCase())
);

export const rskFreelancerEscrows = derived([walletStore, rskAddress], ([$store, $address]) =>
    ($store.rsk.escrows || []).filter(escrow => escrow.freelancer.toLowerCase() === $address?.toLowerCase())
);

export const rskPendingEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow => escrow.status === EscrowStatus.Funded)
);

export const rskCompletedEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow => escrow.status === EscrowStatus.Completed)
);

export const rskDisputedEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow => escrow.status === EscrowStatus.InDispute)
);

export const rskResolvedEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow =>
        escrow.status === EscrowStatus.DisputeResolved ||
        escrow.status === EscrowStatus.DisputeUnresolved
    )
);

export const rskCancelledEscrows = derived(walletStore, $store =>
    ($store.rsk.escrows || []).filter(escrow => escrow.status === EscrowStatus.Cancelled)
);