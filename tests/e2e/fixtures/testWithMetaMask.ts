/**
 * Custom Playwright test fixture that extends Synpress with a MetaMask instance.
 * Provides `metamask` fixture for tests that need MetaMask interaction.
 */

import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import metamaskLocalSetup from '../wallet-setup/metamask-local.setup';

export const testWithMetaMask = testWithSynpress(metaMaskFixtures(metamaskLocalSetup)).extend<{
	metamask: MetaMask;
}>({
	metamask: async ({ context, metamaskPage, extensionId }, use) => {
		const metamask = new MetaMask(
			context,
			metamaskPage,
			metamaskLocalSetup.walletPassword,
			extensionId
		);
		await use(metamask);
	}
});
