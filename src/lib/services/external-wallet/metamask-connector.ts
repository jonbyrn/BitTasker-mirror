/**
 * MetaMask Connector — @metamask/connect-multichain SDK
 *
 * Uses the Multichain SDK for one-prompt multi-chain connection.
 * Supports RSK (30/31), BSC (56/97), Ethereum (1) simultaneously.
 */

import type { ConnectorHandle, EVMTransactionRequest, EVMTransactionResult } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { sendLock } from '$lib/services/external-wallet/send-lock';
import { VERIFIED_TOKENS, CHAIN_LABELS } from '$lib/data/verified-tokens';

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

const DEFAULT_SCOPES = ['eip155:30', 'eip155:31', 'eip155:56', 'eip155:97'] as const;

/**
 * Supported RPC endpoints for the MultiChain SDK.
 *
 * The SDK routes `invokeMethod()` calls through these endpoints to the
 * corresponding chain. Read-only calls (eth_getBalance, eth_call) do
 * NOT trigger user prompts — only eth_sendTransaction does.
 *
 * Free/rate-limited endpoints are used for chains without Infura keys.
 */
const SUPPORTED_NETWORKS: Record<string, string> = {
	'eip155:30': 'https://public-node.rsk.co',
	'eip155:31': 'https://public-node.testnet.rsk.co',
	'eip155:42161': 'https://arb1.arbitrum.io/rpc',
	'eip155:56': 'https://bsc-dataseed.binance.org',
	'eip155:97': 'https://data-seed-prebsc-1-s1.binance.org:8545',
	// Free public RPCs — rate-limited, sufficient for balance checks
	'eip155:10': 'https://mainnet.optimism.io',
	'eip155:43114': 'https://api.avax.network/ext/bc/C/rpc',
	'eip155:42220': 'https://forno.celo.org',
	'eip155:250': 'https://rpcapi.fantom.network',
	'eip155:100': 'https://rpc.gnosischain.com'
} as const;

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
					supportedNetworks: SUPPORTED_NETWORKS
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
	let sdkClient: MultiChainClient;
	try {
		sdkClient = await getClient();
	} catch (e) {
		// Reset the poisoned singleton so the next attempt starts fresh
		clientPromise = null;
		throw e;
	}

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
		config.longTimeout ? 120_000 : 30_000
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
		// @upgrade-check: SDK v1.x only knows 'wallet_sessionChanged'; remove cast when SDK types include it
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		'wallet_sessionChanged' as any,
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
		if (msg.includes('already pending') || msg.includes('connection is pending') || msg.includes('Existing connection')) {
			console.log('[MetaMask] Existing MetaMask prompt detected — waiting for response...');
		} else {
			cleanupSession();
			// Reset the poisoned singleton so the next attempt starts fresh
			clientPromise = null;
			throw e;
		}
	}

	try {
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
	} catch (e) {
		// Reset the poisoned singleton so the next attempt starts fresh
		clientPromise = null;
		throw e;
	}
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
			console.log('[MetaMask] fetchBalances: querying tokens on all supported chains');

			// balanceOf(address) ABI-encoded — first 4 bytes selector + padded address
			const balanceOfSelector = '0x70a08231';
			const balanceOfData = balanceOfSelector + '000000000000000000000000' + address.slice(2);

			const tasks: Promise<void>[] = [];

			// --- Tier 1: rBTC native balance on RSK ---
			// Only query the first RSK chain in the session (avoid overwriting)
			const rskChain = chainIds.find((c) => c === 30 || c === 31);
			if (rskChain !== undefined) {
				tasks.push(
					(async () => {
						try {
							const hexBalance = (await sdkClient.invokeMethod({
								scope: `eip155:${rskChain}`,
								request: { method: 'eth_getBalance', params: [address, 'latest'] }
							})) as unknown as string;
							const raw = BigInt(hexBalance || '0x0');
							const sats = Number(raw / 10_000_000_000n);
							result.rbtc = {
								raw: String(sats),
								formatted: sats.toLocaleString('en-US') + ' Sats',
								loading: false
							};
						} catch (e) {
							console.warn('[MetaMask] fetchBalances rBTC failed for chain', rskChain, e);
						}
					})()
				);
			}

			// --- Tier 1: USDT0 on Arbitrum (counts toward total wallet balance) ---
			const usdt0ArbContract = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
			tasks.push(
				(async () => {
					try {
						const hexBalance = (await sdkClient.invokeMethod({
							scope: 'eip155:42161',
							request: {
								method: 'eth_call',
								params: [{ to: usdt0ArbContract, data: balanceOfData }, 'latest']
							}
						})) as unknown as string;
						const raw = BigInt(hexBalance || '0x0');
						const dollars = Number(raw) / 1e6;
						if (raw > 0n) {
							result['usdt0-arb'] = {
								raw: raw.toString(),
								formatted: '$' + dollars.toFixed(2),
								loading: false
							};
						}
					} catch (e) {
						console.warn('[MetaMask] fetchBalances USDT0 Arb failed:', e);
					}
				})()
			);

			// --- Tier 1: wBTC on Arbitrum (wrapped BTC, 8 decimals) ---
			const wbtcArbContract = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
			tasks.push(
				(async () => {
					try {
						const hexBalance = (await sdkClient.invokeMethod({
							scope: 'eip155:42161',
							request: {
								method: 'eth_call',
								params: [{ to: wbtcArbContract, data: balanceOfData }, 'latest']
							}
						})) as unknown as string;
						const raw = BigInt(hexBalance || '0x0');
						if (raw > 0n) {
							// wBTC contract uses 8 decimals. 1 wBTC = 10^8 raw = 10^8 sats.
							// Store raw as sats (same convention as rBTC).
							const sats = Number(raw);
							result.wbtc = {
								raw: String(sats),
								formatted: sats.toLocaleString('en-US') + ' Sats',
								loading: false
							};
						}
					} catch (e) {
						console.warn('[MetaMask] fetchBalances wBTC Arb failed:', e);
					}
				})()
			);

			// --- Tier 1: tBTC on Arbitrum (bridged BTC, 18 decimals) ---
			const tbtcArbContract = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
			tasks.push(
				(async () => {
					try {
						const hexBalance = (await sdkClient.invokeMethod({
							scope: 'eip155:42161',
							request: {
								method: 'eth_call',
								params: [{ to: tbtcArbContract, data: balanceOfData }, 'latest']
							}
						})) as unknown as string;
						const raw = BigInt(hexBalance || '0x0');
						if (raw > 0n) {
							const human = Number(raw) / 1e18;
							const sats = Math.round(human * 100_000_000);
							result['tbtc-arb'] = {
								raw: raw.toString(),
								formatted: sats.toLocaleString('en-US') + ' Sats',
								loading: false
							};
						}
					} catch (e) {
						console.warn('[MetaMask] fetchBalances tBTC Arb failed:', e);
					}
				})()
			);

			// --- Tier 2: Verified stablecoins across all chains ---
			// USDT on Arbitrum is excluded (already tracked as Tier 1 usdt0-arb).
			// All Tier 2 tokens use the key format `chainId-tokenSymbol-e.g. '56-USDT'`
			// and are displayed separately in the wallet UI (not counted in total).
			for (const [chainIdStr, tokens] of Object.entries(VERIFIED_TOKENS)) {
				const chainId = Number(chainIdStr);
				for (const token of tokens) {
					// Skip Tier 1 duplicates
					if (chainId === 42161 && token.symbol === 'USDT') continue;

					const balanceKey = `${chainId}-${token.symbol}`;
					tasks.push(
						(async () => {
							try {
								const hexBalance = (await sdkClient.invokeMethod({
									scope: `eip155:${chainId}`,
									request: {
										method: 'eth_call',
										params: [{ to: token.address, data: balanceOfData }, 'latest']
									}
								})) as unknown as string;
								const raw = BigInt(hexBalance || '0x0');
								if (raw > 0n) {
									const human = Number(raw) / Math.pow(10, token.decimals);
									const chainLabel = CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
									result[balanceKey] = {
										raw: raw.toString(),
										formatted: `${human.toFixed(2)} ${token.symbol} (${chainLabel})`,
										loading: false
									};
								}
							} catch (e) {
								// Tier 2 failures are expected for chains the user hasn't
								// added to MetaMask — the SDK may refuse eth_call if the
								// chain isn't in the session scopes. Silently skip.
								console.debug('[MetaMask] fetchBalances Tier2 skip', balanceKey, e);
							}
						})()
					);
				}
			}

			await Promise.allSettled(tasks);
			console.log('[MetaMask] fetchBalances result:', Object.keys(result));
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
