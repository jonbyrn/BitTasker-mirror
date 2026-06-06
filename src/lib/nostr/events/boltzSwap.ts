import NDK, { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';

/** Parameterized replaceable kind 30078 — encrypted Boltz swap snapshots. */
export class NDKBoltzSwap extends NDKEvent {
	static kind = KINDS.PENDING_SWAPS;
	static kinds = [KINDS.PENDING_SWAPS];

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= KINDS.PENDING_SWAPS;
	}

	get swapId(): string | undefined {
		return this.tagValue('d');
	}

	get swapTypeTag(): string | undefined {
		return this.tagValue('t');
	}

	get statusTag(): string | undefined {
		return this.tagValue('s');
	}
}
