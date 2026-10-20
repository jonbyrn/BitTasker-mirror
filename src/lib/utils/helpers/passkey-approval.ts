import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getBiometricData } from '$lib/utils/helpers/biometrics';

const STEP_UP_WINDOW_MS = 60_000;
let approvedUntil = 0;

/**
 * Step-up for funding, escrow writes, and wallet sends.
 * A successful approval covers the next minute so a relay fallback does not prompt twice.
 * Routine page loads and Nostr reads must not call this.
 */
export async function requirePasskeyApproval(): Promise<void> {
	if (Date.now() < approvedUntil) return;
	if (import.meta.env.VITE_E2E_TEST === 'true' || import.meta.env.VITE_BYPASS_PASSKEY === 'true')
		return;
	if (typeof window !== 'undefined' && '__PLAYWRIGHT_TEST__' in window) return;

	const { value: credentialId } = await Preferences.get({
		key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
	});
	const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentialId
		? [{ id: credentialId, type: 'public-key' }]
		: [];
	const credentials = await getBiometricData(true, allowCredentials);
	if (!credentials) throw new Error('Passkey approval is required to move funds');
	approvedUntil = Date.now() + STEP_UP_WINDOW_MS;
}
