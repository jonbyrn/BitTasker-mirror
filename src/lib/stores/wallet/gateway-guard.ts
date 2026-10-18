/**
 * rln-wasm peer sessions retry the gateway inside the wasm module.
 * `UTEXOWallet.connectPeer` cannot pass `max_reconnect_attempts` (that field
 * exists only on `peerSessionConnectWithOptions`). A failed socket is retried
 * until the tab runs out of memory. This guard allows a few real sockets,
 * then refuses further constructors so the retry loop cannot open more.
 *
 * The URL shape is the beta.12 gateway route, not a BitTasker path bug:
 * `wss://ln-gateway-signet.utexo.com/v1/<host dots as _>/<port>?auth_token&node_id`.
 * A live handshake completed on that URL. Later sockets fail and the wasm
 * session keeps dialing.
 */

export const GATEWAY_SOCKET_CAP = 2;
const GATEWAY_HOST = 'ln-gateway-signet.utexo.com';
const COLLAPSE =
	/rln-wasm-sdk peer-session|ln-gateway-signet\.utexo\.com|wallet-lsp\] connect failed|Lightning gateway socket cap/;
/** Wallet diagnostics must stay visible even when they mention the gateway. */
const KEEP_LOG = /\[wallet-init\]|\[wallet-diagnostic\]|\[wallet-page|\[wallet-log\]/;

const logCounts = new Map<string, number>();

interface GuardState {
	opened: number;
	capped: boolean;
	onCap: () => void;
	native: typeof WebSocket | null;
	error: typeof console.error | null;
	warn: typeof console.warn | null;
}

const state: GuardState = {
	opened: 0,
	capped: false,
	onCap: () => undefined,
	native: null,
	error: null,
	warn: null
};

export function isGatewaySocketUrl(url: string): boolean {
	return url.includes(GATEWAY_HOST);
}

/** First copy of a noisy gateway line is kept. Later copies are dropped. Wallet lines always pass. */
export function allowRepeatedLog(text: string): boolean {
	if (KEEP_LOG.test(text) || !COLLAPSE.test(text)) return true;
	const key = text.replace(/auth_token=[^&\s]+/gi, 'auth_token').slice(0, 180);
	const count = (logCounts.get(key) ?? 0) + 1;
	logCounts.set(key, count);
	return count === 1;
}

export function gatewaySocketsOpened(): number {
	return state.opened;
}

export function gatewaySocketsCapped(): boolean {
	return state.capped;
}

function noteCap(): void {
	if (state.capped) return;
	state.capped = true;
	state.onCap();
}

function wrapLog(method: 'error' | 'warn'): void {
	const original = console[method].bind(console);
	if (method === 'error') state.error = original;
	else state.warn = original;
	console[method] = (...args: unknown[]) => {
		try {
			const text = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');
			if (!allowRepeatedLog(text)) {
				const key = text.replace(/auth_token=[^&\s]+/gi, 'auth_token').slice(0, 180);
				if (logCounts.get(key) === 2) {
					original('[wallet-log] suppressing repeated gateway logs');
				}
				return;
			}
		} catch {
			original(...args);
			return;
		}
		original(...args);
	};
}

/** Patch WebSocket and collapse repeated gateway logs. Safe to call again. */
export function installGatewayGuard(onCap: () => void): void {
	state.onCap = onCap;
	if (state.native || typeof WebSocket === 'undefined') {
		if (!state.error) {
			wrapLog('error');
			wrapLog('warn');
		}
		return;
	}
	const native = WebSocket;
	state.native = native;
	function Guarded(this: WebSocket, url: string | URL, protocols?: string | string[]): WebSocket {
		const href = String(url);
		if (isGatewaySocketUrl(href)) {
			state.opened += 1;
			if (state.opened > GATEWAY_SOCKET_CAP) {
				noteCap();
				throw new Error('Lightning gateway socket cap');
			}
		}
		if (protocols === undefined) return new native(url);
		return new native(url, protocols);
	}
	Guarded.prototype = native.prototype;
	Object.setPrototypeOf(Guarded, native);
	window.WebSocket = Guarded as unknown as typeof WebSocket;
	if (!state.error) {
		wrapLog('error');
		wrapLog('warn');
	}
}

export function resetGatewayGuardForTests(): void {
	if (state.native) window.WebSocket = state.native;
	if (state.error) console.error = state.error;
	if (state.warn) console.warn = state.warn;
	state.opened = 0;
	state.capped = false;
	state.onCap = () => undefined;
	state.native = null;
	state.error = null;
	state.warn = null;
	logCounts.clear();
}
