/**
 * Escrow V2 Module
 * SecurePaymentContract (V2) — gasless-first, no pending Nostr.
 */

import { escrow as escrowModule } from './escrow';
import * as escrowBidModule from './escrowBid';
import * as nostrContractModule from './nostrContract';
import * as escrowEventsModule from './escrowEvents';

export {
	EscrowStatus,
	isBlockchainState,
	isFinalState,
	mapBlockchainStateToEnum
} from './escrow.enum';
export {
	getRelayBaseUrl,
	getV2ContractAddressByChainId,
	CHAIN_ID_TESTNET,
	CHAIN_ID_MAINNET
} from './config';
export { default as abi } from './abi.json';

export const escrow = escrowModule;

export const escrowBid = {
	acceptBidAndCreateEscrow: escrowBidModule.acceptBidAndCreateEscrow,
	calculateBidEscrowDetails: escrowBidModule.calculateBidEscrowDetails,
	validateEscrowDetails: escrowBidModule.validateEscrowDetails,
	validateSufficientBalance: escrowBidModule.validateSufficientBalance,
	getFeePercentageDisplay: escrowBidModule.getFeePercentageDisplay,
	formatRBTCAmount: escrowBidModule.formatRBTCAmount
};

export const nostrContract = {
	publishContractEvent: nostrContractModule.publishContractEvent,
	publishContractStatus: nostrContractModule.publishContractStatus,
	getContracts: nostrContractModule.getContracts,
	deleteContract: nostrContractModule.deleteContract,
	handleStatusEvent: nostrContractModule.handleStatusEvent,
	handleContractEvent: nostrContractModule.handleContractEvent
};

export const escrowEvents = {
	publishEscrowStatus: escrowEventsModule.publishEscrowStatus,
	registerPendingContractByTxHash: escrowEventsModule.registerPendingContractByTxHash,
	cleanupPendingContractByTxHash: escrowEventsModule.cleanupPendingContractByTxHash,
	contractCreationStore: escrowEventsModule.contractCreationStore
};
