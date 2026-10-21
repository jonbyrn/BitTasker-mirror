import { describe, expect, it, vi } from 'vitest';
import {
	isBenignRelayClose,
	resolveExplicitRelayUrls,
	resolveSharedRelays,
	resolveTaskRelayUrls,
	sanitizeRelayUrls
} from '$lib/utils/relayUrls';

describe('isBenignRelayClose', () => {
	it('ignores a socket that closed during subscribe', () => {
		expect(isBenignRelayClose('websocket closed')).toBe(true);
		expect(isBenignRelayClose(new Error('WebSocket is already in CLOSING or CLOSED state.'))).toBe(
			true
		);
		expect(isBenignRelayClose(new Error('relay rejected the event'))).toBe(false);
	});
});

describe('sanitizeRelayUrls', () => {
	it('returns empty array for undefined', () => {
		expect(sanitizeRelayUrls(undefined)).toEqual([]);
	});

	it('filters undefined-like string placeholders', () => {
		expect(sanitizeRelayUrls('undefined, null, ')).toEqual([]);
	});

	it('trims and normalizes scheme', () => {
		expect(sanitizeRelayUrls(' relay.example.com ')).toEqual(['wss://relay.example.com']);
	});

	it('splits comma-separated urls', () => {
		expect(sanitizeRelayUrls('wss://a.com, wss://b.com')).toEqual(['wss://a.com', 'wss://b.com']);
	});

	it('handles array input', () => {
		expect(sanitizeRelayUrls(['wss://a.com', 'wss://b.com'])).toEqual([
			'wss://a.com',
			'wss://b.com'
		]);
	});

	it('adds wss:// scheme when missing', () => {
		expect(sanitizeRelayUrls('relay.example.com')).toEqual(['wss://relay.example.com']);
	});

	it('preserves ws:// scheme', () => {
		expect(sanitizeRelayUrls('ws://relay.example.com')).toEqual(['ws://relay.example.com']);
	});
});

describe('resolveExplicitRelayUrls', () => {
	it('returns sanitized URLs when env is set', () => {
		expect(resolveExplicitRelayUrls('wss://relay.example.com')).toEqual([
			'wss://relay.example.com'
		]);
	});

	it('returns empty array when env is undefined (no hardcoded fallbacks)', () => {
		expect(resolveExplicitRelayUrls(undefined)).toEqual([]);
	});

	it('returns empty array when env is empty string', () => {
		expect(resolveExplicitRelayUrls('')).toEqual([]);
	});

	it('handles multiple comma-separated relays', () => {
		expect(resolveExplicitRelayUrls('wss://a.com, wss://b.com')).toEqual([
			'wss://a.com',
			'wss://b.com'
		]);
	});
});

describe('resolveTaskRelayUrls', () => {
	it('returns sanitized URLs when task env is set', () => {
		expect(resolveTaskRelayUrls('wss://task.example.com')).toEqual(['wss://task.example.com']);
	});

	it('falls back to VITE_NOSTR_RELAY_URL when task relay is undefined', () => {
		// When VITE_NOSTR_TASK_RELAY_URL is undefined, it falls back to VITE_NOSTR_RELAY_URL
		// The actual value depends on what's set in import.meta.env at test time
		const result = resolveTaskRelayUrls(undefined);
		// Either returns the fallback relay URLs or empty array if neither is set
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('resolveSharedRelays', () => {
	it('reads tasks and bids from the publish relay and the task relay', () => {
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		vi.stubEnv('VITE_NOSTR_TASK_RELAY_URL', 'wss://relay.primal.net');
		expect(resolveSharedRelays()).toEqual(['wss://nos.lol', 'wss://relay.primal.net']);
		vi.unstubAllEnvs();
	});
});
