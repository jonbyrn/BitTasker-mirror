/**
 * Connected Wallet Transaction Fetcher
 *
 * Fetches EVM transactions from Blockscout API for connected wallet addresses
 * across RSK and Arbitrum networks. Returns a unified `ConnectedTransaction`
 * format sorted by timestamp descending.
 *
 * @see https://blockscout.github.io/blockscout-api-v2/
 */

import { getBlockscoutApiUrl } from '$lib/utils/wallet/explorerProxy';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('connected-tx');

/** Timeout for Blockscout API requests (ms). */
const FETCH_TIMEOUT_MS = 10_000;

/** Blockscout API base URL for Arbitrum mainnet. */
const ARBITRUM_BLOCKSCOUT_URL = 'https://arbitrum.blockscout.com/api/v2';

/** Blockscout API base URL for Arbitrum testnet. */
const ARBITRUM_BLOCKSCOUT_TESTNET_URL = 'https://arbitrum-sepolia.blockscout.com/api/v2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectedTransaction {
	/** Transaction hash */
	hash: string;
	/** Sender address */
	from: string;
	/** Recipient address */
	to: string;
	/** Value in wei (raw) */
	valueWei: string;
	/** Value normalized to satoshis */
	valueSats: number;
	/** Block timestamp (ISO 8601) */
	timestamp: string;
	/** Transaction status */
	status: 'success' | 'failed' | 'pending';
	/** Network where the transaction occurred */
	network: 'rsk' | 'arbitrum';
	/** Whether the connected wallet sent or received */
	type: 'send' | 'receive';
	/** Contract method name if this is a contract call */
	methodName?: string;
	/** Transaction fee in satoshis */
	feeSats: number;
	/** Blockscout explorer URL for this transaction */
	explorerUrl: string;
	/** Connected wallet metadata */
	walletId: string;
	walletName: string;
	walletType: string;
	walletAddress: string;
	/** Running balance after this transaction (computed client-side) */
	balanceAfter?: number;
	/** Token symbol for ERC-20 token transfers (e.g., 'USDT', 'wBTC', 'tBTC') */
	tokenSymbol?: string;
	/** Human-readable token amount (e.g., '10.50') */
	tokenAmount?: string;
}

/** Minimal shape of a Blockscout v2 transaction item. */
interface BlockscoutTransaction {
	hash: string;
	from: { hash: string };
	to: { hash: string } | null;
	value: string;
	gas_used: string;
	gas_price: string;
	block_number: number;
	timestamp: string;
	status: string;
	method?: string;
	decoded_input?: { method_call?: string } | null;
}

interface BlockscoutResponse {
	items: BlockscoutTransaction[];
}

/** Minimal shape of a Blockscout v2 token transfer item. */
interface BlockscoutTokenTransfer {
	tx_hash: string;
	from: { hash: string };
	to: { hash: string };
	token: {
		address: string;
		symbol: string;
		name: string;
		decimals: string;
		type: string;
	};
	total: {
		value: string;
		decimals: number;
	};
	timestamp: string;
	block_number: number;
	method?: string;
}

interface BlockscoutTokenTransferResponse {
	items: BlockscoutTokenTransfer[];
}

/** Known Arbitrum ERC-20 tokens we care about. */
const KNOWN_ARB_TOKENS: Record<string, { symbol: string; decimals: number }> = {
	'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6 },
	'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': { symbol: 'wBTC', decimals: 8 },
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': { symbol: 'tBTC', decimals: 18 }
};

// ---------------------------------------------------------------------------
// Fetch token transfers
// ---------------------------------------------------------------------------

/**
 * Fetch ERC-20 token transfers from Blockscout for a single address on a single network.
 * Only fetches for Arbitrum (RSK doesn't have the same token ecosystem).
 * Returns an empty array on error (never throws).
 */
async function fetchTokenTransfers(
	address: string,
	network: 'rsk' | 'arbitrum',
	walletMeta: { walletId: string; walletName: string; walletType: string }
): Promise<ConnectedTransaction[]> {
	if (network !== 'arbitrum') return [];

	const baseUrl = getArbitrumBlockscoutUrl();
	const url = `${baseUrl}/addresses/${address.toLowerCase()}/token-transfers?sort=block_number&order=desc`;

	d.log('Fetching token transfers for %s: %s', address.slice(0, 10), url);

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				d.warn('Token transfers API returned %d for %s', response.status, address.slice(0, 10));
				return [];
			}

			const data = (await response.json()) as BlockscoutTokenTransferResponse;
			const items = data.items ?? [];

			return items
				.map((transfer) => mapTokenTransfer(transfer, address, network, walletMeta))
				.filter((tx): tx is ConnectedTransaction => tx !== null);
		} finally {
			clearTimeout(timeout);
		}
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			d.warn('Timeout fetching token transfers for %s', address.slice(0, 10));
		} else {
			d.error('Error fetching token transfers: %s', (err as Error).message);
			Sentry.addBreadcrumb({
				category: 'connected-tx',
				message: `Token transfer fetch failed: ${address.slice(0, 10)}: ${(err as Error).message}`,
				level: 'warning'
			});
		}
		return [];
	}
}

