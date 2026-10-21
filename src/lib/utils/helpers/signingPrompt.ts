/**
 * True while a passkey / WebAuthn prompt is on screen, and for a short
 * quiet period after it closes. The quiet period covers the click the
 * browser delivers when the prompt steals and then returns focus.
 */

const SUBMIT_QUIET_MS = 1_000;

let depth = 0;
let quietUntil = 0;
const listeners = new Set<(pending: boolean) => void>();

function emit(): void {
	const pending = isSigningPromptPending();
	for (const listener of listeners) listener(pending);
}

export function isSigningPromptPending(now = Date.now()): boolean {
	return depth > 0 || now < quietUntil;
}

export function subscribeSigningPrompt(listener: (pending: boolean) => void): () => void {
	listeners.add(listener);
	listener(isSigningPromptPending());
	return () => {
		listeners.delete(listener);
	};
}

/** Call before showing the prompt. The returned function ends it. */
export function beginSigningPrompt(): () => void {
	depth += 1;
	emit();
	let ended = false;
	return () => {
		if (ended) return;
		ended = true;
		depth = Math.max(0, depth - 1);
		if (depth === 0) {
			quietUntil = Date.now() + SUBMIT_QUIET_MS;
			setTimeout(() => emit(), SUBMIT_QUIET_MS);
		}
		emit();
	};
}

export async function withSigningPrompt<T>(run: () => Promise<T>): Promise<T> {
	const end = beginSigningPrompt();
	try {
		return await run();
	} finally {
		end();
	}
}

export function resetSigningPrompt(): void {
	depth = 0;
	quietUntil = 0;
	emit();
}
