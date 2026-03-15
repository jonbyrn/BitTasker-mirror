/**
 * Escrow V1 Module Exports
 * 
 * This file exports all V1 escrow modules to make them accessible
 * through the global EscrowManager.
 */

import { escrow as escrowModule } from './escrow';
import { acceptBidAndCreateEscrow, calculateBidEscrowDetails } from './escrowBid';
import { publishContractEvent, publishContractStatus, getContracts, deleteContract, handleStatusEvent, handleContractEvent } from './nostrContract';
import { publishEscrowStatus, registerPendingContractByTxHash, cleanupPendingContractByTxHash, contractCreationStore } from './escrowEvents';
import { loadEscrowContractAbi, clearAbiCache, getAbiCacheStats } from './loadEscrowAbi';
import { createEscrowOnBsc, validateEscrowCreationParams, AbiNotAvailableError, EscrowCreationError } from './createBscEscrow';
import { decodeBscEscrowEvent, decodeBscEscrowEvents, filterEscrowEventsByType, filterEscrowEventsByEscrowId } from './decodeEscrowEvents';

// Export status enum
export { EscrowStatus } from './escrow.enum';

// Export escrow types
export type { BscEscrowCreationParams, BscEscrowEvent, AbiLoadResult, BscEscrowEventType } from '$lib/types/escrow';

// Export ABI for external use (e.g., functionParsing.ts)
export { default as abi } from './abi.json';

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
    deleteContract,
    handleStatusEvent,
    handleContractEvent
};

// Export the escrow events handler object
export const escrowEvents = {
    publishEscrowStatus,
    registerPendingContractByTxHash,
    cleanupPendingContractByTxHash,
    contractCreationStore
};

// Export BSC escrow operations
export const bscEscrow = {
    loadEscrowContractAbi,
    createEscrowOnBsc,
    decodeBscEscrowEvent,
    decodeBscEscrowEvents,
    filterEscrowEventsByType,
    filterEscrowEventsByEscrowId,
    validateEscrowCreationParams,
    clearAbiCache,
    getAbiCacheStats,
    AbiNotAvailableError,
    EscrowCreationError
};