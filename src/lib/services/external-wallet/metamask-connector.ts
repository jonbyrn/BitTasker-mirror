/**
 * MetaMask Connector — @metamask/connect-multichain SDK
 *
 * Uses the Multichain SDK for one-prompt multi-chain connection.
 * Supports RSK (30/31), BSC (56/97), Ethereum (1) simultaneously.
 * No more wallet_switchEthereumChain — balances for all chains at once.
 */

import type { ConnectorHandle, EVMTransactionRequest, EVMTransactionResult } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { sendLock } from '$lib/services/external-wallet/send-lock';

// ---------------------------------------------------------------------------
// Multichain SDK (lazy-loaded — no static import to prevent SSR crashes)
// ---------------------------------------------------------------------------

type MultiChainClient = Awaited<
	ReturnType<typeof import('@metamask/connect-multichain').createMultichainClient>
>;
let clientPromise: Promise<MultiChainClient> | null = null;

export interface ConnectMetaMaskConfig {
	registry: ConnectorRegistry;
	onEvent: (event: { type: string; accounts?: string[]; chainId?: number }) => void;
}

const DEFAULT_SCOPES = ['eip155:30', 'eip155:31', 'eip155:56', 'eip155:97', 'eip155:1'] as const;

async function getClient(): Promise<MultiChainClient> {
	// Deferred promise prevents race on concurrent connectMetaMask calls
	if (!clientPromise) {
		const { createMultichainClient: createClient } = await import('@metamask/connect-multichain');
		clientPromise = createClient({
			dapp: {
				name: 'BitTasker',
				url: typeof window !== 'undefined' ? window.location.href : 'https://bittasker.com'
			},
			api: {
				supportedNetworks: {
					'eip155:30': 'https://rpc.mainnet.rootstock.io',
					'eip155:31': 'https://rpc.testnet.rootstock.io',
					'eip155:56': 'https://bsc-dataseed1.binance.org',
					'eip155:97': 'https://data-seed-prebsc-1-s1.binance.org:8545',
					'eip155:1': 'https://mainnet.infura.io/v3/' + (import.meta.env.VITE_INFURA_API_KEY || '')
				}
			}
		});
	}
	return clientPromise;
}

/**
 * Connect MetaMask with multi-chain scopes.
 * Single approval prompt for all supported chains.
 */
