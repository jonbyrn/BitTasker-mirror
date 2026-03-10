import { test as base, expect } from '@playwright/test';
import {
	getCredentialSetLabels,
	readCredentialSet,
	webauthnCredentialsFileExists
} from '../utils/webauthn-credentials';
import {
	attachRuntimeErrorCollector,
	type RuntimeErrorCollector
} from '../utils/runtime-error-collector';

export { webauthnCredentialsFileExists };

export const CREDENTIALS_MISSING_MESSAGE =
	'WebAuthn credentials file not found. Run 01-signup-onboarding.spec.ts first to generate tests/e2e/.auth/webauthn-credentials.json';

const CHROMIUM_ONLY_MESSAGE =
	'Runtime passkey fixture relies on Chromium CDP virtual authenticators and can only run on Chromium.';

const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

type RuntimePasskeyFixtures = {
	credentialLabel: string;
	runtimePasskeyPage: import('@playwright/test').Page;
	runtimeErrorCollector: RuntimeErrorCollector;
};

const collectorByPage = new WeakMap<import('@playwright/test').Page, RuntimeErrorCollector>();

const test = base.extend<RuntimePasskeyFixtures>({
	credentialLabel: ['signup', { option: true }],

	runtimePasskeyPage: async ({ browser, credentialLabel }, use, testInfo) => {
		if (browser.browserType().name() !== 'chromium') {
			testInfo.skip(true, CHROMIUM_ONLY_MESSAGE);
		}
		if (!webauthnCredentialsFileExists()) {
			testInfo.skip(true, CREDENTIALS_MISSING_MESSAGE);
		}

		const credentials = readCredentialSet(credentialLabel);
		if (!credentials || credentials.length === 0) {
			const availableLabels = getCredentialSetLabels();
			throw new Error(
				`${CREDENTIALS_MISSING_MESSAGE} (requested label: ${credentialLabel}; available labels: ${
					availableLabels.length > 0 ? availableLabels.join(', ') : 'none'
				})`
			);
		}

		const baseURL = testInfo.project.use.baseURL ?? 'http://localhost:4173';
		const context = await browser.newContext({
			baseURL,
			storageState: undefined,
			viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 },
			userAgent: testInfo.project.use.userAgent
		});
		const page = await context.newPage();
		const collector = attachRuntimeErrorCollector(page);
		collectorByPage.set(page, collector);
		const cdpSession = await context.newCDPSession(page);

		try {
			await cdpSession.send('WebAuthn.enable');
			const result = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			const authenticatorId = result?.authenticatorId ?? null;
			if (!authenticatorId) {
				throw new Error('Failed to create a virtual authenticator for runtime passkey fixture.');
			}

			await cdpSession.send('WebAuthn.setAutomaticPresenceSimulation', {
				authenticatorId,
				enabled: true
			});

			for (const credential of credentials) {
				await cdpSession.send('WebAuthn.addCredential', {
					authenticatorId,
					credential
				});
			}

			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-continue-passkey').click();
			await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });

			const understandBtn = page.getByRole('button', {
				name: 'I understand',
				exact: true
			});
			await understandBtn.click({ timeout: 5_000 }).catch(() => {});

			await use(page);
		} finally {
			collector.dispose();
			collectorByPage.delete(page);
			await context.close().catch(() => {});
		}
	},

	runtimeErrorCollector: async ({ runtimePasskeyPage }, use) => {
		const collector = collectorByPage.get(runtimePasskeyPage);
		if (!collector) {
			throw new Error('Runtime error collector was not initialized for runtimePasskeyPage.');
		}
		await use(collector);
	}
});

export { test, expect };
