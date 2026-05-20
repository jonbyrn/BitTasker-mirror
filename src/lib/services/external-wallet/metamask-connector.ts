/**
 * MetaMask Connector — EIP-6963 + window.ethereum fallback
 *
 * Uses EIP-6963 multi-wallet discovery as primary, falls back to window.ethereum.
 * ethers v6 BrowserProvider wraps the EIP-1193 provider.
 * Provides chain switching for RSK, event handling, and proper cleanup.
 *
 * @module metamask-connector
 */

import type { ethers } from 'ethers';
import type {
	ConnectorHandle,
	ConnectorEvent,
	EVMSigner,
	EVMTransactionRequest,
	EVMTransactionResult
} from './types';
import type { ConnectorRegistry } from './connector-registry';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface MetaMaskProvider {
	isMetaMask?: boolean;
	isConnected?: () => boolean;
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	on: (event: string, cb: (...args: unknown[]) => void) => void;
	removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
	chainId?: string;
	selectedAddress?: string;
}

// ---------------------------------------------------------------------------
// Chain Configuration
// ---------------------------------------------------------------------------

interface ChainParams {
	chainIdHex: string;
	chainId: number;
	chainName: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
	rpcUrls: string[];
	blockExplorerUrls: string[];
}

const RSK_MAINNET: ChainParams = {
	chainId: 30,
	chainIdHex: '0x1e',
	chainName: 'Rootstock Mainnet',
	nativeCurrency: { name: 'Rootstock Bitcoin', symbol: 'RBTC', decimals: 18 },
	rpcUrls: ['https://rpc.mainnet.rootstock.io'],
	blockExplorerUrls: ['https://explorer.rootstock.io']
};

const RSK_TESTNET: ChainParams = {
	chainId: 31,
	chainIdHex: '0x1f',
	chainName: 'Rootstock Testnet',
	nativeCurrency: { name: 'Rootstock Bitcoin', symbol: 'tRBTC', decimals: 18 },
	rpcUrls: ['https://rpc.testnet.rootstock.io'],
	blockExplorerUrls: ['https://explorer.testnet.rootstock.io']
};

const BSC_MAINNET: ChainParams = {
	chainId: 56,
	chainIdHex: '0x38',
	chainName: 'BNB Smart Chain',
	nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
	rpcUrls: ['https://bsc-dataseed1.binance.org'],
	blockExplorerUrls: ['https://bscscan.com']
};

const BSC_TESTNET: ChainParams = {
	chainId: 97,
	chainIdHex: '0x61',
	chainName: 'BNB Smart Chain Testnet',
	nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
	rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
	blockExplorerUrls: ['https://testnet.bscscan.com']
};

const CHAIN_PARAMS_BY_ID: Record<number, ChainParams> = {
	30: RSK_MAINNET,
	31: RSK_TESTNET,
	56: BSC_MAINNET,
	97: BSC_TESTNET
};

// ---------------------------------------------------------------------------
// EIP-6963 Provider Detection
// ---------------------------------------------------------------------------

/**
 * Detect available MetaMask providers using EIP-6963 then window.ethereum fallback.
 *
 * EIP-6963 allows multiple wallets to announce themselves. This function
 * collects all providers that identify as MetaMask. If none found via
 * EIP-6963, falls back to the legacy window.ethereum interface.
 *
 * @returns Array of MetaMask providers (usually 1, but EIP-6963 can yield multiple)
 */
export async function detectMetaMaskProviders(): Promise<MetaMaskProvider[]> {
	if (typeof window === 'undefined') return [];

	const providers: MetaMaskProvider[] = [];

	// EIP-6963: request providers with a timeout
	try {
		const foundProviders = await new Promise<MetaMaskProvider[]>((resolve) => {
			const found: MetaMaskProvider[] = [];

			function handler(event: unknown): void {
				const customEvent = event as CustomEvent;
				const detail = customEvent.detail as {
					info?: { rdns?: string };
					provider?: MetaMaskProvider;
				};
				if (detail?.info?.rdns?.includes('metamask') || detail?.provider?.isMetaMask) {
					found.push(detail.provider as MetaMaskProvider);
				}
			}

			window.addEventListener('eip6963:announceProvider', handler);
			window.dispatchEvent(new Event('eip6963:requestProvider'));

			// Give providers time to respond (300ms should be enough for local extensions)
			setTimeout(() => {
				window.removeEventListener('eip6963:announceProvider', handler);
				resolve(found);
			}, 300);
		});

		providers.push(...foundProviders);
	} catch {
		// EIP-6963 not supported by this browser — fall through to window.ethereum
	}

	// Fallback to window.ethereum if no EIP-6963 providers found
	if (providers.length === 0) {
		const ethereum = (window as { ethereum?: MetaMaskProvider }).ethereum;
		if (ethereum?.isMetaMask) {
			providers.push(ethereum);
		}
	}

	return providers;
}

// ---------------------------------------------------------------------------
// Chain Switching
// ---------------------------------------------------------------------------

