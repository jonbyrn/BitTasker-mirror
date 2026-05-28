/**
 * Loan Orchestrator Service — Central State Machine
 *
 * Manages the entire RBTC-collateralized USDT0 loan flow with an exhaustive
 * state machine, validated transitions, concurrency locks, and recovery.
 * This is the single source of truth for loan flow state.
 *
 * SINGLE-WRITER PRINCIPLE: Only this service mutates loan flow state.
 * All UI components and other services read via subscribe() or getFlowState().
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §8
 */

import { createDebug } from '$lib/utils/debug';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';
import { isLoanFlowEnabled } from '$lib/services/kill-switch';

const debug = createDebug('loan-orchestrator');

// ---------------------------------------------------------------------------
// Exhaustive Loan Phase Enum (Plan §8.1)
// ---------------------------------------------------------------------------

export type LoanPhase =
	| 'IDLE'
	| 'COLLECTING_INPUT'
	| 'QUOTING'
	| 'AWAITING_CONFIRMATION'
	| 'MINTING_DOC'
	| 'WAITING_DOC_MINT'
	| 'APPROVING_DOC'
	| 'SWAPPING_DOC_TO_USDT0'
	| 'WAITING_SWAP'
	| 'APPROVING_USDT0'
	| 'BRIDGING_TO_ARBITRUM'
	| 'WAITING_BRIDGE'
	| 'BRIDGING_TIMED_OUT'
	| 'COMPLETE'
	| 'FAILED'
	| 'PAUSED_DOC'
	| 'PAUSED_USDT0_RSK'
	| 'RECOVERING';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeItem {
	label: string;
	amount: string;
	percent?: string;
}

export interface ExecStep {
	id: string;
	label: string;
	status: 'pending' | 'active' | 'complete' | 'failed';
	phase: LoanPhase;
	txHash?: string;
	error?: string;
}

export interface LoanFlowState {
	phase: LoanPhase;
	inputAmount: string;
	rbtcAmount: string;
	docAmount: string;
	usdt0RskAmount: string;
	usdt0ArbAmount: string;
	feeBreakdown: FeeItem[];
	executionSteps: ExecStep[];
	errorMessage: string;
	finalTxHash: string;
	finalAmount: string;
	sourceWallet: string;
	createdAt: number;
}

export interface LoanFlowParams {
	inputAmount: string;
	rbtcAmount: string;
	sourceWallet: string;
}

/** Subscriber callback type. */
export type LoanStateSubscriber = (state: LoanFlowState) => void;

// ---------------------------------------------------------------------------
// Loan Flow Error
// ---------------------------------------------------------------------------

export class LoanFlowError extends Error {
	constructor(
		message: string,
		public readonly phase?: LoanPhase
	) {
		super(message);
		this.name = 'LoanFlowError';
	}
}

