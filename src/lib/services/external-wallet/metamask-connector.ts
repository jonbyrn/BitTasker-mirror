/**
 * MetaMask Connector — @metamask/connect-multichain SDK
 *
 * Uses the Multichain SDK for one-prompt multi-chain connection.
 * Supports RSK (30/31), BSC (56/97), Ethereum (1) simultaneously.
 */

import type { ConnectorHandle, EVMTransactionRequest, EVMTransactionResult } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { sendLock } from '$lib/services/external-wallet/send-lock';
import { getBSCUSDTContractAddress } from './chain-utils';

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
	/** Previously-known chain IDs (from persisted state). Passed as CAIP-10
	 *  account hints to help the SDK locate an existing session. */
	knownChainIds?: number[];
	/** Previously-known address (from persisted state). */
	knownAddress?: string;
	/** Use a long timeout (2 min) for auto-reconnect rather than 10s.
	 *  The user may not notice the MetaMask popup immediately. */
	longTimeout?: boolean;
}

const DEFAULT_SCOPES = ['eip155:30', 'eip155:31', 'eip155:56', 'eip155:97', 'eip155:1'] as const;

async function getClient(): Promise<MultiChainClient> {
	if (!clientPromise) {
		// Assign synchronously (IIFE) so concurrent callers see the same promise
		// instead of both triggering the dynamic import.
		clientPromise = (async () => {
			const { createMultichainClient: createClient } = await import('@metamask/connect-multichain');
			return createClient({
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
						'eip155:1':
							'https://mainnet.infura.io/v3/' + (import.meta.env.VITE_INFURA_API_KEY || '')
					}
				}
			});
		})();
	}
	return clientPromise;
}

// ---------------------------------------------------------------------------
// Session data extraction (shared by active-session lookup and
// wallet_sessionChanged event handler)
// ---------------------------------------------------------------------------

type SessionData = { accounts: string[]; chainIds: number[] };

function extractSession(session: unknown): SessionData {
	const s = session as { sessionScopes?: Record<string, { accounts?: string[] }> };
	const accts: string[] = [];
	const chIds: number[] = [];
	if (s?.sessionScopes) {
		for (const scopeId of Object.keys(s.sessionScopes)) {
			for (const acct of s.sessionScopes[scopeId]?.accounts ?? []) {
				const addr = acct.includes(':') ? acct.split(':').pop()!.toLowerCase() : acct.toLowerCase();
				if (!accts.includes(addr)) accts.push(addr);
			}
			const chainId = parseInt(scopeId.split(':')[1], 10);
			if (!chIds.includes(chainId)) chIds.push(chainId);
		}
	}
	return { accounts: accts, chainIds: chIds };
}

