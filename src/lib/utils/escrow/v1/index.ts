/**
 * Escrow V1 Module Exports
 * 
 * This file exports all V1 escrow modules to make them accessible
 * through the global EscrowManager.
 */

import { escrow as escrowModule } from './escrow';
import { acceptBidAndCreateEscrow, calculateBidEscrowDetails } from './escrowBid';
import { publishContractEvent, publishContractStatus, getContracts, deleteContract } from './nostrContract';
import { publishEscrowStatus } from './escrowEvents';

// Export status enum
export { EscrowStatus } from './escrow.enum';

// Export the escrow operations handler
export const escrow = escrowModule;

// Export the bid handler object
export const escrowBid = {
    acceptBidAndCreateEscrow,
    calculateBidEscrowDetails
};

// Export the nostr contract handler object
export const nostrContract = {
    publishContractEvent,
    publishContractStatus,
    getContracts,
    deleteContract
};

// Export the escrow events handler object
export const escrowEvents = {
    publishEscrowStatus
};