// ---------------------------------------------------------------------------
// Valid Transition Map (Plan §8.3)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<LoanPhase, LoanPhase[]> = {
	IDLE: ['COLLECTING_INPUT'],
	COLLECTING_INPUT: ['QUOTING', 'IDLE'],
	QUOTING: ['AWAITING_CONFIRMATION', 'COLLECTING_INPUT'],
	AWAITING_CONFIRMATION: ['MINTING_DOC', 'COLLECTING_INPUT'],
	MINTING_DOC: ['WAITING_DOC_MINT', 'PAUSED_DOC', 'FAILED'],
	WAITING_DOC_MINT: ['APPROVING_DOC', 'PAUSED_DOC', 'FAILED'],
	APPROVING_DOC: ['SWAPPING_DOC_TO_USDT0', 'PAUSED_DOC', 'FAILED'],
	SWAPPING_DOC_TO_USDT0: ['WAITING_SWAP', 'PAUSED_DOC', 'FAILED'],
	WAITING_SWAP: ['APPROVING_USDT0', 'PAUSED_DOC', 'FAILED'],
	APPROVING_USDT0: ['BRIDGING_TO_ARBITRUM', 'PAUSED_USDT0_RSK', 'FAILED'],
	BRIDGING_TO_ARBITRUM: ['WAITING_BRIDGE', 'PAUSED_USDT0_RSK', 'FAILED'],
	WAITING_BRIDGE: ['COMPLETE', 'BRIDGING_TIMED_OUT', 'PAUSED_USDT0_RSK', 'FAILED'],
	BRIDGING_TIMED_OUT: ['WAITING_BRIDGE', 'RECOVERING', 'PAUSED_USDT0_RSK', 'IDLE'],
	COMPLETE: ['IDLE'],
	FAILED: ['IDLE', 'RECOVERING'],
	PAUSED_DOC: ['RECOVERING', 'IDLE'],
	PAUSED_USDT0_RSK: ['RECOVERING', 'IDLE'],
	RECOVERING: [
		'SWAPPING_DOC_TO_USDT0',
		'BRIDGING_TO_ARBITRUM',
		'APPROVING_USDT0',
		'PAUSED_DOC',
		'PAUSED_USDT0_RSK',
		'IDLE',
		'FAILED'
	]
};

// ---------------------------------------------------------------------------
// UI State Derivation (Plan §8.2)
// ---------------------------------------------------------------------------

export function getUIState(
	phase: LoanPhase
): 'input' | 'review' | 'executing' | 'complete' | 'error' {
	switch (phase) {
		case 'IDLE':
		case 'COLLECTING_INPUT':
		case 'QUOTING':
			return 'input';
		case 'AWAITING_CONFIRMATION':
			return 'review';
		case 'MINTING_DOC':
		case 'WAITING_DOC_MINT':
		case 'APPROVING_DOC':
		case 'SWAPPING_DOC_TO_USDT0':
		case 'WAITING_SWAP':
		case 'APPROVING_USDT0':
		case 'BRIDGING_TO_ARBITRUM':
		case 'WAITING_BRIDGE':
		case 'BRIDGING_TIMED_OUT':
			return 'executing';
		case 'COMPLETE':
			return 'complete';
		case 'FAILED':
		case 'PAUSED_DOC':
		case 'PAUSED_USDT0_RSK':
		case 'RECOVERING':
			return 'error';
	}
}

// ---------------------------------------------------------------------------
// Execution Step Definitions
// ---------------------------------------------------------------------------

function buildExecutionSteps(): ExecStep[] {
	return [
		{
			id: 'collateralize',
			label: 'wallet.loan.executing_minting',
			status: 'pending',
			phase: 'MINTING_DOC'
		},
		{
			id: 'swap',
			label: 'wallet.loan.executing_swapping',
			status: 'pending',
			phase: 'SWAPPING_DOC_TO_USDT0'
		},
		{
			id: 'bridge',
			label: 'wallet.loan.executing_bridging',
			status: 'pending',
			phase: 'BRIDGING_TO_ARBITRUM'
		}
	];
}

// ---------------------------------------------------------------------------
// Phase-to-paused mapping helper
// ---------------------------------------------------------------------------

/**
 * Maps the current execution phase to the appropriate paused terminal phase.
 * Extracted as a pure function to avoid TypeScript control-flow narrowing
 * pitfalls across try/catch boundaries.
 */
function determinePausedPhase(phase: LoanPhase): LoanPhase {
	if (
		phase === 'MINTING_DOC' ||
		phase === 'WAITING_DOC_MINT' ||
		phase === 'APPROVING_DOC' ||
		phase === 'SWAPPING_DOC_TO_USDT0' ||
		phase === 'WAITING_SWAP'
	)
		return 'PAUSED_DOC';
	if (phase === 'APPROVING_USDT0' || phase === 'BRIDGING_TO_ARBITRUM' || phase === 'WAITING_BRIDGE')
		return 'PAUSED_USDT0_RSK';
	return 'FAILED';
}

