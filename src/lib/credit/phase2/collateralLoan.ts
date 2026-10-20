/**
 * Phase 2 extension point: BTC-collateral USDT loans (research §8.1).
 * Not built. No keys, no Taproot outputs, and no oracle settlement.
 *
 * The later plan is a 2-of-2 Taproot output funded by the borrower, with
 * three pre-signed paths agreed before funding:
 * - repay: an RGB USDT repayment is proven and the collateral returns
 * - default: a contract execution transaction keyed to a BTC/USD attestation
 * - refund: a timelock returns the collateral if the oracle is silent
 */

export interface CollateralLoanTerms {
	amountCents: number;
	aprBps: number;
	termDays: number;
	/** Loan-to-value in basis points. 5000 is 50%. */
	ltvBps: number;
}

export interface TaprootCollateralPlan {
	kind: 'taproot-2of2';
	status: 'not-implemented';
	paths: ['repay', 'default', 'refund-timelock'];
}

export function assertCollateralTerms(terms: CollateralLoanTerms): void {
	if (!Number.isSafeInteger(terms.amountCents) || terms.amountCents < 1000) {
		throw new Error('Collateral loans start at $10');
	}
	if (!Number.isSafeInteger(terms.aprBps) || terms.aprBps < 0 || terms.aprBps > 5_000) {
		throw new Error('APR is out of range');
	}
	if (!Number.isSafeInteger(terms.termDays) || terms.termDays < 1 || terms.termDays > 365) {
		throw new Error('Term must be between 1 and 365 days');
	}
	if (!Number.isSafeInteger(terms.ltvBps) || terms.ltvBps <= 0 || terms.ltvBps > 5_000) {
		throw new Error('LTV cannot be above 50%');
	}
}

export function planCollateralLoan(terms: CollateralLoanTerms): TaprootCollateralPlan {
	assertCollateralTerms(terms);
	return {
		kind: 'taproot-2of2',
		status: 'not-implemented',
		paths: ['repay', 'default', 'refund-timelock']
	};
}
