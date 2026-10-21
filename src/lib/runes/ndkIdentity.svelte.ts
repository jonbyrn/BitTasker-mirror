import { ndk, setNDKSigner } from '$lib/nostr/ndk';
import { syncNdkSignerFromAppStore } from '$lib/nostr/ndkSigner';
import { withPasskeyPrompt } from '$lib/utils/keys/passkey-policy';

function formatUnlockError(e: unknown): string {
	if (e instanceof Error) return e.message;
	return String(e);
}

/**
 * NDK identity unlock flow: passkey/biometrics + {@link setNDKSigner}.
 * **Signer presence** is {@link hasSigner} — derived from `ndk.$currentPubkey` only.
 * Local state tracks in-flight unlock and last failure for UI (spinner / retry).
 */
class NdkIdentity {
	/** Last unlock attempt error; cleared on retry or when a signer is already present. */
	unlockError = $state<string | null>(null);

	private unlockInFlight = $state(false);
	private ensureInFlight: Promise<void> | null = null;

	/** True when NDK has a signer loaded (same signal as subscriptions that gate on pubkey). */
	hasSigner = $derived(!!ndk.$currentPubkey);

	/** True while {@link setNDKSigner} is running after the user chose to load keys. */
	isUnlocking = $derived(this.unlockInFlight);

	/**
	 * Ensures NDK has a signer: first tries {@link syncNdkSignerFromAppStore} (keys already in memory
	 * from wallet or another flow), then {@link setNDKSigner} / passkey if still missing.
	 */
	async ensureSigner(options?: { interactive?: boolean }): Promise<void> {
		if (ndk.$currentPubkey) {
			this.unlockError = null;
			return;
		}
		if (this.ensureInFlight) return this.ensureInFlight;

		this.unlockError = null;
		this.unlockInFlight = true;

		this.ensureInFlight = (async () => {
			try {
				await syncNdkSignerFromAppStore();
				if (!ndk.$currentPubkey && options?.interactive) {
					await withPasskeyPrompt('unlock', () => setNDKSigner());
				}
			} catch (e) {
				this.unlockError = formatUnlockError(e);
			} finally {
				this.unlockInFlight = false;
				this.ensureInFlight = null;
			}
		})();

		return this.ensureInFlight;
	}

	/** Call after {@link ndkLogout} so a new session can run {@link ensureSigner} again. */
	reset(): void {
		this.ensureInFlight = null;
		this.unlockError = null;
		this.unlockInFlight = false;
	}
}

export const ndkIdentity = new NdkIdentity();