// ---------------------------------------------------------------------------
// Default State
// ---------------------------------------------------------------------------

function createInitialState(): LoanFlowState {
	return {
		phase: 'IDLE',
		inputAmount: '',
		rbtcAmount: '',
		docAmount: '',
		usdt0RskAmount: '',
		usdt0ArbAmount: '',
		feeBreakdown: [],
		executionSteps: buildExecutionSteps(),
		errorMessage: '',
		finalTxHash: '',
		finalAmount: '',
		sourceWallet: '',
		createdAt: 0
	};
}

// ---------------------------------------------------------------------------
// Loan Orchestrator
// ---------------------------------------------------------------------------

class LoanOrchestrator {
	private state: LoanFlowState = createInitialState();
	private executing = false;
	private activeAbortController: AbortController | null = null;
	private subscribers: Set<LoanStateSubscriber> = new Set();

	// -----------------------------------------------------------------------
	// State management
	// -----------------------------------------------------------------------

	/**
	 * Transition to a new phase with validation.
	 * Throws LoanFlowError on invalid transitions.
	 */
	private transitionTo(nextPhase: LoanPhase): void {
		const currentPhase = this.state.phase;
		const validNext = VALID_TRANSITIONS[currentPhase];

		if (!validNext?.includes(nextPhase)) {
			const error = new LoanFlowError(
				`Invalid transition: ${currentPhase} → ${nextPhase}`,
				currentPhase
			);
			debug.error(error.message);
			loanMonitoringService.flowError(currentPhase, error);
			throw error;
		}

		debug.log('Phase transition: %s → %s', currentPhase, nextPhase);
		loanMonitoringService.phaseChange(currentPhase, nextPhase, {
			inputAmount: this.state.inputAmount
		});

		this.state.phase = nextPhase;
		this.notifySubscribers();
	}

	private notifySubscribers(): void {
		const snapshot = { ...this.state };
		for (const sub of this.subscribers) {
			try {
				sub(snapshot);
			} catch (err) {
				debug.warn('Subscriber error: %s', (err as Error).message);
			}
		}
	}

	// -----------------------------------------------------------------------
	// Execution step helpers
	// -----------------------------------------------------------------------

