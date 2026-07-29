/**
 * MetaMask wallet setup for local Hardhat node testing.
 *
 * This setup:
 *   1. Imports the Hardhat default mnemonic (20 accounts with 10,000 ETH each)
 *   2. Adds "Local Arbitrum" network (chain ID 31337, RPC http://127.0.0.1:8545)
 *   3. Switches to that network
 *
 * The first derived account is 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 * which has 10,000 ETH on the local Hardhat node.
 *
 * Build cache: npx synpress tests/e2e/wallet-setup
 * Run tests:   npx playwright test tests/e2e/wallet/metamask-balance-e2e.spec.ts --project=chromium
 */

import { defineWalletSetup } from '@synthetixio/synpress';
import { MetaMask } from '@synthetixio/synpress/playwright';

// Hardhat default mnemonic — first account = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
const SEED_PHRASE = 'test test test test test test test test test test test junk';
const WALLET_PASSWORD = 'Tester@1234';

// Local Hardhat network config (must match meta-tx-relay/contracts Hardhat node)
const LOCAL_NETWORK = {
	name: 'Local Arbitrum',
	rpcUrl: 'http://127.0.0.1:8545',
	chainId: 31337,
	symbol: 'ETH'
};

export default defineWalletSetup(WALLET_PASSWORD, async (context, metamaskPage) => {
	const metamask = new MetaMask(context, metamaskPage, WALLET_PASSWORD);

	// Import wallet using Hardhat default seed phrase.
	// addNetwork() has selector compatibility issues with MetaMask v13.13.1.
	// Network addition and switching is handled in the test itself.
	await metamask.importWallet(SEED_PHRASE);
});
