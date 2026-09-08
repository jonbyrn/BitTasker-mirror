import { ndk } from '$lib/nostr/ndk';

/**
 * NDK Identity rune — single-writer state holder for the active Nostr signer.
 *
 * The logout flow calls `reset()` after `ndkLogout()` to drop the cached signer
 * reference so a subsequent login does not reuse a stale identity.
 */
class NdkIdentity {
	/** Reset the cached signer reference held by the shared NDK instance. */
	reset(): void {
		if (ndk && typeof ndk === 'object' && 'signer' in ndk) {
			(ndk as { signer: unknown }).signer = undefined;
		}
	}
}

export const ndkIdentity = new NdkIdentity();
