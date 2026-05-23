/**
 * MetaMask Connector — @metamask/connect-multichain SDK
 *
 * Uses the Multichain SDK for one-prompt multi-chain connection.
 * Supports RSK (30/31), BSC (56/97), Ethereum (1) simultaneously.
 */

import type { ConnectorHandle, EVMTransactionRequest, EVMTransactionResult } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { sendLock } from '$lib/services/external-wallet/send-lock';
import { getUSDTContractAddress } from './chain-utils';

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
			ui: {
				headless: true, // No SDK modal — we show our own connect UI
				preferExtension: true // Use browser extension (MetaMask), not QR
			},
			api: {
				supportedNetworks: {
					'eip155:30': 'https://public-node.rsk.co',
					'eip155:31': 'https://public-node.testnet.rsk.co',
					'eip155:56': 'https://bsc-dataseed.binance.org',
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

				const txHash = (await sdkClient.invokeMethod({
					scope: `eip155:${tx.chainId}`,
					request: { method: 'eth_sendTransaction', params: [txParams] }
				})) as unknown as string;
				return { txHash, from: address, chainId: tx.chainId };
			} finally {
				sendLock.release(connectorId);
			}
		}
	};

	return {
		id: connectorId,
		walletName: 'MetaMask',
		walletType: 'metamask',
		address,
		chainIds,
		provider: null,
		evmSigner,
		onEvent: config.onEvent,
		unsubscribe() {
			sdkClient.disconnect().catch(() => {});
			clientPromise = null;
		},
		// SDK balance fetcher — the poller calls this instead of provider.getBalance
		async fetchBalances(): Promise<
			Record<string, { raw: string; formatted: string; loading: boolean }>
		> {
			const result: Record<string, { raw: string; formatted: string; loading: boolean }> = {};
			console.log('[MetaMask] fetchBalances: querying chains', chainIds, 'address', address);
			// rBTC on RSK — get native balance
			for (const chainId of chainIds.filter((c) => c === 30 || c === 31)) {
				try {
					const hexBalance = (await sdkClient.invokeMethod({
						scope: `eip155:${chainId}`,
						request: { method: 'eth_getBalance', params: [address, 'latest'] }
					})) as unknown as string;
					const raw = BigInt(hexBalance || '0x0');
					const sats = Number(raw / 10_000_000_000n); // wei → sats (1e10)
					result.rbtc = {
						raw: String(sats),
						formatted: sats.toLocaleString('en-US') + ' Sats',
						loading: false
					};
				} catch (e) {
					console.warn('[MetaMask] fetchBalances rBTC failed for chain', chainId, e);
				}
			}

			// USDT on BSC — ERC20 balanceOf
			const usdtContract = getUSDTContractAddress();
			const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2);
			for (const chainId of chainIds.filter((c) => c === 56 || c === 97)) {
				try {
					const hexBalance = (await sdkClient.invokeMethod({
						scope: `eip155:${chainId}`,
						request: {
							method: 'eth_call',
							params: [{ to: usdtContract, data: balanceOfData }, 'latest']
						}
					})) as unknown as string;
					const raw = BigInt(hexBalance || '0x0');
					const dollars = Number(raw) / 1e18; // BSC USDT: 18 decimals
					result.usdt = {
						raw: raw.toString(),
						formatted: '$' + dollars.toFixed(2),
						loading: false
					};
				} catch (e) {
					console.warn('[MetaMask] fetchBalances USDT failed for chain', chainId, e);
				}
			}

			console.log('[MetaMask] fetchBalances result:', result);
			return result;
		}
	} as ConnectorHandle & {
		fetchBalances?(): Promise<Record<string, { raw: string; formatted: string; loading: boolean }>>;
	};
}

export { getChainIdForNetwork, encodeERC20Transfer, getUSDTContractAddress } from './chain-utils';
