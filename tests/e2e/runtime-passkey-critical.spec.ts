import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-runtime-chromium';
import type { RuntimeErrorCollector } from './utils/runtime-error-collector';

test.describe('@runtime-passkey critical runtime passkey checks', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	function expectNoWalletAuthRuntimeErrors(
		collector: RuntimeErrorCollector,
		context: string
	): void {
		const messages = collector.messages();
		expect(messages, `Unexpected wallet/auth runtime errors during ${context}`).toEqual([]);
	}

	test('login reaches dashboard', async ({ runtimePasskeyPage, runtimeErrorCollector }) => {
		const page = runtimePasskeyPage;

		await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
		await expect(page.getByTestId('login-link')).toHaveCount(0);

		expectNoWalletAuthRuntimeErrors(runtimeErrorCollector, 'dashboard login bootstrap');
	});

	test('wallet receive modal opens and Initialization Failed is not visible', async ({
		runtimePasskeyPage,
		runtimeErrorCollector
	}) => {
		const page = runtimePasskeyPage;
		runtimeErrorCollector.clear();

		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/wallet(?:\?.*)?$/);

		const receiveTrigger = page
			.getByTestId('wallet-receive-trigger')
			.or(page.getByRole('button', { name: /^receive$/i }))
			.first();
		await expect(receiveTrigger).toBeVisible({ timeout: 20_000 });
		await receiveTrigger.click();

		const receiveModal = page.getByTestId('wallet-receive-modal').first();
		await expect(receiveModal).toBeVisible({ timeout: 15_000 });

		const initializationFailedMessage = page
			.getByText(/initialization failed|wallet\.error\.initialization_failed/i)
			.first();
		const initFailedVisible = await initializationFailedMessage.isVisible().catch(() => false);
		expect(initFailedVisible).toBeFalsy();

		expectNoWalletAuthRuntimeErrors(runtimeErrorCollector, 'wallet receive modal path');
	});

	test('protected route runtime check stays authenticated after wallet initialization path', async ({
		runtimePasskeyPage,
		runtimeErrorCollector
	}) => {
		const page = runtimePasskeyPage;
		runtimeErrorCollector.clear();

		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/wallet(?:\?.*)?$/);
		await page.reload({ waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/wallet(?:\?.*)?$/);

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
		await expect(page.getByTestId('login-link')).toHaveCount(0);

		expectNoWalletAuthRuntimeErrors(runtimeErrorCollector, 'protected route runtime check');
	});
});
