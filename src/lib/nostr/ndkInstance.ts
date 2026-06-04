import { browser } from '$app/environment';
import { createNDK } from '@nostr-dev-kit/svelte';
import { registerEventClass } from '@nostr-dev-kit/ndk';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';
import { NDKBid } from './events/bid';
import { NDKTask } from './events/task';
import { NDKPaymentContract } from './events/contract';
import { NDKContractStatus } from './events/contractStatus';

/** IndexedDB base name for NDKCacheDexie — must match signer setup (`${name}_modules`). */
export function ndkCacheDbBaseName(npub: string): string {
	return `cache-${npub.slice(0, 8)}`;
}

const explicitRelayUrls = resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

export const ndk = createNDK({
	explicitRelayUrls,
	session: true,
	enableOutboxModel: false
});

/** NDK 3 typings expect sync `from`; our classes use async `from` (valid at runtime). */
registerEventClass(NDKBid as never);
registerEventClass(NDKTask as never);
registerEventClass(NDKPaymentContract as never);
registerEventClass(NDKContractStatus as never);

if (browser && explicitRelayUrls.length > 0) {
	ndk.connect();
}