export async function connectMetaMask(config: ConnectMetaMaskConfig): Promise<ConnectorHandle> {
	// Try Multichain SDK first with correct API per package README.
	// Falls back to window.ethereum if SDK connect() fails.
	let accounts: string[] = [];
	let chainIds: number[] = [];
	let useSDK = false;
	let sdkClient: Awaited<ReturnType<typeof getClient>> | null = null;

	try {
		sdkClient = await getClient();
		// Per README: client.connect(scopes, caipAccountIds) — scopes are string[]
		await (sdkClient.connect as unknown as (scopes: string[], accounts: never[]) => Promise<void>)(
			DEFAULT_SCOPES as unknown as string[],
			[]
		);
		useSDK = true;
		console.log(
			'[MetaMask] SDK connected. Status:',
			(sdkClient as unknown as Record<string, unknown>).status
		);

		// SDK uses wallet_sessionChanged event for session updates
		sdkClient.on(
			'wallet_sessionChanged' as never,
			((session: unknown) => {
				const s = session as { sessionScopes?: Record<string, { accounts?: string[] }> };
				if (s?.sessionScopes) {
					for (const scopeId of Object.keys(s.sessionScopes)) {
						const scopeAccts = s.sessionScopes[scopeId]?.accounts ?? [];
						for (const acct of scopeAccts) {
							const addr = acct.includes(':')
								? acct.split(':').pop()!.toLowerCase()
								: acct.toLowerCase();
							if (!accounts.includes(addr)) accounts.push(addr);
						}
					}
					config.onEvent({ type: 'accountsChanged', accounts });
				}
			}) as (...a: unknown[]) => void
		);
	} catch (sdkErr) {
		console.warn('[MetaMask] SDK connect failed, falling back to window.ethereum:', sdkErr);
		useSDK = false;
	}

	if (!useSDK) {
		const ethereum = (
			window as {
				ethereum?: {
					request(args: { method: string; params?: unknown[] }): Promise<unknown>;
					chainId?: string;
					on?(event: string, cb: (...a: unknown[]) => void): void;
					removeListener?(event: string, cb: (...a: unknown[]) => void): void;
				};
			}
		).ethereum;
		if (!ethereum) throw new Error('MetaMask not detected');
		const rawAccounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
		if (!rawAccounts || rawAccounts.length === 0) throw new Error('No account authorized');
		accounts = rawAccounts.map((a) => a.toLowerCase());
		const hexId = ethereum.chainId ?? '0x1e';
		chainIds = [parseInt(hexId, 16)];
		console.log(
			'[MetaMask] Connected via EIP-1193 fallback. Accounts:',
			accounts,
			'Chain:',
			chainIds
		);
		// Wire events
		ethereum.on?.('accountsChanged', ((accts: unknown) => {
			if (!(accts as string[]).length && accounts.length > 0) {
				config.onEvent({ type: 'disconnect' });
			}
		}) as (...a: unknown[]) => void);
	}

	const address = accounts[0];
	const connectorId = `metamask-${address}`;

	const evmSigner = {
		type: 'evm' as const,
		label: 'MetaMask',
		address,
		chainId: chainIds[0] ?? 30,
		getAddress(): string {
			return address;
		},
		isConnected(): boolean {
			return true;
		},
		async sendTransaction(tx: EVMTransactionRequest): Promise<EVMTransactionResult> {
			sendLock.acquire(connectorId, () => {});
			try {
				const scope = `eip155:${tx.chainId}`;
				const txParams: Record<string, unknown> = { from: address, to: tx.to };
				if (tx.value) txParams.value = '0x' + tx.value.toString(16);
				if (tx.data) txParams.data = tx.data;

				// SDK path: invokeMethod({ scope, request: { method, params } }) per README
				if (useSDK && sdkClient) {
					const invoke = sdkClient.invokeMethod as unknown as (opts: {
						scope: string;
						request: { method: string; params: unknown[] };
					}) => Promise<string>;
					const txHash = await invoke({
						scope,
						request: { method: 'eth_sendTransaction', params: [txParams] }
					});
					return { txHash, from: address, chainId: tx.chainId };
				}

				// EIP-1193 fallback
				const ethereum = (
					window as {
						ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
					}
				).ethereum;
				if (!ethereum) throw new Error('MetaMask provider not available');
				const txHash = (await ethereum.request({
					method: 'eth_sendTransaction',
					params: [txParams]
				})) as string;
				return { txHash, from: address, chainId: tx.chainId };
			} finally {
				sendLock.release(connectorId);
			}
		}
	} as ConnectorHandle['evmSigner'];

	const rpcUrl = 'https://rpc.testnet.rootstock.io';
	let rpcProvider: { getBalance(addr: string, block?: string): Promise<bigint> } | null = null;
	try {
		const ethersModule = await import('ethers');
		rpcProvider = new ethersModule.JsonRpcProvider(rpcUrl) as unknown as {
			getBalance(addr: string, block?: string): Promise<bigint>;
		};
	} catch {
		/* no-op */
	}

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'MetaMask',
		walletType: 'metamask',
		address,
		chainIds,
		provider: rpcProvider != null ? (rpcProvider as unknown as import('ethers').Provider) : null,
		evmSigner,
		onEvent: config.onEvent,
		unsubscribe() {
			if (useSDK && sdkClient) sdkClient.disconnect().catch(() => {});
			clientPromise = null;
			sdkClient = null;
		}
	};
	return handle;
}

export { getChainIdForNetwork, encodeERC20Transfer, getUSDTContractAddress } from './chain-utils';
