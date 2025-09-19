import type { ContractTransactionResult, DisputeProposal, EscrowData, GasEstimation } from "$lib/types/wallet";
import { rskAddress, rskWalletStore, getRSKWallet, getRSKProvider, getEventListeners } from "$lib/stores/rskWallet.store";
import { derived, get } from 'svelte/store';
import { ethers } from 'ethers';
import { EscrowStatus } from "$lib/utils/enums/wallet.enum";
import { FEE_TIERS, type FeeTier } from "$lib/utils/wallet/escrowContract";
import escrowABI from '$lib/utils/constants/escrowABI.json';

let contract: ethers.Contract | null = null;

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
        const network = get(rskWalletStore).network;
        const contractConfig = {
            address: (import.meta.env.VITE_RSK_CONTRACT_ADDRESS).toLowerCase(),
            abi: escrowABI,
            network
        }

        // Ensure the contract address is properly checksummed
        const contractAddress = ethers.getAddress(contractConfig.address);

        contract = new ethers.Contract(contractAddress, contractConfig.abi, wallet);

        rskWalletStore.update(state => ({
            ...state,
            contractAddress: contractConfig.address,
            contractConnected: true,
            contractConfig
        }));

        // Set up contract event listeners (skip on RSK due to eth_getLogs compatibility issues)
        try {
            setupContractEventListeners();
        } catch (error) {
            console.warn('Failed to set up contract event listeners (this is expected on RSK):', error);
        }

        // Validate contract deployment before loading escrows
        try {
            // Test if contract is deployed by checking if it has code
            const code = await provider.getCode(contractAddress);
            if (code === '0x') {
                throw new Error(`No contract deployed at address ${contractAddress}`);
            }

            // Test if contract has the expected interface
            await contract.nextEscrowId();
            console.log('Contract validation successful');

            // Load existing escrows for the user
            await loadUserEscrows();
        } catch (error) {
            console.warn('Contract validation failed, skipping escrow loading:', error);
            // Don't throw here - allow connection to succeed even if contract validation fails
            // This allows the UI to show but with a warning
        }

        console.log('Successfully connected to escrow contract:', contractConfig.address);

    } catch (error) {
        throw new Error(`Failed to connect to contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Set up contract event listeners
function setupContractEventListeners(): void {
    const wallet = getRSKWallet();
    if (!contract || !wallet) return;

    // Skip event listeners on RSK due to eth_getLogs compatibility issues
    // RSK doesn't support eth_getLogs, so we disable all event listeners
    console.log('Skipping event listeners on RSK network due to eth_getLogs compatibility issues');
    return;

    /* Disabled for RSK compatibility
    const userAddress = wallet.address.toLowerCase();

    // Listen for EscrowCreated events
    const escrowCreatedListener = (escrowId: bigint, client: string, freelancer: string, amount: bigint) => {
        // Only handle events where user is involved
        if (client.toLowerCase() !== userAddress && freelancer.toLowerCase() !== userAddress) return;

        loadEscrowDetails(escrowId.toString()).then(escrowData => {
            if (escrowData) {
                rskWalletStore.update(state => ({
                    ...state,
                    escrows: [escrowData, ...state.escrows.filter(e => e.id !== escrowData.id)]
                }));
            }
        }).catch(console.error);
    };

    // Listen for TaskCompleted events
    const taskCompletedListener = (escrowId: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Completed);
    };

    // Listen for TaskAccepted events
    const taskAcceptedListener = (escrowId: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
    };

    // Listen for TaskDisputed events
    const taskDisputedListener = (escrowId: bigint, disputer: string) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.InDispute);
    };

    // Listen for DisputeProposed events
    const disputeProposedListener = (escrowId: bigint, proposer: string, clientAmount: bigint, freelancerAmount: bigint) => {
        loadDisputeProposal(escrowId.toString()).then(proposal => {
            if (proposal) {
                rskWalletStore.update(state => ({
                    ...state,
                    disputeProposals: [proposal, ...state.disputeProposals.filter(p => p.escrowId !== proposal.escrowId)]
                }));
            }
        }).catch(console.error);
    };

    // Listen for DisputeResolved events
    const disputeResolvedListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
        // Remove dispute proposal
        rskWalletStore.update(state => ({
            ...state,
            disputeProposals: state.disputeProposals.filter(p => p.escrowId !== escrowId.toString())
        }));
    };

    // Listen for EscrowCancelled events
    const escrowCancelledListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Cancelled);
    };

    // Listen for EscrowResolved events
    const escrowResolvedListener = (escrowId: bigint, freelancerAmount: bigint, platformFee: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
    };

    // Set up all event listeners (wrap in try-catch for RSK compatibility)
    try {
        contract.on('EscrowCreated', escrowCreatedListener);
        contract.on('TaskCompleted', taskCompletedListener);
        contract.on('TaskAccepted', taskAcceptedListener);
        contract.on('TaskDisputed', taskDisputedListener);
        contract.on('DisputeProposed', disputeProposedListener);
        contract.on('DisputeResolved', disputeResolvedListener);
        contract.on('EscrowCancelled', escrowCancelledListener);
        contract.on('EscrowResolved', escrowResolvedListener);
        
        console.log('Contract event listeners set up successfully');
    } catch (error) {
        console.warn('Failed to set up some contract event listeners (this may be normal on RSK):', error);
    }

    // Store cleanup functions
    const eventListeners = getEventListeners();
    eventListeners.push(() => {
        if (contract) {
            try {
                contract.off('EscrowCreated', escrowCreatedListener);
                contract.off('TaskCompleted', taskCompletedListener);
                contract.off('TaskAccepted', taskAcceptedListener);
                contract.off('TaskDisputed', taskDisputedListener);
                contract.off('DisputeProposed', disputeProposedListener);
                contract.off('DisputeResolved', disputeResolvedListener);
                contract.off('EscrowCancelled', escrowCancelledListener);
                contract.off('EscrowResolved', escrowResolvedListener);
            } catch (error) {
                console.warn('Error cleaning up event listeners:', error);
            }
        }
    });
    */
}

// Helper function to update escrow status
function updateEscrowStatus(escrowId: string, status: EscrowStatus): void {
    rskWalletStore.update(state => ({
        ...state,
        escrows: state.escrows.map(escrow =>
            escrow.id === escrowId
                ? { ...escrow, status, lastUpdated: Date.now() }
                : escrow
        )
    }));
}

// Load escrow details from contract
async function loadEscrowDetails(escrowId: string): Promise<EscrowData | null> {
    if (!contract) return null;

    try {
        const escrowData = await contract.getEscrow(escrowId);

        // Map contract state enum to our EscrowStatus
        const statusMapping: Record<number, EscrowStatus> = {
            0: EscrowStatus.Funded,
            1: EscrowStatus.Completed,
            2: EscrowStatus.InDispute,
            3: EscrowStatus.Resolved,
            4: EscrowStatus.Cancelled
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

// Helper function to determine fee tier from amounts
function getFeeTierFromAmount(baseAmount: bigint, feeAmount: bigint): FeeTier {
    if (baseAmount === 0n) return 1;

    const percentage = Number((feeAmount * 10000n) / baseAmount);

    if (percentage >= 240 && percentage <= 260) return 1; // 2.5%
    if (percentage >= 190 && percentage <= 210) return 2; // 2.0%
    if (percentage >= 140 && percentage <= 160) return 3; // 1.5%

    return 1; // Default to tier 1
}

// Load dispute proposal details
async function loadDisputeProposal(escrowId: string): Promise<DisputeProposal | null> {
    if (!contract) return null;

    try {
        const proposalData = await contract.getDisputeProposal(escrowId);

        if (proposalData.proposer === ethers.ZeroAddress) return null;

        const proposal: DisputeProposal = {
            escrowId,
            proposer: proposalData.proposer,
            clientAmount: ethers.formatEther(proposalData.clientAmount),
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
            rskWalletStore.update(state => ({
                ...state,
                escrows: []
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

        rskWalletStore.update(state => ({
            ...state,
            escrows: escrows.sort((a, b) => b.createdAt - a.createdAt)
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
    const wallet = getRSKWallet();
    if (!contract || !wallet) {
        throw new Error('Contract not connected');
    }

    try {
        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        // Estimate gas first
        const gasEstimate = await contract.createEscrow.estimateGas(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment }
        );

        const tx = await contract.createEscrow(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            {
                value: totalPayment,
                gasLimit: gasEstimate + (gasEstimate / 10n) // Add 10% buffer
            }
        );

        const result: ContractTransactionResult = {
            hash: tx.hash,
            status: 'pending'
        };

        // Wait for transaction to be mined to get escrow ID
        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                try {
                    // Find EscrowCreated event to get escrow ID
                    const escrowCreatedEvent = receipt.logs.find((log: ethers.Log) => {
                        try {
                            const parsed = contract!.interface.parseLog(log);
                            return parsed?.name === 'EscrowCreated';
                        } catch {
                            return false;
                        }
                    });

                    if (escrowCreatedEvent) {
                        const parsed = contract!.interface.parseLog(escrowCreatedEvent);
                        result.escrowId = parsed?.args[0].toString();
                    }

                    result.status = 'confirmed';
                    result.gasUsed = receipt.gasUsed.toString();

                    // Reload escrows after successful creation
                    loadUserEscrows().catch(console.error);
                } catch (error) {
                    console.warn('Failed to parse transaction receipt:', error);
                    result.status = 'confirmed'; // Still mark as confirmed since tx was mined
                }
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
async function completeTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    const wallet = getRSKWallet();
    if (!wallet) {
        throw new Error('Wallet not available');
    }

    // Check wallet balance
    if (!wallet.provider) {
        throw new Error('Wallet provider not available');
    }

    const balance = await wallet.provider.getBalance(wallet.address);
    if (balance === 0n) {
        throw new Error('Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.');
    }

    try {
        const gasEstimate = await contract.completeTask.estimateGas(escrowId);
        const tx = await contract.completeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept task
async function acceptTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.acceptTask.estimateGas(escrowId);
        const tx = await contract.acceptTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Cancel escrow
async function cancelEscrow(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.cancelEscrow.estimateGas(escrowId);
        const tx = await contract.cancelEscrow(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Dispute task
async function disputeTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.disputeTask.estimateGas(escrowId);
        const tx = await contract.disputeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to dispute task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Propose resolution
async function proposeResolution(
    escrowId: string,
    freelancerAmount: string
): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const freelancerAmountWei = ethers.parseEther(freelancerAmount);

        const gasEstimate = await contract.proposeResolution.estimateGas(
            escrowId,
            freelancerAmountWei
        );

        const tx = await contract.proposeResolution(
            escrowId,
            freelancerAmountWei,
            { gasLimit: gasEstimate + (gasEstimate / 10n) }
        );

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to propose resolution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept proposal
async function acceptProposal(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.acceptProposal.estimateGas(escrowId);
        const tx = await contract.acceptProposal(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Resolve after timelock
async function resolveAfterTimelock(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.resolveAfterTimelock.estimateGas(escrowId);
        const tx = await contract.resolveAfterTimelock(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
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
    const provider = getRSKProvider();
    if (!contract || !provider) {
        throw new Error('Contract not connected');
    }

    try {
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
    const provider = getRSKProvider();
    if (!contract || !provider) {
        throw new Error('Contract not connected');
    }

    try {
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

// Get escrow by ID
async function getEscrow(escrowId: string): Promise<EscrowData | null> {
    return await loadEscrowDetails(escrowId);
}

// Get dispute proposal by escrow ID
async function getDisputeProposal(escrowId: string): Promise<DisputeProposal | null> {
    return await loadDisputeProposal(escrowId);
}

// Refresh escrow data
async function refreshEscrows(): Promise<void> {
    await loadUserEscrows();
}

// Check if contract is paused
async function isContractPaused(): Promise<boolean> {
    if (!contract) return true;

    try {
        return await contract.paused();
    } catch (error) {
        console.error('Failed to check contract pause status:', error);
        return true;
    }
}

export const escrow = {
    connectToEscrowContract,
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
    getEscrow,
    getDisputeProposal,
    refreshEscrows,
    loadUserEscrows,
    isContractPaused
}

// Enhanced derived stores for escrow data
export const rskActiveEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow =>
        escrow.status === EscrowStatus.Funded ||
        escrow.status === EscrowStatus.Completed ||
        escrow.status === EscrowStatus.InDispute
    )
);

export const rskClientEscrows = derived([rskWalletStore, rskAddress], ([$store, $address]) =>
    $store.escrows.filter(escrow => escrow.client.toLowerCase() === $address?.toLowerCase())
);

export const rskFreelancerEscrows = derived([rskWalletStore, rskAddress], ([$store, $address]) =>
    $store.escrows.filter(escrow => escrow.freelancer.toLowerCase() === $address?.toLowerCase())
);

export const rskPendingEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Funded)
);

export const rskCompletedEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Completed)
);

export const rskDisputedEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.InDispute)
);

export const rskResolvedEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Resolved)
);

export const rskCancelledEscrows = derived(rskWalletStore, $store =>
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Cancelled)
);