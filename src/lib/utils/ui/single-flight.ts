/**
 * Ignores a second tap until the first async action finishes.
 * The lock flips before the first await, so two click events cannot both start the work.
 */
export function createSingleFlight() {
	let running = false;

	return {
		get pending() {
			return running;
		},
		async run<T>(task: () => Promise<T>): Promise<T | undefined> {
			if (running) return undefined;
			running = true;
			try {
				return await task();
			} finally {
				running = false;
			}
		}
	};
}

/** Append a next step when the message does not already tell the user what to do. */
export function withNextStep(message: string, step: string): string {
	const text = message.trim();
	if (!text) return step;
	if (/retry|try again|tap /i.test(text)) return text;
	return `${text} ${step}`;
}
