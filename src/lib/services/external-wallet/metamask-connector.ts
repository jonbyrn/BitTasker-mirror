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
// Multichain SDK
// ---------------------------------------------------------------------------

import { createMultichainClient } from '@metamask/connect-multichain';

type MultiChainClient = Awaited<ReturnType<typeof createMultichainClient>>;
let multichainClient: MultiChainClient | null = null;
let clientPromise: Promise<MultiChainClient> | null = null;

export interface ConnectMetaMaskConfig {
	registry: ConnectorRegistry;
	onEvent: (event: { type: string; accounts?: string[]; chainId?: number }) => void;
}

const DEFAULT_SCOPES = ['eip155:30', 'eip155:31', 'eip155:56', 'eip155:97', 'eip155:1'] as const;

async function getClient(): Promise<MultiChainClient> {
	// Deferred promise prevents race on concurrent connectMetaMask calls
	if (!clientPromise) {
		clientPromise = createMultichainClient({
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
		clientPromise.then((c) => {
			multichainClient = c;
		});
	}
	return clientPromise;
}

/**
 * Connect MetaMask with multi-chain scopes.
 * Single approval prompt for all supported chains.
 */
export async function connectMetaMask(config: ConnectMetaMaskConfig): Promise<ConnectorHandle> {
	const client = await getClient();

	// Request a CAIP-25 session with all configured scopes
	const connectFn = client.connect as unknown as (
		scopes: string[],
		accounts: never[]
	) => Promise<void>;
	await connectFn(DEFAULT_SCOPES as unknown as string[], []);

	// Get session to find authorized accounts
	const provider = client.provider as unknown as {
		getSession(): Promise<{ sessionScopes: Record<string, { accounts: string[] }> }>;
	};
	const session = await provider.getSession();

	// Collect accounts from all scopes
	const accounts: string[] = [];
	const chainIds: number[] = [];
	// Include both default scopes + any user-approved extras
	const scopeKeys = new Set([...DEFAULT_SCOPES, ...Object.keys(session.sessionScopes)]);
	for (const scopeId of scopeKeys) {
		const scope = session.sessionScopes[scopeId];
		if (scope?.accounts) {
			for (const acct of scope.accounts) {
				// Parse CAIP-10: "eip155:30:0xabc..." → "0xabc..."
				const addr = acct.includes(':') ? acct.split(':').pop()!.toLowerCase() : acct.toLowerCase();
				if (!accounts.includes(addr)) accounts.push(addr);
			}
			// Extract chain ID from CAIP-2 scope (eip155:30 → 30)
			const chainId = parseInt(scopeId.split(':')[1], 10);
			if (!chainIds.includes(chainId)) chainIds.push(chainId);
		}
	}

	if (accounts.length === 0)
		throw new Error('No accounts authorized. Please approve the connection in MetaMask.');

	const rawAddr = accounts[0];
	// Parse CAIP-10 format: "eip155:30:0xabc..." → "0xabc..."
	const address = (rawAddr.includes(':') ? rawAddr.split(':').pop()! : rawAddr).toLowerCase();
	const connectorId = `metamask-${address}`;

	// Listen for session events
	client.on('session_update' as never, async () => {
		try {
			const upd = await provider.getSession();
			const current: string[] = [];
			for (const s of Object.keys(upd.sessionScopes)) {
				for (const a of upd.sessionScopes[s].accounts) {
					const ad = a.includes(':') ? a.split(':').pop()!.toLowerCase() : a.toLowerCase();
					if (!current.includes(ad)) current.push(ad);
				}
			}
			config.onEvent({ type: 'accountsChanged', accounts: current });
		} catch {
			// best-effort
		}
	});

	client.on('disconnect' as never, () => {
		config.onEvent({ type: 'disconnect' });
	});

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
				const txParams: Record<string, unknown> = {
					from: address,
					to: tx.to
				};
				if (tx.value) txParams.value = '0x' + tx.value.toString(16);
				if (tx.data) txParams.data = tx.data;

				const invokeMethod = client.invokeMethod as unknown as (
					scope: string,
					method: string,
					params: unknown[]
				) => Promise<string>;

				const txHash = await invokeMethod(scope, 'eth_sendTransaction', [txParams]);
				return { txHash, from: address, chainId: tx.chainId };
			} finally {
				sendLock.release(connectorId);
			}
		}
	};

	// Create an ethers JsonRpcProvider for balance polling.
	// The Multichain SDK doesn't expose an ethers Provider, so we
	// use the known RPC URL for the first configured scope.
	const rpcUrl =
		typeof window !== 'undefined'
			? 'https://rpc.testnet.rootstock.io'
			: 'https://rpc.testnet.rootstock.io';
	let rpcProvider: { getBalance(addr: string, block?: string): Promise<bigint> } | null = null;
	try {
		const ethersModule = await import('ethers');
		rpcProvider = new ethersModule.JsonRpcProvider(rpcUrl) as unknown as {
			getBalance(addr: string, block?: string): Promise<bigint>;
		};
	} catch {
		// ethers not available — balances will be queried via SDK
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
			client.disconnect().catch(() => {});
			multichainClient = null;
		}
	};

	return handle;
}

/**
 * Check if MetaMask is available via the Multichain SDK.
 */
export function isMetaMaskAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	const ethereum = (window as { ethereum?: { isMetaMask?: boolean } }).ethereum;
	return !!ethereum?.isMetaMask;
}

// ---------------------------------------------------------------------------
// Network-to-Chain Mapping
// ---------------------------------------------------------------------------

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
		default:
			return rskNetwork === 'mainnet' ? 30 : 31;
	}
}

/**
 * BSC USDT contract address for the current network.
 */
export function getUSDTContractAddress(): string {
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	if (bscNetwork === 'mainnet') {
		return '0x55d398326f99059ff775485246999027b3197955';
	}
	return '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
}

/**
 * Encode an ERC20 transfer call data.
 * Kept for backward compatibility with SendPaymentForm.
 */
export function encodeERC20Transfer(to: string, amount: bigint): string {
	const methodId = 'a9059cbb'; // transfer(address,uint256)
	const paddedTo = to.slice(2).padStart(64, '0');
	const paddedAmount = amount.toString(16).padStart(64, '0');
	return '0x' + methodId + paddedTo + paddedAmount;
}

/**
 * Legacy chain switching — kept for backward compatibility.
 * With Multichain SDK, chain switching is handled by connect() scopes.
 */
export async function ensureEVMChain(
	provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> },
	_targetChainId: number
): Promise<void> {
	// With Multichain SDK, all chains are already available.
	// This function exists only for backward compatibility.
	// The actual switching would use client.connect([scope]) on the Multichain client.
	const client = multichainClient;
	if (!client) return;
	// Reconnect with the target scope included
	try {
		await (client.connect as unknown as (scopes: string[], accounts: never[]) => Promise<void>)(
			['eip155:' + _targetChainId, ...DEFAULT_SCOPES] as unknown as string[],
			[]
		);
	} catch {
		// Silently handle — multichain sessions are persistent
	}
}