// ---------------------------------------------------------------------------
// Fetch for a single address + network
// ---------------------------------------------------------------------------

/**
 * Fetch transactions from Blockscout for a single address on a single network.
 * Returns an empty array on error (never throws).
 */
async function fetchNetworkTransactions(
	address: string,
	network: 'rsk' | 'arbitrum',
	walletMeta: { walletId: string; walletName: string; walletType: string }
): Promise<ConnectedTransaction[]> {
	const baseUrl = network === 'rsk' ? getBlockscoutApiUrl() : getArbitrumBlockscoutUrl();
	const url = `${baseUrl}/addresses/${address.toLowerCase()}/transactions?sort=block_number&order=desc`;

	d.log('Fetching %s transactions for %s: %s', network, address.slice(0, 10), url);

	try {
		// Fetch native transactions and ERC-20 token transfers in parallel
		const [nativeResult, tokenResult] = await Promise.all([
			fetchNativeTransactionsRaw(url),
			fetchTokenTransfers(address, network, walletMeta)
		]);

		const nativeTxs = nativeResult.map((tx) => mapTransaction(tx, address, network, walletMeta));

		return [...nativeTxs, ...tokenResult];
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			d.warn('Timeout fetching %s transactions for %s', network, address.slice(0, 10));
		} else {
			d.error('Error fetching %s transactions: %s', network, (err as Error).message);
			Sentry.addBreadcrumb({
				category: 'connected-tx',
				message: `Fetch failed: ${network}/${address.slice(0, 10)}: ${(err as Error).message}`,
				level: 'warning'
			});
		}
		return [];
	}
}

/**
 * Fetch raw native transactions from a Blockscout transactions endpoint.
 * Returns raw items; caller is responsible for mapping.
 */
async function fetchNativeTransactionsRaw(url: string): Promise<BlockscoutTransaction[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: 'application/json' }
		});
		clearTimeout(timeout);

		if (!response.ok) return [];

		const data = (await response.json()) as BlockscoutResponse;
		return data.items ?? [];
	} catch {
		clearTimeout(timeout);
		return [];
	}
}

// ---------------------------------------------------------------------------
// Fetch for all connected wallets
// ---------------------------------------------------------------------------

export interface ConnectedWalletInfo {
	id: string;
	walletName: string;
	walletType: string;
	address: string;
}

/**
 * Fetch transactions from ALL connected wallets across RSK + Arbitrum.
 * Merges results and sorts by timestamp descending.
 */
export async function fetchAllConnectedWalletTransactions(
	wallets: ConnectedWalletInfo[]
): Promise<ConnectedTransaction[]> {
	if (wallets.length === 0) return [];

	d.log('Fetching transactions for %d wallets', wallets.length);

	// Fetch all wallets × networks in parallel
	const promises: Promise<ConnectedTransaction[]>[] = [];
	for (const wallet of wallets) {
		const meta = {
			walletId: wallet.id,
			walletName: wallet.walletName,
			walletType: wallet.walletType
		};
		promises.push(fetchNetworkTransactions(wallet.address, 'rsk', meta));
		promises.push(fetchNetworkTransactions(wallet.address, 'arbitrum', meta));
	}

	const results = await Promise.all(promises);
	const allTxs = results.flat();

	// Deduplicate by hash + token symbol (native tx and token transfer can share the same hash)
	const seen = new Set<string>();
	const deduped: ConnectedTransaction[] = [];
	for (const tx of allTxs) {
		const key = tx.tokenSymbol ? `${tx.hash}::${tx.tokenSymbol}` : tx.hash;
		if (!seen.has(key)) {
			seen.add(key);
			deduped.push(tx);
		}
	}

	// Sort by timestamp descending
	deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

	d.log('Fetched %d total transactions (%d unique)', allTxs.length, deduped.length);
	return deduped;
}

/**
 * Fetch transactions for a single connected wallet across both networks.
 */