export async function connectMetaMask(config: ConnectMetaMaskConfig): Promise<ConnectorHandle> {
	const sdkClient = await getClient();

	// Build CAIP-10 account IDs from known address/chainIds so the SDK
	// can merge with any existing session.
	const caipAccounts: string[] = [];
	if (config.knownAddress && config.knownChainIds?.length) {
		for (const chainId of config.knownChainIds) {
			caipAccounts.push(`eip155:${chainId}:${config.knownAddress}`);
		}
	}

	// -------------------------------------------------------------------
	// 1. Check for an existing session BEFORE calling connect().
	//    provider.getSession() sends wallet_getSession to the extension.
	//    If a session exists (persisted across page reloads by MetaMask),
	//    reuse it without calling connect() — avoids an unnecessary popup.
	// -------------------------------------------------------------------
	// Cast (provider.getSession): tested against SDK v0.14.0. The
	// MultiChainClient return type doesn't expose the internal provider
	// or its getSession method, but both exist at runtime. When upgrading
	// the SDK, check if getSession() is now part of the public API and
	// remove this cast.
	const rawProvider = (
		sdkClient as unknown as {
			provider?: { getSession?: () => Promise<unknown> };
		}
	).provider;

	if (rawProvider?.getSession) {
		try {
			const existing = await rawProvider.getSession();
			const sessionData = extractSession(existing);
			if (sessionData.accounts.length > 0) {
				console.log(
					'[MetaMask] Reusing existing session. Accounts:',
					sessionData.accounts,
					'Chains:',
					sessionData.chainIds
				);
				return buildHandle(
					sdkClient,
					sessionData.accounts[0],
					sessionData.chainIds,
					config.onEvent
				);
			}
		} catch {
			// Fall through to connect()
		}
	}

	// -------------------------------------------------------------------
	// 2. No existing session — connect() to establish one.
	// -------------------------------------------------------------------
	console.log('[MetaMask] No existing session, calling connect()...');

	let resolveSession: (v: SessionData) => void;
	let rejectSession: (e: Error) => void;
	const sessionPromise = new Promise<SessionData>((res, rej) => {
		resolveSession = res;
		rejectSession = rej;
	});
	const timeout = setTimeout(
		() => rejectSession(new Error('Session data timeout — try again')),
		config.longTimeout ? 120_000 : 10_000
	);

	let sessionSettled = false;
	const cleanupSession = () => {
		if (sessionSettled) return;
		sessionSettled = true;
		clearTimeout(timeout);
	};

	// Cast (wallet_sessionChanged): tested against SDK v0.14.0. The SDK's on()
	// method types don't expose the wallet_sessionChanged event name or its
	// handler signature, but the SDK fires it at runtime. When upgrading the
	// SDK, check if this event is now included in the type definitions and
	// replace these casts with the typed overload.
	sdkClient.on(
		'wallet_sessionChanged' as never,
		((session: unknown) => {
			clearTimeout(timeout);
			resolveSession(extractSession(session));
		}) as (...a: unknown[]) => void
	);

	// Cast (connect): tested against SDK v0.14.0. sdkClient.connect() accepts
	// (scopes, accounts) at runtime but the TypeScript types define a narrower
	// signature (single scope, no account hints). When upgrading the SDK, check
	// if connect now accepts CAIP-10 account hints and remove these casts.
	const doConnect = () =>
		(sdkClient.connect as unknown as (scopes: string[], accounts: string[]) => Promise<void>)(
			DEFAULT_SCOPES as unknown as string[],
			caipAccounts
		);

	try {
		await doConnect();
	} catch (e) {
		const msg = (e as Error).message ?? '';
		if (msg.includes('already pending')) {
			console.log('[MetaMask] Existing MetaMask prompt detected — waiting for response...');
		} else {
			cleanupSession();
			throw e;
		}
	}

	const sessionData = await sessionPromise;
	console.log(
		'[MetaMask] Session ready. Accounts:',
		sessionData.accounts,
		'Chains:',
		sessionData.chainIds
	);

	if (sessionData.accounts.length === 0) {
		throw new Error('No accounts authorized. Please approve the connection in MetaMask.');
	}

	return buildHandle(sdkClient, sessionData.accounts[0], sessionData.chainIds, config.onEvent);
}

// ---------------------------------------------------------------------------
// Handle builder — shared by persistent-session and fresh-connect paths
// ---------------------------------------------------------------------------

function buildHandle(
	sdkClient: MultiChainClient,
	address: string,
	chainIds: number[],
	onEvent: (event: { type: string; accounts?: string[]; chainId?: number }) => void
): ConnectorHandle {
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
		onEvent,
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

			const usdtContract = getBSCUSDTContractAddress();
			const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2);

			const tasks: Promise<void>[] = [];

			// rBTC on RSK — get native balance
			for (const chainId of chainIds.filter((c) => c === 30 || c === 31)) {
				tasks.push(
					(async () => {
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
					})()
				);
			}

			// USDT on BSC — ERC20 balanceOf
			for (const chainId of chainIds.filter((c) => c === 56 || c === 97)) {
				tasks.push(
					(async () => {
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
					})()
				);
			}

			await Promise.allSettled(tasks);

			console.log('[MetaMask] fetchBalances result:', result);
			return result;
		}
		// Cast (handle return): tested against SDK v0.14.0. buildHandle returns a
		// ConnectorHandle with an optional fetchBalances method that is specific to
		// the Multichain SDK's invokeMethod approach and not part of the base
		// ConnectorHandle interface. When upgrading the SDK, verify that the return
		// shape still matches and remove this cast if ConnectorHandle is extended.
	} as ConnectorHandle & {
		fetchBalances?(): Promise<Record<string, { raw: string; formatted: string; loading: boolean }>>;
	};
}
