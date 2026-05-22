/**
 * MetaMask Connector — @metamask/connect-multichain SDK
 *
 * Uses the Multichain SDK for one-prompt multi-chain connection.
 * Supports RSK (30/31), BSC (56/97), Ethereum (1) simultaneously.
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

export async function connectMetaMask(config: ConnectMetaMaskConfig): Promise<ConnectorHandle> {
	const sdkClient = await getClient();

	// Register session listener BEFORE connect() — the SDK may fire the event
	// synchronously during connect() and we'd miss it otherwise.
	let resolveSession: (v: { accounts: string[]; chainIds: number[] }) => void;
	let rejectSession: (e: Error) => void;
	const sessionPromise = new Promise<{ accounts: string[]; chainIds: number[] }>((res, rej) => {
		resolveSession = res;
		rejectSession = rej;
	});
	const timeout = setTimeout(
		() => rejectSession(new Error('Session data timeout — try again')),
		10_000
	);
	sdkClient.on(
		'wallet_sessionChanged' as never,
		((session: unknown) => {
			clearTimeout(timeout);
			const s = session as { sessionScopes?: Record<string, { accounts?: string[] }> };
			const accts: string[] = [];
			const chIds: number[] = [];
			if (s?.sessionScopes) {
				for (const scopeId of Object.keys(s.sessionScopes)) {
					for (const acct of s.sessionScopes[scopeId]?.accounts ?? []) {
						const addr = acct.includes(':')
							? acct.split(':').pop()!.toLowerCase()
							: acct.toLowerCase();
						if (!accts.includes(addr)) accts.push(addr);
					}
					const chainId = parseInt(scopeId.split(':')[1], 10);
					if (!chIds.includes(chainId)) chIds.push(chainId);
				}
			}
			resolveSession({ accounts: accts, chainIds: chIds });
		}) as (...a: unknown[]) => void
	);

	await (sdkClient.connect as unknown as (scopes: string[], accounts: never[]) => Promise<void>)(
		DEFAULT_SCOPES as unknown as string[],
		[]
	);
	console.log(
		'[MetaMask] SDK connected. Status:',
		(sdkClient as unknown as Record<string, unknown>).status
	);

	// Now wait for the session data (event may fire during or after connect)
	const sessionData = await sessionPromise;

	const accounts = sessionData.accounts;
	const chainIds = sessionData.chainIds;
	console.log('[MetaMask] Session ready. Accounts:', accounts, 'Chains:', chainIds);

	if (accounts.length === 0) {
		throw new Error('No accounts authorized. Please approve the connection in MetaMask.');
	}

	const address = accounts[0];
	const connectorId = `metamask-${address}`;

	const evmSigner: ConnectorHandle['evmSigner'] = {
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
				const txParams: Record<string, unknown> = { from: address, to: tx.to };
				if (tx.value) txParams.value = '0x' + tx.value.toString(16);
				if (tx.data) txParams.data = tx.data;

				const invoke = sdkClient.invokeMethod as unknown as (opts: {
					scope: string;
					request: { method: string; params: unknown[] };
				}) => Promise<string>;
				const txHash = await invoke({
					scope: `eip155:${tx.chainId}`,
					request: { method: 'eth_sendTransaction', params: [txParams] }
				});
				return { txHash, from: address, chainId: tx.chainId };
			} finally {
				sendLock.release(connectorId);
			}
		}
	};

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

	return {
		id: connectorId,
		walletName: 'MetaMask',
		walletType: 'metamask',
		address,
		chainIds,
		provider: rpcProvider != null ? (rpcProvider as unknown as import('ethers').Provider) : null,
		evmSigner,
		onEvent: config.onEvent,
		unsubscribe() {
			sdkClient.disconnect().catch(() => {});
			clientPromise = null;
		}
	};
}

export { getChainIdForNetwork, encodeERC20Transfer, getUSDTContractAddress } from './chain-utils';
