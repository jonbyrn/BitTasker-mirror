// Example usage of RSK Escrow Contract Integration
// This file demonstrates how to use the escrow contract functions

import { rskWallet } from '$lib/stores/rskWallet.store';
import { get } from 'svelte/store';
import { 
    rskEscrows, 
    rskActiveEscrows, 
    rskClientEscrows, 
    rskFreelancerEscrows,
    rskContractConnected 
} from '$lib/stores/rskWallet.store';
import { EscrowStatus, type FeeTier } from '$lib/contracts/SimplifiedEscrowContract';

/**
 * Example: Initialize RSK Wallet and Connect to Escrow Contract
 */
export async function initializeWalletExample() {
    try {
        // Initialize the RSK wallet
        await rskWallet.initialize();
        console.log('✅ RSK Wallet initialized');

        // Connect to the escrow contract
        await rskWallet.connectToEscrowContract();
        console.log('✅ Escrow contract connected');

        // Check connection status
        const isConnected = get(rskContractConnected);
        console.log('Contract connected:', isConnected);

    } catch (error) {
        console.error('❌ Failed to initialize wallet:', error);
        throw error;
    }
}

/**
 * Example: Create a new escrow
 */
export async function createEscrowExample() {
    try {
        const freelancerAddress = '0x742d35Cc6C4C4A6b1E3E4C8d5A8B9F3D2E1C0A9B';
        const baseAmount = '1.0'; // 1 RBTC
        const startTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const completionTime = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
        const clientFeeTier: FeeTier = 1; // 2.5% fee
        const freelancerFeeTier: FeeTier = 1; // 2.5% fee

        // Estimate gas first
        const gasEstimate = await rskWallet.estimateEscrowCreationGas(
            freelancerAddress,
            baseAmount,
            startTime,
            completionTime,
            clientFeeTier,
            freelancerFeeTier
        );

        console.log('Gas estimate:', gasEstimate);
        console.log('Total cost:', gasEstimate.totalCostFormatted, 'RBTC');

        // Create the escrow
        const result = await rskWallet.createEscrow(
            freelancerAddress,
            baseAmount,
            startTime,
            completionTime,
            clientFeeTier,
            freelancerFeeTier
        );

        console.log('✅ Escrow created:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to create escrow:', error);
        throw error;
    }
}

/**
 * Example: Complete a task
 */
export async function completeTaskExample(escrowId: string) {
    try {
        // Estimate gas first
        const gasEstimate = await rskWallet.estimateContractGas('completeTask', escrowId);
        console.log('Complete task gas estimate:', gasEstimate);

        // Complete the task
        const result = await rskWallet.completeTask(escrowId);
        console.log('✅ Task completed:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to complete task:', error);
        throw error;
    }
}

/**
 * Example: Accept a completed task
 */
export async function acceptTaskExample(escrowId: string) {
    try {
        // Get escrow details first
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) {
            throw new Error('Escrow not found');
        }

        if (escrow.status !== EscrowStatus.Completed) {
            throw new Error('Task must be completed before acceptance');
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('acceptTask', escrowId);
        console.log('Accept task gas estimate:', gasEstimate);

        // Accept the task
        const result = await rskWallet.acceptTask(escrowId);
        console.log('✅ Task accepted:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to accept task:', error);
        throw error;
    }
}

/**
 * Example: Cancel an escrow
 */
export async function cancelEscrowExample(escrowId: string) {
    try {
        // Get escrow details first
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) {
            throw new Error('Escrow not found');
        }

        if (escrow.status !== EscrowStatus.Funded) {
            throw new Error('Only funded escrows can be cancelled');
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('cancelEscrow', escrowId);
        console.log('Cancel escrow gas estimate:', gasEstimate);

        // Cancel the escrow
        const result = await rskWallet.cancelEscrow(escrowId);
        console.log('✅ Escrow cancelled:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to cancel escrow:', error);
        throw error;
    }
}

/**
 * Example: Dispute a task
 */
export async function disputeTaskExample(escrowId: string) {
    try {
        // Get escrow details first
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) {
            throw new Error('Escrow not found');
        }

        if (escrow.status !== EscrowStatus.Completed) {
            throw new Error('Task must be completed before disputing');
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('disputeTask', escrowId);
        console.log('Dispute task gas estimate:', gasEstimate);

        // Dispute the task
        const result = await rskWallet.disputeTask(escrowId);
        console.log('✅ Task disputed:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to dispute task:', error);
        throw error;
    }
}

/**
 * Example: Propose resolution for a dispute
 */
export async function proposeResolutionExample(escrowId: string, clientAmount: string, freelancerAmount: string) {
    try {
        // Get escrow details first
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) {
            throw new Error('Escrow not found');
        }

        if (escrow.status !== EscrowStatus.InDispute) {
            throw new Error('Escrow must be in dispute to propose resolution');
        }

        // Validate amounts sum to base amount
        const totalProposed = parseFloat(clientAmount) + parseFloat(freelancerAmount);
        const baseAmount = parseFloat(escrow.baseAmount);
        
        if (Math.abs(totalProposed - baseAmount) > 0.0001) {
            throw new Error(`Proposed amounts (${totalProposed}) must sum to base amount (${baseAmount})`);
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('proposeResolution', escrowId, clientAmount, freelancerAmount);
        console.log('Propose resolution gas estimate:', gasEstimate);

        // Propose resolution
        const result = await rskWallet.proposeResolution(escrowId, clientAmount, freelancerAmount);
        console.log('✅ Resolution proposed:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to propose resolution:', error);
        throw error;
    }
}

