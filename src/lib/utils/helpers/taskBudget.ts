/** Shown when a task budget is missing, not a number, or negative. */
export const MISSING_TASK_BUDGET = '—';

type BudgetSource =
	| {
			budget?: { amount?: unknown } | null;
			amount?: unknown;
	  }
	| null
	| undefined;

/**
 * Kind 31000 events sometimes omit `budget` or store `amount` as a string.
 * `Number(undefined)` is NaN, and a negative quote is not a price.
 */
export function taskBudgetAmount(task: BudgetSource): number | null {
	const raw = Number(task?.budget?.amount ?? task?.amount);
	if (!Number.isFinite(raw) || raw < 0) return null;
	return raw;
}
