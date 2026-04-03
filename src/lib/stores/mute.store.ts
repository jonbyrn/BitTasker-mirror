/**
 * Mute Store — NIP-51 Kind 10000
 *
 * Stores the current user's mute list in memory as reactive Sets.
 * Populated on login by fetching the user's kind 10000 event from the relay.
 * Updated optimistically when the user mutes a pubkey or event.
 *
 * All task/bid/message feeds should filter against this store before rendering.
 */

import { writable } from 'svelte/store';

interface MuteState {
	/** Pubkeys the user has muted */
	mutedPubkeys: Set<string>;
	/** Specific event IDs the user has muted */
	mutedEventIds: Set<string>;
	/** True once the kind 10000 fetch has completed (even if the user has no mute list) */
	isLoaded: boolean;
}

const initialState: MuteState = {
	mutedPubkeys: new Set(),
	mutedEventIds: new Set(),
	isLoaded: false
};

function createMuteStore() {
	const { subscribe, set, update } = writable<MuteState>(initialState);

	return {
		subscribe,

		/**
		 * Replace the entire mute list (called after fetching kind 10000 from relay).
		 */
		load(pubkeys: string[], eventIds: string[]) {
			set({
				mutedPubkeys: new Set(pubkeys),
				mutedEventIds: new Set(eventIds),
				isLoaded: true
			});
		},

		/**
		 * Optimistically add a pubkey to the mute list.
		 * Call this immediately after publishing the updated kind 10000.
		 */
		mutePubkey(pubkey: string) {
			update((state) => ({
				...state,
				mutedPubkeys: new Set([...state.mutedPubkeys, pubkey])
			}));
		},

		/**
		 * Optimistically add an event ID to the mute list.
		 */
		muteEventId(eventId: string) {
			update((state) => ({
				...state,
				mutedEventIds: new Set([...state.mutedEventIds, eventId])
			}));
		},

		/**
		 * Remove a pubkey from the mute list (undo mute).
		 */
		unmutePubkey(pubkey: string) {
			update((state) => {
				const next = new Set(state.mutedPubkeys);
				next.delete(pubkey);
				return { ...state, mutedPubkeys: next };
			});
		},

		/**
		 * Remove an event ID from the mute list (undo hide).
		 */
		unmuteEventId(eventId: string) {
			update((state) => {
				const next = new Set(state.mutedEventIds);
				next.delete(eventId);
				return { ...state, mutedEventIds: next };
			});
		},

		/**
		 * Returns true if the given pubkey is muted.
		 * Use this in derived stores or component logic.
		 */
		isMuted(pubkey: string, state: MuteState): boolean {
			return state.mutedPubkeys.has(pubkey);
		},

		/**
		 * Returns true if the given event ID is muted.
		 */
		isEventMuted(eventId: string, state: MuteState): boolean {
			return state.mutedEventIds.has(eventId);
		},

		/**
		 * Reset to initial state on logout.
		 */
		reset() {
			set(initialState);
		}
	};
}

export const muteStore = createMuteStore();
