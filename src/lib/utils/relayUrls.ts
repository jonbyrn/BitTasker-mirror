import { createDebug } from '$lib/utils/debug';

const d = createDebug('relayUrls');
const E2E_TASK_RELAY_URL = 'ws://localhost:7777';
const socketsClosing = new WeakSet<WebSocket>();

/** Node's WebSocket re-enters onerror when close() runs from onerror, which overflows the stack. */
export function guardRelaySocket(): void {
	if (typeof WebSocket === 'undefined') return;
	const proto = WebSocket.prototype as WebSocket & { __btCloseGuarded?: boolean };
	if (proto.__btCloseGuarded) return;
	const close = proto.close;
	proto.close = function (code?: number, reason?: string) {
		if (socketsClosing.has(this)) return;
		socketsClosing.add(this);
		try {
			close.call(this, code, reason);
		} finally {
			socketsClosing.delete(this);
		}
	};
	proto.__btCloseGuarded = true;
}

function isE2ERun(): boolean {
	// Only consider E2E mode when both the bypass is set AND we're in a test environment
	const hasBypass = import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
	const isTestEnv =
		typeof window !== 'undefined' &&
		(window as Window & { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true;

	return hasBypass && isTestEnv;
}

function includeE2ETaskRelay(urls: string[]): string[] {
	if (!isE2ERun() || urls.includes(E2E_TASK_RELAY_URL)) return urls;
	return [...urls, E2E_TASK_RELAY_URL];
}

/**
 * Ensures relay URLs are valid strings:
 * trims whitespace, drops empty/undefined placeholders, normalizes ws(s) scheme.
 */
export function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => (typeof url === 'string' ? url.trim() : ''))
		.filter(
			(url) => url.length > 0 && url !== 'undefined' && url !== 'null' && url !== '[object Object]'
		)
		.map((url) => {
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				return `wss://${url}`;
			}
			return url;
		});
}

/**
 * Resolve general Nostr relay URLs from build-time env.
 *
 * VITE_NOSTR_RELAY_URL must be set at build time via:
 * - Cloudflare Pages: Dashboard → Settings → Environment variables
 * - GitLab CI/CD: Variables with environment scope
 *
 * If missing, returns empty array and logs an error.
 */
export function resolveExplicitRelayUrls(envValue: string | undefined): string[] {
	const urls = sanitizeRelayUrls(envValue);
	const resolvedUrls = includeE2ETaskRelay(urls);
	if (resolvedUrls.length === 0) {
		d.error(
			'VITE_NOSTR_RELAY_URL not set at build time. ' +
				'Configure it in Cloudflare Pages (for Pages) or GitLab CI/CD variables (for Workers).'
		);
	}
	return resolvedUrls;
}

/**
 * Resolve task relay URL from env.
 *
 * VITE_NOSTR_TASK_RELAY_URL must be set at build time.
 * Falls back to VITE_NOSTR_RELAY_URL if task relay is not configured.
 */
export function resolveTaskRelayUrls(envValue: string | undefined): string[] {
	const urls = sanitizeRelayUrls(envValue);
	if (urls.length > 0) return includeE2ETaskRelay(urls);

	d.warn('VITE_NOSTR_TASK_RELAY_URL not set, falling back to VITE_NOSTR_RELAY_URL');
	return resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

/** Relays that both publish and read tasks and bids. */
export function resolveSharedRelays(): string[] {
	const urls = [
		...resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL),
		...resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL)
	];
	return [...new Set(urls)];
}