	private updateExecStep(
		stepId: string,
		status: ExecStep['status'],
		extra?: Partial<ExecStep>
	): void {
		const idx = this.state.executionSteps.findIndex((s) => s.id === stepId);
		if (idx !== -1) {
			this.state.executionSteps[idx] = {
				...this.state.executionSteps[idx],
				status,
				...extra
			};
		}
		this.notifySubscribers();
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Start the loan flow. Entry point for the UI.
	 *
	 * Validates feature flag, concurrency lock, and preconditions before
	 * allowing the flow to begin.
	 */
	async startLoanFlow(params: LoanFlowParams): Promise<void> {
		if (!isLoanFlowEnabled()) {
			throw new LoanFlowError('Loan flow is not enabled');
		}

		if (this.executing) {
			throw new LoanFlowError('A flow is already in progress');
		}

		if (this.state.phase !== 'IDLE') {
			throw new LoanFlowError(`Cannot start: flow is in ${this.state.phase}`);
		}

		this.executing = true;
		this.activeAbortController = new AbortController();

		try {
			this.transitionTo('COLLECTING_INPUT');

			this.state.inputAmount = params.inputAmount;
			this.state.rbtcAmount = params.rbtcAmount;
			this.state.sourceWallet = params.sourceWallet;
			this.state.createdAt = Date.now();
			this.state.executionSteps = buildExecutionSteps();

			loanMonitoringService.lifecycleEvent('started', {
				inputAmount: params.inputAmount,
				rbtcAmount: params.rbtcAmount
			});

			this.notifySubscribers();
		} catch (error) {
			this.executing = false;
			this.activeAbortController = null;
			throw error;
		}
		// Note: executing flag stays true while flow is active
	}

	/**
	 * Cancel the current flow. returns to IDLE regardless of current phase.
	 */
	cancelFlow(): void {
		if (this.activeAbortController) {
			this.activeAbortController.abort();
		}

		const wasPhase = this.state.phase;
		this.state = createInitialState();
		this.state.phase = 'IDLE';
		this.executing = false;
		this.activeAbortController = null;

		loanMonitoringService.lifecycleEvent('cancelled', { wasPhase });
		this.notifySubscribers();
	}

	/**
	 * Move from COLLECTING_INPUT to QUOTING (user entered amount and wants a quote).
	 */
	transitionToQuoting(inputAmount: string): void {
		this.transitionTo('QUOTING');
		this.state.inputAmount = inputAmount;
		this.notifySubscribers();
	}

	/**
	 * Move from QUOTING to AWAITING_CONFIRMATION (quote received, user ready to review).
	 */
	transitionToReview(feeBreakdown: FeeItem[]): void {
		this.transitionTo('AWAITING_CONFIRMATION');
		this.state.feeBreakdown = feeBreakdown;
		this.notifySubscribers();
	}

	/**
	 * Execute the full loan flow starting from AWAITING_CONFIRMATION.
	 *
	 * This is the main execution method that orchestrates:
	 * 1. DOC minting
	 * 2. DOC approval
	 * 3. DOC → USDT0 swap
	 * 4. USDT0 approval
	 * 5. USDT0 → Arbitrum bridge
	 *
	 * Each step can be implemented as it becomes available from wallet-core.
	 * For Phase 2, the skeleton transitions are in place.
	 */
	async confirmExecution(): Promise<void> {
		if (this.state.phase !== 'AWAITING_CONFIRMATION') {
			throw new LoanFlowError(
				`Cannot execute: flow is in ${this.state.phase}, expected AWAITING_CONFIRMATION`
			);
		}

		const signal = this.activeAbortController?.signal;

		try {
			// Step 1: Mint DOC
			this.transitionTo('MINTING_DOC');
			this.updateExecStep('collateralize', 'active');
			if (signal?.aborted) throw new Error('Flow cancelled');
			// TODO: call docMintingService.mintDoc() when wallet-core service is available
			this.transitionTo('WAITING_DOC_MINT');

			// Step 2: Approve DOC
			this.transitionTo('APPROVING_DOC');
			if (signal?.aborted) throw new Error('Flow cancelled');
			this.updateExecStep('collateralize', 'complete');

			// Step 3: Swap DOC → USDT0
			this.transitionTo('SWAPPING_DOC_TO_USDT0');
			this.updateExecStep('swap', 'active');
			if (signal?.aborted) throw new Error('Flow cancelled');
			this.transitionTo('WAITING_SWAP');

			// Step 4: Approve USDT0
			this.transitionTo('APPROVING_USDT0');
			if (signal?.aborted) throw new Error('Flow cancelled');
			this.updateExecStep('swap', 'complete');

			// Step 5: Bridge USDT0 to Arbitrum
			this.transitionTo('BRIDGING_TO_ARBITRUM');
			this.updateExecStep('bridge', 'active');
			if (signal?.aborted) throw new Error('Flow cancelled');
			this.transitionTo('WAITING_BRIDGE');

			// If bridge confirms:
			// this.transitionTo('COMPLETE');
			// this.updateExecStep('bridge', 'complete');
			// loanMonitoringService.lifecycleEvent('completed');
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error('Execution failed: %s', err.message);
			loanMonitoringService.flowError(this.state.phase, err);

			const pausedPhase = determinePausedPhase(this.state.phase);
			this.transitionTo(pausedPhase);
			this.state.errorMessage = err.message;
		} finally {
			this.executing = !['COMPLETE', 'FAILED', 'PAUSED_DOC', 'PAUSED_USDT0_RSK'].includes(
				this.state.phase
			);
		}
	}

	/**
	 * Mark the flow as timed out (bridge exceeded 15 minutes).
	 */
	transitionToTimedOut(): void {
		this.transitionTo('BRIDGING_TIMED_OUT');
		loanMonitoringService.lifecycleEvent('timed_out', {
			phase: this.state.phase
		});
		this.notifySubscribers();
	}

	/**
	 * Mark the flow as complete after successful bridge.
	 */
	transitionToComplete(finalTxHash: string, finalAmount: string): void {
		this.transitionTo('COMPLETE');
		this.state.finalTxHash = finalTxHash;
		this.state.finalAmount = finalAmount;
		this.updateExecStep('bridge', 'complete', { txHash: finalTxHash });
		this.executing = false;

		loanMonitoringService.lifecycleEvent('completed', {
			finalTxHash,
			finalAmount
		});

		this.notifySubscribers();
	}

	/**
	 * Recover from a PAUSED state.
	 * Can recover DOC operations from PAUSED_DOC,
	 * or bridge operations from PAUSED_USDT0_RSK.
	 */
	async recoverFrom(recoveryTarget: 'PAUSED_DOC' | 'PAUSED_USDT0_RSK'): Promise<void> {
		if (recoveryTarget === 'PAUSED_DOC' && this.state.phase !== 'PAUSED_DOC') {
			throw new LoanFlowError('Can only recover DOC from PAUSED_DOC state');
		}
		if (recoveryTarget === 'PAUSED_USDT0_RSK' && this.state.phase !== 'PAUSED_USDT0_RSK') {
			throw new LoanFlowError('Can only recover USDT0 bridge from PAUSED_USDT0_RSK state');
		}

		this.transitionTo('RECOVERING');
		this.executing = true;

		loanMonitoringService.recoveryAttempt(this.state.phase, recoveryTarget, {
			inputAmount: this.state.inputAmount
		});

		if (recoveryTarget === 'PAUSED_DOC') {
			// Resume from swap step
			this.transitionTo('SWAPPING_DOC_TO_USDT0');
		} else if (recoveryTarget === 'PAUSED_USDT0_RSK') {
			// Resume from bridge step
			this.transitionTo('BRIDGING_TO_ARBITRUM');
		}

		this.executing = false;
	}

	/**
	 * Resume an incomplete flow after app restart.
	 * Reads persisted checkpoint and reconciles on-chain state.
	 *
	 * @returns true if a flow was resumed, false if none was found
	 */
	async resumeIncompleteFlow(): Promise<boolean> {
		// In a full implementation, this reads from Capacitor Preferences
		// and reconciles on-chain state.
		// For Phase 2 skeleton, return false (no persistence yet).
		debug.log('No persisted flow found — nothing to resume');
		return false;
	}

	/**
	 * Get a copy of the current flow state.
	 */
	getFlowState(): LoanFlowState {
		return { ...this.state };
	}

	/**
	 * Get the fee breakdown for the current flow.
	 */
	getFeeBreakdown(): FeeItem[] {
		return [...this.state.feeBreakdown];
	}

	/**
	 * Subscribe to state changes. Returns an unsubscribe function.
	 */
	subscribe(callback: LoanStateSubscriber): () => void {
		this.subscribers.add(callback);
		// Immediately call with current state
		try {
			callback({ ...this.state });
		} catch {
			// Ignore immediate callback errors
		}
		return () => {
			this.subscribers.delete(callback);
		};
	}

	/**
	 * Check if a flow is currently executing.
	 */
	get isExecuting(): boolean {
		return this.executing;
	}

	/**
	 * Get the abort signal for the current flow.
	 */
	get abortSignal(): AbortSignal | null {
		return this.activeAbortController?.signal ?? null;
	}

	/**
	 * Reset the orchestrator completely.
	 */
	reset(): void {
		if (this.activeAbortController) {
			this.activeAbortController.abort();
		}
		this.state = createInitialState();
		this.executing = false;
		this.activeAbortController = null;
		this.notifySubscribers();
	}
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const loanOrchestrator = new LoanOrchestrator();