/**
 * Get chain configuration parameters for a given chain ID.
 * Reads VITE_RSK_NETWORK env to determine mainnet vs testnet.
 */
function getChainParams(chainId: number): ChainParams | null {
	// For RSK, respect the environment configuration
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	if (chainId === 30 && rskNetwork !== 'mainnet') return null;
	if (chainId === 31 && rskNetwork === 'mainnet') return null;
	if (chainId === 56) return BSC_MAINNET;
	if (chainId === 97) return BSC_TESTNET;

	return CHAIN_PARAMS_BY_ID[chainId] ?? null;
}

/**
 * Ensure the MetaMask provider is connected to the correct chain.
 * Attempts wallet_switchEthereumChain first.
 * If chain not found (error 4902), attempts wallet_addEthereumChain.
 *
 * @param provider - The MetaMask provider
 * @param targetChainId - The target EVM chain ID
 * @throws If chain is unsupported or switching fails
 */
export async function ensureEVMChain(
	provider: MetaMaskProvider,
	targetChainId: number
): Promise<void> {
	const currentChainIdHex = provider.chainId;
	const currentChainId = currentChainIdHex ? parseInt(currentChainIdHex, 16) : null;

	if (currentChainId === targetChainId) return;

	const chainParams = getChainParams(targetChainId);
	if (!chainParams) {
		throw new Error(`Unsupported chain ID: ${targetChainId}. Cannot switch.`);
	}

	try {
		await provider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: chainParams.chainIdHex }]
		});
	} catch (switchError: unknown) {
		const err = switchError as { code?: number; message?: string };
		// Error code 4902: chain not yet added to MetaMask
		if (err.code === 4902) {
			await provider.request({
				method: 'wallet_addEthereumChain',
				params: [
					{
						chainId: chainParams.chainIdHex,
						chainName: chainParams.chainName,
						nativeCurrency: chainParams.nativeCurrency,
						rpcUrls: chainParams.rpcUrls,
						blockExplorerUrls: chainParams.blockExplorerUrls
					}
				]
			});
		} else {
			// User rejected the switch or another error occurred
			throw new Error(err.message || `Failed to switch to chain ${targetChainId}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Network-to-Chain Mapping
// ---------------------------------------------------------------------------

/**
 * Map a detected network string to an EVM chain ID.
 * Handles mainnet/testnet based on VITE_RSK_NETWORK and VITE_BSC_NETWORK.
 */
export function getChainIdForNetwork(network: string): number {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';

	switch (network) {
		case 'rootstock-bitcoin':
			return rskNetwork === 'mainnet' ? 30 : 31;
		case 'usdt-bsc':
			return bscNetwork === 'mainnet' ? 56 : 97;
		case 'usdt-ethereum':
			return rskNetwork === 'mainnet' ? 1 : 11155111;
		case 'usdt-arbitrum':
			return rskNetwork === 'mainnet' ? 42161 : 421614;
		case 'usdt-polygon':
			return rskNetwork === 'mainnet' ? 137 : 80002;
		case 'usdt-optimism':
			return rskNetwork === 'mainnet' ? 10 : 11155420;
		case 'usdt-base':
			return rskNetwork === 'mainnet' ? 8453 : 84532;
		case 'usdt-avalanche':
			return rskNetwork === 'mainnet' ? 43114 : 43113;
		default:
			return rskNetwork === 'mainnet' ? 30 : 31;
	}
}

// ---------------------------------------------------------------------------
// ERC20 Transfer Encoding
// ---------------------------------------------------------------------------

/**
 * Encode an ERC20 transfer function call without requiring ethers.
 *
 * Encodes: transfer(address to, uint256 value)
 * Selector: 0xa9059cbb
 * Parameters: address (left-padded to 32 bytes), uint256 (left-padded to 32 bytes)
 *
 * @param to - Recipient address (0x-prefixed)
 * @param amount - Amount in token's smallest unit (bigint)
 * @returns Hex-encoded transaction data
 */
export function encodeERC20Transfer(to: string, amount: bigint): string {
	const cleanTo = to.toLowerCase().replace('0x', '');
	const toPadded = cleanTo.padStart(64, '0');
	const amountHex = amount.toString(16);
	const amountPadded = amountHex.padStart(64, '0');
	return `0xa9059cbb${toPadded}${amountPadded}`;
}

/**
 * Get the USDT contract address for the active BSC network.
 */
export function getUSDTContractAddress(): string {
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	if (bscNetwork === 'mainnet') {
		return '0x55d398326f99059ff775485246999027b3197955';
	}
	// BSC testnet USDT — deployed at a different address than mainnet
	return '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

export interface ConnectMetaMaskConfig {
	/** The connector registry to register with */
	registry: ConnectorRegistry;
	/**
	 * Callback for connector events (accountsChanged, chainChanged, disconnect).
	 * The caller should handle these events to update application state.
	 */
	onEvent: (event: ConnectorEvent) => void;
}

/**
 * Connect to MetaMask and return a ConnectorHandle.
 *
 * Flow:
 * 1. Detect MetaMask providers (EIP-6963 first, then window.ethereum fallback)
 * 2. Request accounts via eth_requestAccounts
 * 3. Wrap in ethers v6 BrowserProvider for transaction signing
 * 4. Create an EVMSigner that handles chain switching automatically
 * 5. Wire up accountsChanged, chainChanged, disconnect events
 * 6. Return ConnectorHandle with proper unsubscribe() cleanup
 *
 * @param config - Connection configuration
 * @returns ConnectorHandle with EVMSigner and event wiring
 * @throws If MetaMask is not available, user rejects, or connection fails
 */
export async function connectMetaMask(config: ConnectMetaMaskConfig): Promise<ConnectorHandle> {
	const providers = await detectMetaMaskProviders();
	if (providers.length === 0) {
		throw new Error('No MetaMask provider found. Please install MetaMask to continue.');
	}

	const provider = providers[0];

	// Request account access
	const accounts = (await provider.request({
		method: 'eth_requestAccounts'
	})) as string[];

	const address = accounts[0]?.toLowerCase();
	if (!address) {
		throw new Error('No account selected in MetaMask.');
	}

	// Detect current chain
	const chainIdHex = provider.chainId ?? '0x1e';
	const connectedChainId = parseInt(chainIdHex, 16);

	// Dynamically import ethers (large module, lazy load only when connecting)
	const ethersModule = await import('ethers');
	const browserProvider = new ethersModule.BrowserProvider(
		provider as unknown as ethers.Eip1193Provider
	);

	const connectorId = `metamask-${address}`;

	// Build the EVMSigner
	// The signer captures provider for chain switching and signer for tx sending
	const evmSigner: EVMSigner = {
		type: 'evm',
		label: 'MetaMask',
		address,
		chainId: connectedChainId,

		getAddress(): string {
			return address;
		},

		isConnected(): boolean {
			return true;
		},

		async sendTransaction(tx: EVMTransactionRequest): Promise<EVMTransactionResult> {
			// Ensure we're on the correct chain before sending
			await ensureEVMChain(provider, tx.chainId);

			// Build transaction parameters for ethers v6
			const txParams: Record<string, unknown> = {
				from: address,
				to: tx.to
			};

			if (tx.value !== undefined && tx.value > 0n) {
				txParams.value = '0x' + tx.value.toString(16);
			}

			if (tx.data !== undefined && tx.data.length > 2) {
				txParams.data = tx.data;
			}

			// Get a fresh signer each time to handle account switches
			const signer = await browserProvider.getSigner();
			const txResponse = await signer.sendTransaction(
				txParams as unknown as ethers.TransactionRequest
			);
			const TX_WAIT_TIMEOUT_MS = 5 * 60_000; // 5 minutes
			const receipt = await Promise.race([
				txResponse.wait(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error('Transaction confirmation timed out after 5 minutes')),
						TX_WAIT_TIMEOUT_MS
					)
				)
			]);

			return {
				txHash: receipt?.hash || txResponse.hash,
				from: address,
				chainId: tx.chainId
			};
		}
	};

	// -----------------------------------------------------------------------
	// Event Wiring
	// -----------------------------------------------------------------------

	function onAccountsChanged(accts: unknown): void {
		const accountsArr = accts as string[];
		if (accountsArr.length === 0) {
			// All accounts disconnected — wallet was locked or disconnected
			config.onEvent({ type: 'disconnect', reason: 'All accounts disconnected' });
		} else {
			config.onEvent({ type: 'accountsChanged', accounts: accountsArr });
		}
	}

	function onChainChanged(chainIdVal: unknown): void {
		const hexStr = chainIdVal as string;
		const newChainId = parseInt(hexStr, 16);
		// Update the signer's chainId reference
		(evmSigner as { chainId: number }).chainId = newChainId;
		config.onEvent({ type: 'chainChanged', chainId: newChainId });
	}

	function onDisconnect(error?: unknown): void {
		const reason = error instanceof Error ? error.message : 'MetaMask disconnected';
		config.onEvent({ type: 'disconnect', reason });
	}

	provider.on('accountsChanged', onAccountsChanged);
	provider.on('chainChanged', onChainChanged);
	provider.on('disconnect', onDisconnect);

	// -----------------------------------------------------------------------
	// Build Handle
	// -----------------------------------------------------------------------

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'MetaMask',
		walletType: 'metamask',
		address,
		chainIds: [connectedChainId],
		evmSigner,
		bitcoinSigner: undefined,
		provider: browserProvider as unknown as ethers.Provider,
		onEvent: config.onEvent,
		unsubscribe: () => {
			provider.removeListener('accountsChanged', onAccountsChanged);
			provider.removeListener('chainChanged', onChainChanged);
			provider.removeListener('disconnect', onDisconnect);
		}
	};

	return handle;
}