/**
 * Example: Accept a dispute proposal
 */
export async function acceptProposalExample(escrowId: string) {
    try {
        // Get dispute proposal first
        const proposal = await rskWallet.getDisputeProposal(escrowId);
        if (!proposal) {
            throw new Error('No dispute proposal found');
        }

        if (proposal.accepted) {
            throw new Error('Proposal already accepted');
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('acceptProposal', escrowId);
        console.log('Accept proposal gas estimate:', gasEstimate);

        // Accept proposal
        const result = await rskWallet.acceptProposal(escrowId);
        console.log('✅ Proposal accepted:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to accept proposal:', error);
        throw error;
    }
}

/**
 * Example: Resolve escrow after timelock expiration
 */
export async function resolveAfterTimelockExample(escrowId: string) {
    try {
        // Get escrow details first
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) {
            throw new Error('Escrow not found');
        }

        const now = Math.floor(Date.now() / 1000);
        if (escrow.timelockExpiry > now) {
            const timeLeft = escrow.timelockExpiry - now;
            throw new Error(`Timelock not expired. ${Math.ceil(timeLeft / 3600)} hours remaining`);
        }

        // Estimate gas
        const gasEstimate = await rskWallet.estimateContractGas('resolveAfterTimelock', escrowId);
        console.log('Resolve after timelock gas estimate:', gasEstimate);

        // Resolve after timelock
        const result = await rskWallet.resolveAfterTimelock(escrowId);
        console.log('✅ Escrow resolved after timelock:', result);
        return result;

    } catch (error) {
        console.error('❌ Failed to resolve after timelock:', error);
        throw error;
    }
}

/**
 * Example: Monitor escrow data using stores
 */
export function monitorEscrowsExample() {
    // Subscribe to all escrows
    const unsubscribeAll = rskEscrows.subscribe(escrows => {
        console.log('All escrows:', escrows.length);
    });

    // Subscribe to active escrows only
    const unsubscribeActive = rskActiveEscrows.subscribe(escrows => {
        console.log('Active escrows:', escrows.length);
        escrows.forEach(escrow => {
            console.log(`- Escrow ${escrow.id}: ${EscrowStatus[escrow.status]} (${escrow.baseAmount} RBTC)`);
        });
    });

    // Subscribe to client escrows
    const unsubscribeClient = rskClientEscrows.subscribe(escrows => {
        console.log('Client escrows:', escrows.length);
    });

    // Subscribe to freelancer escrows
    const unsubscribeFreelancer = rskFreelancerEscrows.subscribe(escrows => {
        console.log('Freelancer escrows:', escrows.length);
    });

    // Return cleanup function
    return () => {
        unsubscribeAll();
        unsubscribeActive();
        unsubscribeClient();
        unsubscribeFreelancer();
    };
}

/**
 * Example: Complete escrow workflow
 */
export async function completeEscrowWorkflowExample() {
    try {
        console.log('🚀 Starting complete escrow workflow example...');

        // 1. Initialize wallet and connect to contract
        await initializeWalletExample();

        // 2. Create escrow
        const createResult = await createEscrowExample();
        const escrowId = createResult.escrowId!;

        console.log('⏳ Waiting for escrow creation to be confirmed...');
        // In real app, you would wait for the transaction to be confirmed
        // and the escrow ID to be available

        // 3. Complete task (as freelancer)
        console.log('📋 Completing task...');
        await completeTaskExample(escrowId);

        // 4. Accept task (as client)
        console.log('✅ Accepting task...');
        await acceptTaskExample(escrowId);

        console.log('🎉 Complete escrow workflow finished successfully!');

    } catch (error) {
        console.error('❌ Escrow workflow failed:', error);
        throw error;
    }
}

/**
 * Example: Dispute workflow
 */
export async function disputeWorkflowExample(escrowId: string) {
    try {
        console.log('⚖️ Starting dispute workflow example...');

        // 1. Dispute the task
        await disputeTaskExample(escrowId);

        // 2. Propose resolution (50/50 split)
        const escrow = await rskWallet.getEscrow(escrowId);
        if (!escrow) throw new Error('Escrow not found');

        const baseAmount = parseFloat(escrow.baseAmount);
        const clientAmount = (baseAmount * 0.5).toString();
        const freelancerAmount = (baseAmount * 0.5).toString();

        await proposeResolutionExample(escrowId, clientAmount, freelancerAmount);

        // 3. Accept proposal
        await acceptProposalExample(escrowId);

        console.log('⚖️ Dispute workflow completed successfully!');

    } catch (error) {
        console.error('❌ Dispute workflow failed:', error);
        throw error;
    }
}

/**
 * Example: Refresh and check escrow data
 */
export async function refreshEscrowDataExample() {
    try {
        console.log('🔄 Refreshing escrow data...');

        // Refresh all escrows
        await rskWallet.refreshEscrows();

        // Get current escrows
        const allEscrows = get(rskEscrows);
        const activeEscrows = get(rskActiveEscrows);

        console.log(`📊 Total escrows: ${allEscrows.length}`);
        console.log(`🔥 Active escrows: ${activeEscrows.length}`);

        // Check contract status
        const isPaused = await rskWallet.isContractPaused();
        console.log(`🔒 Contract paused: ${isPaused}`);

        return {
            totalEscrows: allEscrows.length,
            activeEscrows: activeEscrows.length,
            isPaused
        };

    } catch (error) {
        console.error('❌ Failed to refresh escrow data:', error);
        throw error;
    }
}
