import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	resolveExplicitRelayUrls,
	resolveTaskRelayUrls,
	sanitizeRelayUrls
} from '$lib/utils/relayUrls';

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
		expect(sanitizeRelayUrls('wss://a.com, wss://b.com')).toEqual([
			'wss://a.com',
			'wss://b.com'
		]);
	});
});

describe('resolveExplicitRelayUrls', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses env when set', () => {
		expect(resolveExplicitRelayUrls('wss://relay.example.com')).toEqual([
			'wss://relay.example.com'
		]);
	});

	it('falls back to production relay on bittasker.com when env missing', () => {
		vi.stubGlobal('window', { location: { hostname: 'bittasker.com' } });
		expect(resolveExplicitRelayUrls(undefined)).toEqual(['wss://relay1.bittasker.com']);
	});

	it('falls back to dev relay on dev.bittasker.com when env missing', () => {
		vi.stubGlobal('window', { location: { hostname: 'dev.bittasker.com' } });
		expect(resolveExplicitRelayUrls(undefined)).toEqual(['wss://relay1-dev.bittasker.com']);
	});
});

describe('resolveTaskRelayUrls', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses task env when set', () => {
		expect(resolveTaskRelayUrls('wss://task.example.com')).toEqual(['wss://task.example.com']);
	});

	it('falls back to production task relay on bittasker.com', () => {
		vi.stubGlobal('window', { location: { hostname: 'bittasker.com' } });
		expect(resolveTaskRelayUrls(undefined)).toEqual(['wss://relay2.bittasker.com']);
	});
});
