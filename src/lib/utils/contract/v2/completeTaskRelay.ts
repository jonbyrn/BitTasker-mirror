/**
 * Mark-complete relay helpers.
 *
 * Production `GET /info` on tx-relay.bittasker.com hangs with no bytes.
 * The old client aborted that fetch after 90s. On Android, CapacitorHttp
 * rewrites GET onto the app origin (`/_capacitor_http_interceptor_`).
 * Aborting that request reloads the WebView, so the direct send and the
 * Nostr publish never run and the user sees no error.
 *
 * Do not abort. Let the hung request die in the background and continue.
 */

export const RELAY_HTTP_TIMEOUT_MS = 12_000;
export const RELAY_INFO_TIMEOUT_MS = 8_000;
export const COMPLETE_TASK_RECEIPT_TIMEOUT_MS = 60_000;

export class RelayRequestTimeoutError extends Error {
	readonly code = 'timeout' as const;
	constructor(timeoutMs: number) {
		const seconds = Math.max(1, Math.round(timeoutMs / 1000));
		super(`Relay request timed out after ${seconds} seconds`);
		this.name = 'RelayRequestTimeoutError';
	}
}

/** The passkey wallet is not the taskee stored on the payment contract. */
export class TaskeeSignerMismatchError extends Error {
	readonly code = 'signer_mismatch' as const;
	constructor(
		public readonly sender: string,
		public readonly taskee: string
	) {
		super('Wallet address does not match the worker address on this contract');
		this.name = 'TaskeeSignerMismatchError';
	}
}

/** Rootstock chain id the app already uses when the relay `/info` call does not answer. */
export function localRelayChainId(network: string | undefined): string {
	return network === 'mainnet' ? '30' : '31';
}

export function fallbackRelayContext(
	localAddress: string,
	network: string | undefined
): {
	securePaymentAddress: string;
	chainId: string;
	source: 'local';
} {
	return {
		securePaymentAddress: localAddress,
		chainId: localRelayChainId(network),
		source: 'local'
	};
}

export function senderMatchesTaskee(sender: string, taskee: string | undefined): boolean {
	const expected = taskee?.trim();
	if (!expected) return true;
	return sender.toLowerCase() === expected.toLowerCase();
}

export function assertExpectedSender(sender: string, taskee: string | undefined): void {
	if (!senderMatchesTaskee(sender, taskee)) {
		throw new TaskeeSignerMismatchError(sender, taskee?.trim() ?? '');
	}
}

/**
 * Race `run()` against a timer. The in-flight request is left alone on timeout
 * so a Capacitor-proxied GET is not aborted (that reload is the prod bug).
 * A late rejection after the timeout is swallowed.
 */
export function fetchWithoutAbort<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new RelayRequestTimeoutError(timeoutMs));
		}, timeoutMs);

		run().then(
			(value) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}