export async function fetchConnectedWalletTransactionsForWallet(
	wallet: ConnectedWalletInfo
): Promise<ConnectedTransaction[]> {
	const meta = {
		walletId: wallet.id,
		walletName: wallet.walletName,
		walletType: wallet.walletType
	};
	const [rskTxs, arbTxs] = await Promise.all([
		fetchNetworkTransactions(wallet.address, 'rsk', meta),
		fetchNetworkTransactions(wallet.address, 'arbitrum', meta)
	]);

	const allTxs = [...rskTxs, ...arbTxs];
	allTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	return allTxs;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** 1 RBTC = 10^10 satoshis (18 decimals - 8 = 10). */
const WEI_TO_SATS_DIVISOR = 10_000_000_000;

function mapTransaction(
	tx: BlockscoutTransaction,
	userAddress: string,
	network: 'rsk' | 'arbitrum',
	walletMeta: { walletId: string; walletName: string; walletType: string }
): ConnectedTransaction {
	const isSent = tx.from?.hash?.toLowerCase() === userAddress.toLowerCase();
	const toAddress = tx.to?.hash ?? '';

	// Convert wei to sats
	const valueWei = tx.value ?? '0';
	const valueSats = Math.round(Number(valueWei) / WEI_TO_SATS_DIVISOR);

	// Fee calculation
	const gasUsed = BigInt(tx.gas_used ?? '0');
	const gasPrice = BigInt(tx.gas_price ?? '0');
	const feeWei = gasUsed * gasPrice;
	const feeSats = Number(feeWei / BigInt(WEI_TO_SATS_DIVISOR));

	// Status mapping
	let status: 'success' | 'failed' | 'pending' = 'pending';
	if (tx.status === 'ok') status = 'success';
	else if (tx.status === 'error') status = 'failed';

	// Explorer URL
	const explorerBase = network === 'rsk' ? getRskExplorerUrl() : getArbitrumExplorerUrl();
	const explorerUrl = `${explorerBase}/tx/${tx.hash}`;

	// Method name (for contract interactions)
	const methodName = tx.decoded_input?.method_call ?? tx.method ?? undefined;

	return {
		hash: tx.hash,
		from: tx.from?.hash ?? '',
		to: toAddress,
		valueWei,
		valueSats,
		timestamp: tx.timestamp,
		status,
		network,
		type: isSent ? 'send' : 'receive',
		methodName,
		feeSats,
		explorerUrl,
		walletId: walletMeta.walletId,
		walletName: walletMeta.walletName,
		walletType: walletMeta.walletType,
		walletAddress: userAddress
	};
}

/**
 * Map a Blockscout token transfer to a ConnectedTransaction.
 * Returns null if the token is not one of our known Arbitrum tokens.
 */
function mapTokenTransfer(
	transfer: BlockscoutTokenTransfer,
	userAddress: string,
	network: 'rsk' | 'arbitrum',
	walletMeta: { walletId: string; walletName: string; walletType: string }
): ConnectedTransaction | null {
	const tokenAddr = transfer.token?.address?.toLowerCase();
	const knownToken = tokenAddr ? KNOWN_ARB_TOKENS[tokenAddr] : undefined;
	if (!knownToken) return null;

	const isSent = transfer.from?.hash?.toLowerCase() === userAddress.toLowerCase();
	const toAddress = transfer.to?.hash ?? '';

	// Parse token amount with correct decimals
	const rawValue = transfer.total?.value ?? '0';
	const decimals = transfer.total?.decimals ?? knownToken.decimals;
	const divisor = Math.pow(10, decimals);
	const tokenAmount = (Number(rawValue) / divisor).toFixed(Math.min(decimals, 6));

	// Explorer URL
	const explorerBase = getArbitrumExplorerUrl();
	const explorerUrl = `${explorerBase}/tx/${transfer.tx_hash}`;

	return {
		hash: transfer.tx_hash,
		from: transfer.from?.hash ?? '',
		to: toAddress,
		valueWei: rawValue,
		valueSats: 0,
		timestamp: transfer.timestamp,
		status: 'success',
		network,
		type: isSent ? 'send' : 'receive',
		methodName: transfer.method,
		feeSats: 0,
		explorerUrl,
		walletId: walletMeta.walletId,
		walletName: walletMeta.walletName,
		walletType: walletMeta.walletType,
		walletAddress: userAddress,
		tokenSymbol: knownToken.symbol,
		tokenAmount
	};
}

function getArbitrumBlockscoutUrl(): string {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return rskNetwork === 'mainnet' ? ARBITRUM_BLOCKSCOUT_URL : ARBITRUM_BLOCKSCOUT_TESTNET_URL;
}

function getArbitrumExplorerUrl(): string {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return rskNetwork === 'mainnet'
		? 'https://arbitrum.blockscout.com'
		: 'https://arbitrum-sepolia.blockscout.com';
}

function getRskExplorerUrl(): string {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return rskNetwork === 'mainnet'
		? 'https://rootstock.blockscout.com'
		: 'https://rootstock-testnet.blockscout.com';
}
