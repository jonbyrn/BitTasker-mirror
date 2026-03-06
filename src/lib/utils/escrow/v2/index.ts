/**
 * Escrow V2 Module Exports
 *
 * Implements the V2 SecurePaymentContract, which adds:
 *  - No-show flow (markNoShow / markWorkInProgress / claimNoShowRefund)
 *  - Upfront deposit claim (claimUpfrontDeposit)
 *  - Extended state machine (WorkInProgress, NoShow, Refunded, FundsClaimed, InDisputeWIP)
 *  - StateTransition events (uint32 IDs, improved packing)
 */

import { escrow as escrowModule } from './escrow';
import { acceptBidAndCreateEscrow, calculateBidEscrowDetails } from './escrowBid';
import {
	publishContractEvent,
	publishContractStatus,
	getContracts,
	deleteContract,
	handleStatusEvent,
	handleContractEvent
} from './nostrContract';
import {
	publishEscrowStatus,
	registerPendingContractByTxHash,
	cleanupPendingContractByTxHash,
	contractCreationStore
} from './escrowEvents';

export { EscrowStatus } from './escrow.enum';

export { default as abi } from './abi.json';

export const escrow = escrowModule;

export const escrowBid = {
	acceptBidAndCreateEscrow,
	calculateBidEscrowDetails
};

export const nostrContract = {
	publishContractEvent,
	publishContractStatus,
	getContracts,
	deleteContract,
	handleStatusEvent,
	handleContractEvent
};

export const escrowEvents = {
	publishEscrowStatus,
	registerPendingContractByTxHash,
	cleanupPendingContractByTxHash,
	contractCreationStore
};
