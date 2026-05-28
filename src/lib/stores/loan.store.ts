/**
 * Loan Store — Svelte 5 Runes
 *
 * Reactive store wrapping the loan-orchestrator service.
 * Derives UI state from LoanPhase. All mutations go through the orchestrator.
 *
 * Uses Svelte 5 runes ($state, $derived) for reactivity.
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §8.2
 */

import {
	loanOrchestrator,
	getUIState,
	type LoanPhase,
	type FeeItem,
	type ExecStep
} from '$lib/services/loan-orchestrator.service';

// ---------------------------------------------------------------------------
// Reactive state (Svelte 5 runes)
// ---------------------------------------------------------------------------

let phase = $state<LoanPhase>('IDLE');
let inputAmount = $state('');
let rbtcAmount = $state('');
let docAmount = $state('');
let usdt0RskAmount = $state('');
let usdt0ArbAmount = $state('');
let feeBreakdown = $state<FeeItem[]>([]);
let executionSteps = $state<ExecStep[]>([]);
let errorMessage = $state('');
let finalTxHash = $state('');
let finalAmount = $state('');
let isExecuting = $state(false);

// Derived UI step from phase (Plan §8.2)
const uiStep = $derived(getUIState(phase));

// Derived boolean states for template convenience
const isInProgress = $derived(
	phase !== 'IDLE' &&
		phase !== 'COMPLETE' &&
		phase !== 'FAILED' &&
		phase !== 'PAUSED_DOC' &&
		phase !== 'PAUSED_USDT0_RSK'
);

const isPaused = $derived(phase === 'PAUSED_DOC' || phase === 'PAUSED_USDT0_RSK');

// Subscribe to orchestrator state changes
function syncFromOrchestrator(): void {
	const state = loanOrchestrator.getFlowState();
	phase = state.phase;
	inputAmount = state.inputAmount;
	rbtcAmount = state.rbtcAmount;
	docAmount = state.docAmount;
	usdt0RskAmount = state.usdt0RskAmount;
	usdt0ArbAmount = state.usdt0ArbAmount;
	feeBreakdown = state.feeBreakdown;
	executionSteps = state.executionSteps;
	errorMessage = state.errorMessage;
	finalTxHash = state.finalTxHash;
	finalAmount = state.finalAmount;
	isExecuting = loanOrchestrator.isExecuting;
}

// Initialize sync from orchestrator
loanOrchestrator.subscribe(() => {
	syncFromOrchestrator();
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Start the loan flow with the given input amounts.
 * Transitions from IDLE → COLLECTING_INPUT.
 */
export async function startFlow(inputUsdAmount: string, rbtcNeeded: string): Promise<void> {
	await loanOrchestrator.startLoanFlow({
		inputAmount: inputUsdAmount,
		rbtcAmount: rbtcNeeded,
		sourceWallet: ''
	});
	syncFromOrchestrator();
}

/**
 * Move to the quoting phase (user has entered an amount).
 */
export function requestQuote(amount: string): void {
	loanOrchestrator.transitionToQuoting(amount);
	syncFromOrchestrator();
}

/**
 * Move to the review phase (quote received, user ready to review).
 */
export function showReview(fees: FeeItem[]): void {
	loanOrchestrator.transitionToReview(fees);
	syncFromOrchestrator();
}

/**
 * Execute the loan flow (confirm from review step).
 */
export async function confirmExecution(): Promise<void> {
	await loanOrchestrator.confirmExecution();
	syncFromOrchestrator();
}

/**
 * Cancel the current loan flow. Returns to IDLE.
 */
export function cancelFlow(): void {
	loanOrchestrator.cancelFlow();
	syncFromOrchestrator();
}

/**
 * Recover from a paused state.
 */
export async function recoverFlow(
	recoveryTarget: 'PAUSED_DOC' | 'PAUSED_USDT0_RSK'
): Promise<void> {
	await loanOrchestrator.recoverFrom(recoveryTarget);
	syncFromOrchestrator();
}

/**
 * Mark the flow as complete after successful bridge.
 */
export function markComplete(txHash: string, amount: string): void {
	loanOrchestrator.transitionToComplete(txHash, amount);
	syncFromOrchestrator();
}

/**
 * Mark the bridge as timed out.
 */
export function markTimedOut(): void {
	loanOrchestrator.transitionToTimedOut();
	syncFromOrchestrator();
}

/**
 * Reset the entire flow to IDLE.
 */
export function resetLoan(): void {
	loanOrchestrator.reset();
	syncFromOrchestrator();
}

export {
	// Reactive state values (read-only from consumer perspective)
	phase,
	inputAmount,
	rbtcAmount,
	docAmount,
	usdt0RskAmount,
	usdt0ArbAmount,
	feeBreakdown,
	executionSteps,
	errorMessage,
	finalTxHash,
	finalAmount,
	uiStep,
	isExecuting,
	isInProgress,
	isPaused
};
