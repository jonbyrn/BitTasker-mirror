import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { muteStore } from '$lib/stores/mute.store';

describe('muteStore', () => {
	beforeEach(() => {
		muteStore.reset();
	});

	describe('initial state', () => {
		it('should start with empty muted pubkeys', () => {
			const state = get(muteStore);
			expect(state.mutedPubkeys.size).toBe(0);
		});

		it('should start with empty muted event IDs', () => {
			const state = get(muteStore);
			expect(state.mutedEventIds.size).toBe(0);
		});

		it('should start with isLoaded = false', () => {
			const state = get(muteStore);
			expect(state.isLoaded).toBe(false);
		});
	});

	describe('load()', () => {
		it('should populate mutedPubkeys from an array', () => {
			muteStore.load(['pubkey-a', 'pubkey-b'], []);
			const state = get(muteStore);
			expect(state.mutedPubkeys.has('pubkey-a')).toBe(true);
			expect(state.mutedPubkeys.has('pubkey-b')).toBe(true);
			expect(state.mutedPubkeys.size).toBe(2);
		});

		it('should populate mutedEventIds from an array', () => {
			muteStore.load([], ['event-1', 'event-2']);
			const state = get(muteStore);
			expect(state.mutedEventIds.has('event-1')).toBe(true);
			expect(state.mutedEventIds.has('event-2')).toBe(true);
			expect(state.mutedEventIds.size).toBe(2);
		});

		it('should set isLoaded to true', () => {
			muteStore.load([], []);
			expect(get(muteStore).isLoaded).toBe(true);
		});

		it('should replace existing state on repeated calls', () => {
			muteStore.load(['pubkey-a'], []);
			muteStore.load(['pubkey-b', 'pubkey-c'], ['event-1']);
			const state = get(muteStore);
			expect(state.mutedPubkeys.has('pubkey-a')).toBe(false);
			expect(state.mutedPubkeys.has('pubkey-b')).toBe(true);
			expect(state.mutedPubkeys.has('pubkey-c')).toBe(true);
			expect(state.mutedEventIds.has('event-1')).toBe(true);
		});

		it('should handle empty arrays', () => {
			muteStore.load([], []);
			const state = get(muteStore);
			expect(state.mutedPubkeys.size).toBe(0);
			expect(state.mutedEventIds.size).toBe(0);
			expect(state.isLoaded).toBe(true);
		});
	});

	describe('mutePubkey()', () => {
		it('should add a pubkey to mutedPubkeys', () => {
			muteStore.mutePubkey('pubkey-x');
			expect(get(muteStore).mutedPubkeys.has('pubkey-x')).toBe(true);
		});

		it('should preserve existing muted pubkeys', () => {
			muteStore.load(['pubkey-existing'], []);
			muteStore.mutePubkey('pubkey-new');
			const state = get(muteStore);
			expect(state.mutedPubkeys.has('pubkey-existing')).toBe(true);
			expect(state.mutedPubkeys.has('pubkey-new')).toBe(true);
		});

		it('should be idempotent — muting the same pubkey twice does not duplicate', () => {
			muteStore.mutePubkey('pubkey-dup');
			muteStore.mutePubkey('pubkey-dup');
			expect(get(muteStore).mutedPubkeys.size).toBe(1);
		});
	});

	describe('muteEventId()', () => {
		it('should add an event ID to mutedEventIds', () => {
			muteStore.muteEventId('event-abc');
			expect(get(muteStore).mutedEventIds.has('event-abc')).toBe(true);
		});

		it('should preserve existing muted event IDs', () => {
			muteStore.load([], ['event-existing']);
			muteStore.muteEventId('event-new');
			const state = get(muteStore);
			expect(state.mutedEventIds.has('event-existing')).toBe(true);
			expect(state.mutedEventIds.has('event-new')).toBe(true);
		});

		it('should be idempotent — muting the same event ID twice does not duplicate', () => {
			muteStore.muteEventId('event-dup');
			muteStore.muteEventId('event-dup');
			expect(get(muteStore).mutedEventIds.size).toBe(1);
		});
	});

	describe('unmutePubkey()', () => {
		it('should remove a pubkey from mutedPubkeys', () => {
			muteStore.load(['pubkey-a', 'pubkey-b'], []);
			muteStore.unmutePubkey('pubkey-a');
			const state = get(muteStore);
			expect(state.mutedPubkeys.has('pubkey-a')).toBe(false);
			expect(state.mutedPubkeys.has('pubkey-b')).toBe(true);
		});

		it('should be a no-op when the pubkey is not muted', () => {
			muteStore.load(['pubkey-a'], []);
			muteStore.unmutePubkey('pubkey-not-muted');
			expect(get(muteStore).mutedPubkeys.size).toBe(1);
		});
	});

	describe('unmuteEventId()', () => {
		it('should remove an event ID from mutedEventIds', () => {
			muteStore.load([], ['event-1', 'event-2']);
			muteStore.unmuteEventId('event-1');
			const state = get(muteStore);
			expect(state.mutedEventIds.has('event-1')).toBe(false);
			expect(state.mutedEventIds.has('event-2')).toBe(true);
		});

		it('should be a no-op when the event ID is not muted', () => {
			muteStore.load([], ['event-1']);
			muteStore.unmuteEventId('event-not-muted');
			expect(get(muteStore).mutedEventIds.size).toBe(1);
		});
	});

	describe('isMuted()', () => {
		it('should return true for a muted pubkey', () => {
			muteStore.load(['pubkey-muted'], []);
			const state = get(muteStore);
			expect(muteStore.isMuted('pubkey-muted', state)).toBe(true);
		});

		it('should return false for a non-muted pubkey', () => {
			muteStore.load(['pubkey-muted'], []);
			const state = get(muteStore);
			expect(muteStore.isMuted('pubkey-clean', state)).toBe(false);
		});

		it('should return false when the mute list is empty', () => {
			const state = get(muteStore);
			expect(muteStore.isMuted('any-pubkey', state)).toBe(false);
		});
	});

	describe('isEventMuted()', () => {
		it('should return true for a muted event ID', () => {
			muteStore.load([], ['event-muted']);
			const state = get(muteStore);
			expect(muteStore.isEventMuted('event-muted', state)).toBe(true);
		});

		it('should return false for a non-muted event ID', () => {
			muteStore.load([], ['event-muted']);
			const state = get(muteStore);
			expect(muteStore.isEventMuted('event-clean', state)).toBe(false);
		});
	});

	describe('reset()', () => {
		it('should clear all muted pubkeys', () => {
			muteStore.load(['pubkey-a', 'pubkey-b'], []);
			muteStore.reset();
			expect(get(muteStore).mutedPubkeys.size).toBe(0);
		});

		it('should clear all muted event IDs', () => {
			muteStore.load([], ['event-1', 'event-2']);
			muteStore.reset();
			expect(get(muteStore).mutedEventIds.size).toBe(0);
		});

		it('should set isLoaded back to false', () => {
			muteStore.load([], []);
			muteStore.reset();
			expect(get(muteStore).isLoaded).toBe(false);
		});
	});

	describe('reactivity — subscribe', () => {
		it('should notify subscribers when a pubkey is muted', () => {
			const states: boolean[] = [];
			const unsubscribe = muteStore.subscribe((s) => {
				states.push(s.mutedPubkeys.has('pubkey-reactive'));
			});

			muteStore.mutePubkey('pubkey-reactive');
			unsubscribe();

			// First call is the initial value (false), second is after mutation (true)
			expect(states).toContain(true);
		});
	});
});
