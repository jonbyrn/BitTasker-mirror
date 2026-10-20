import { assertCents } from '$lib/credit/money';

export type PayoutRole = 'lender' | 'worker' | 'hirer';
export type PayoutReason = 'repayment' | 'remainder' | 'refund';

export interface PayoutLeg {
	role: PayoutRole;
	pubkey: string;
	amountCents: number;
	reason: PayoutReason;
}

/**
 * How an escrow release is divided.
 * `partialSendRequired` is true when one coin would have to be split.
 * That send stays blocked on the live RGB adapter until change is safe.
 */
export interface PayoutSplit {
	escrowCents: number;
	legs: PayoutLeg[];
	partialSendRequired: boolean;
}

export interface CompletionSplitInput {
	escrowCents: number;
	advanceCents: number;
	feeCents: number;
	lenderPubkey: string;
	workerPubkey: string;
}

export interface CancellationSplitInput {
	escrowCents: number;
	hirerPubkey: string;
}

function assertSum(escrowCents: number, legs: PayoutLeg[]): void {
	const sum = legs.reduce((total, leg) => total + leg.amountCents, 0);
	if (sum !== escrowCents) {
		throw new Error('Payout split does not add up to the escrow');
	}
}

/** Lender is paid first (advance + fee). The worker receives whatever remains. */
export function completionSplit(input: CompletionSplitInput): PayoutSplit {
	assertCents(input.escrowCents, 'Escrow');
	assertCents(input.advanceCents, 'Advance');
	assertCents(input.feeCents, 'Fee');
	if (input.escrowCents <= 0) throw new Error('Escrow must be greater than zero');
	const repayment = input.advanceCents + input.feeCents;
	if (repayment > input.escrowCents) {
		throw new Error('Repayment is larger than the escrow');
	}
	const remainder = input.escrowCents - repayment;
	const legs: PayoutLeg[] = [
		{
			role: 'lender',
			pubkey: input.lenderPubkey,
			amountCents: repayment,
			reason: 'repayment'
		},
		{
			role: 'worker',
			pubkey: input.workerPubkey,
			amountCents: remainder,
			reason: 'remainder'
		}
	];
	assertSum(input.escrowCents, legs);
	return {
		escrowCents: input.escrowCents,
		legs,
		partialSendRequired: repayment > 0 && remainder > 0
	};
}

/**
 * The hirer is refunded the full escrow. The lender is not repaid.
 * One coin to one recipient is a full-allocation transfer.
 */
export function cancellationSplit(input: CancellationSplitInput): PayoutSplit {
	assertCents(input.escrowCents, 'Escrow');
	if (input.escrowCents <= 0) throw new Error('Escrow must be greater than zero');
	const legs: PayoutLeg[] = [
		{
			role: 'hirer',
			pubkey: input.hirerPubkey,
			amountCents: input.escrowCents,
			reason: 'refund'
		}
	];
	assertSum(input.escrowCents, legs);
	return {
		escrowCents: input.escrowCents,
		legs,
		partialSendRequired: false
	};
}

export function legAmount(split: PayoutSplit, role: PayoutRole): number {
	return split.legs.find((leg) => leg.role === role)?.amountCents ?? 0;
}
