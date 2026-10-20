/** Networks this beta is allowed to touch. Mainnet is refused. */
export type CreditNetwork = 'mock' | 'regtest' | 'signet';

export type AdvanceStatus =
	| 'requested'
	| 'offered'
	| 'accepted'
	| 'funded'
	| 'repaid'
	| 'defaulted'
	| 'cancelled';

export type CreditPartyRole = 'worker' | 'lender' | 'hirer';

/** A funded job escrow the advance is sized against. Confirmations come from the chain. */
export interface EscrowSnapshot {
	escrowId: string;
	jobId: string;
	asset: 'usdt_rgb';
	amountCents: number;
	hirerPubkey: string;
	workerPubkey: string;
	fundingTxid?: string;
	/** 0 means the escrow is not funded yet, even if a txid exists. */
	confirmations: number;
}

export interface AdvanceRecord {
	id: string;
	jobId: string;
	escrowId: string;
	network: CreditNetwork;
	workerPubkey: string;
	hirerPubkey: string;
	lenderPubkey?: string;
	escrowAmountCents: number;
	advanceAmountCents: number;
	feeAmountCents: number;
	status: AdvanceStatus;
	fundingTxid?: string;
	fundingConfirmations: number;
	createdAt: number;
	updatedAt: number;
}

export interface ReputationSummary {
	subjectPubkey: string;
	completedContracts: number;
	reviewCount: number;
	/** Null when the subject has no valid reviews. */
	averageRating: number | null;
	/** Deterministic 0–100 figure. Policy does not let this override the job-count cap. */
	score: number;
}

export interface PolicyTier {
	minCompleted: number;
	minRating: number;
	maxAdvancePercent: number;
}

export interface CreditPolicy {
	version: number;
	feeBps: number;
	maxFeeBps: number;
	minAdvanceCents: number;
	maxAdvanceCents: number;
	allowedNetworks: CreditNetwork[];
	tiers: PolicyTier[];
}

export interface AdvanceQuote {
	percent: number;
	advanceCents: number;
	feeCents: number;
	repaymentCents: number;
	workerRemainderCents: number;
	cappedBy: 'percent' | 'max' | 'min' | 'zero';
}

export class CreditDenied extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreditDenied';
	}
}

export class IllegalAdvanceTransition extends Error {
	readonly from: AdvanceStatus;
	readonly action: string;

	constructor(from: AdvanceStatus, action: string) {
		super(`Illegal advance transition: ${from} cannot ${action}`);
		this.name = 'IllegalAdvanceTransition';
		this.from = from;
		this.action = action;
	}
}
