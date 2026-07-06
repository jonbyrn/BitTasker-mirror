/**
 * Swap Chain — Barrel Re-exports
 *
 * Re-exports all public symbols from the swap-chain sub-modules.
 * External consumers should import from `$lib/services/swap-chain` or
 * from `$lib/services/swap-chain.service` (backward compatibility).
 */

// State machine (types, transitions, persistence, progress)
export {
	type SwapChainPhase,
	type TerminalSwapChainPhase,
	type SwapChainState,
	type SwapProgressStep,
	INITIAL_SWAP_CHAIN_STATE,
	isValidSwapChainTransition,
	isTerminalPhase,
	needsResume,
	getSwapChainStatus,
	loadSwapChainState,
	saveSwapChainState,
	resetSwapChainState,
	transitionTo,
	onSwapProgress,
	getSwapProgressStep,
	setSwapProgress,
	safeAddress,
	boltzAddress,
	sleep
} from './state';

// Claim/refund data persistence
export {
	type SwapClaimData,
	type SwapRefundData,
	swapClaimData,
	swapRefundData,
	persistClaimData,
	loadPersistedClaimData,
	persistRefundData,
	loadPersistedRefundData,
	saveClaimDataToNostr,
	loadClaimDataFromNostr
} from './persistence';

// Hop execution
export { executeHop, executeConnectedERC20Transfer } from './executors';

// Transaction helpers
export { sendConnectedWalletArbitrumTx, resolveUserAddress } from './tx-helpers';

// Boltz-specific (re-exported from boltz/ sub-modules)
export { executeBoltzHop, pollBoltzChainSwapCompletion } from './boltz';

// Recovery & refund
export {
	type UnclaimedLockup,
	getRefundInfo,
	refundSwapChain,
	recoverRefundDataFromChain,
	scanUnclaimedLockups,
	refundLockupDirect
} from './recovery';

// Orchestrator
export { startSwapChain, resumeSwapChain, getSwapChainState } from './orchestrator';
