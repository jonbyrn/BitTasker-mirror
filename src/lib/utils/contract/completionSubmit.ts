/**
 * The completion note must be the full current value. A passkey prompt can
 * interrupt typing so the reactive state holds a prefix (for example "Mark")
 * while the field, or the state, still has the rest.
 */

export function fullCompletionNote(
	stateValue: string | null | undefined,
	fieldValue: string | null | undefined,
	maxChars = 1000
): string | undefined {
	const clip = (value: string) => (value.length > maxChars ? value.slice(0, maxChars) : value);
	const state = clip(stateValue ?? '');
	const field = clip(fieldValue ?? '');
	let chosen = field;
	if (field.startsWith(state) && field.length >= state.length) chosen = field;
	else if (state.startsWith(field) && state.length > field.length) chosen = state;
	else chosen = field.length >= state.length ? field : state;
	const trimmed = chosen.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/** How long the completion spinner runs before the network-wait hint appears. */
export const COMPLETION_CONFIRMING_HINT_MS = 10_000;

/** Submit only when nothing is signing and no submission is already running. */
export function completionSubmitAllowed(args: {
	signingPending: boolean;
	inFlight: boolean;
}): boolean {
	return !args.signingPending && !args.inFlight;
}
