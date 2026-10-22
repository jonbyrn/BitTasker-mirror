import { describe, expect, it } from 'vitest';
import {
	RELAY_SIGN_IN_REASON,
	blockingRelayFailure,
	isSkippableRelayFailure
} from '$lib/nostr/relaySession';

describe('message relay failures', () => {
	it('skips a nos.lol timeout and a damus NIP-42 auth-required response', () => {
		expect(isSkippableRelayFailure('wss://nos.lol', 'timed out before the relay finished')).toBe(
			true
		);
		expect(isSkippableRelayFailure('wss://relay.damus.io', 'auth-required: sign in')).toBe(true);
		expect(isSkippableRelayFailure('wss://relay.damus.io', RELAY_SIGN_IN_REASON)).toBe(true);
		expect(
			isSkippableRelayFailure(
				'wss://relay2-dev.bittasker.com',
				'asked for a sign-in this app does not send'
			)
		).toBe(false);
	});

	it('does not turn skipped relays into an inbox error', () => {
		expect(
			blockingRelayFailure([
				{ url: 'wss://relay1.bittasker.com', ok: true, reason: 'ok' },
				{ url: 'wss://nos.lol', ok: false, reason: 'timed out before the relay finished' },
				{ url: 'wss://relay.damus.io', ok: false, reason: 'auth-required: we need AUTH' }
			])
		).toBeNull();
		expect(
			blockingRelayFailure([
				{ url: 'wss://nos.lol', ok: false, reason: 'timed out before the relay finished' },
				{ url: 'wss://relay.damus.io', ok: false, reason: 'auth-required: restricted' }
			])
		).toBeNull();
	});

	it('still reports a relay that could not connect', () => {
		const message = blockingRelayFailure([
			{ url: 'wss://relay1.bittasker.com', ok: false, reason: 'could not connect' },
			{ url: 'wss://nos.lol', ok: false, reason: 'timed out before the relay finished' }
		]);
		expect(message).toContain('wss://relay1.bittasker.com');
		expect(message).not.toContain('nos.lol');
	});
});
