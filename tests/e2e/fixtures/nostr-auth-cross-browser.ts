import type { Page } from '@playwright/test';
import { test as passkeyTest, expect } from './passkey-auth-cross-browser';
import {
	nostrCredentialsFileExists,
	readNostrCredentialSet
} from '../utils/nostr-test-credentials';

export { nostrCredentialsFileExists };

export const NOSTR_CREDENTIALS_MISSING_MESSAGE =
	'Nostr credential file not found. Run 01-signup-onboarding.spec.ts first to generate tests/e2e/.auth/nostr-credentials.json';

type NostrCrossBrowserFixtures = {
	nostrCredentialLabel: string;
	authenticatedPageNostrCrossBrowser: import('@playwright/test').Page;
};

async function hydrateNostrBiometricData(
	page: Page,
	nsec: string,
	credentialId: string
): Promise<void> {
	await page.evaluate(
		async ({ nsecValue, credentialIdValue }) => {
			const [
				{ decodeNsec },
				{ deriveWalletFromNostr },
				{ encryptMasterKeyData },
				{ appStore },
				{ persistE2EBiometricData }
			] = await Promise.all([
				import('/src/lib/utils/nostr.ts'),
				import('/src/lib/utils/helpers/crypto.ts'),
				import('/src/lib/utils/helpers/auth.ts'),
				import('/src/lib/stores/app.store.ts'),
				import('/src/lib/utils/helpers/e2eBiometricState.ts')
			]);
			const { getPublicKey } = await import('/node_modules/nostr-tools/lib/esm/index.js');

			const privateKey = decodeNsec(nsecValue);
			const npub = getPublicKey(privateKey);
			const mnemonic = await deriveWalletFromNostr(nsecValue);
			const { encryptedData, exportedKey } = await encryptMasterKeyData(
				nsecValue,
				mnemonic,
				nsecValue
			);

			const biometricData = {
				npub,
				encryptedData,
				exportedKey,
				credentialId: credentialIdValue
			};

			appStore.update((state) => ({
				...state,
				biometricData
			}));
			await persistE2EBiometricData(biometricData);
		},
		{ nsecValue: nsec, credentialIdValue: credentialId }
	);
}

const test = passkeyTest.extend<NostrCrossBrowserFixtures>({
	nostrCredentialLabel: ['nostr', { option: true }],

	authenticatedPageNostrCrossBrowser: async (
		{ authenticatedPageCrossBrowser, crossBrowserAuthBundle, nostrCredentialLabel },
		use,
		testInfo
	) => {
		if (!nostrCredentialsFileExists()) {
			testInfo.skip(true, NOSTR_CREDENTIALS_MISSING_MESSAGE);
		}

		const credentialSet = readNostrCredentialSet(nostrCredentialLabel);
		if (!credentialSet?.nsec) {
			throw new Error(
				`${NOSTR_CREDENTIALS_MISSING_MESSAGE} Requested label "${nostrCredentialLabel}" has no nsec entry.`
			);
		}

		const credentialId =
			crossBrowserAuthBundle.storageEntries.find(
				(entry) => entry.name === 'CapacitorStorage.webAuthnCredentialId'
			)?.value ?? '';

		await expect(authenticatedPageCrossBrowser).toHaveURL(/\/dashboard(?:\?.*)?$/);
		await hydrateNostrBiometricData(
			authenticatedPageCrossBrowser,
			credentialSet.nsec,
			credentialId
		);
		await use(authenticatedPageCrossBrowser);
	}
});

export { test, expect };
