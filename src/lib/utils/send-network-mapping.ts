/**
 * Pure network-mapping utilities extracted from SendPaymentForm.svelte.
 *
 * No Svelte, no stores, no side effects — pure functions only.
 * Import types from `$lib/services/route-resolver`.
 */

import type { SourceWallet, Destination } from '$lib/services/route-resolver';

// ── Destination chain options ──────────────────────────────────────────────────

export const DESTINATION_CHAIN_OPTIONS = [
	{
		id: 30,
		testnetId: 31,
		network: 'rootstock-bitcoin',
		label: 'Rootstock Bitcoin',
		asset: 'rBTC',
		icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
		short: 'RSK',
		group: 'btc' as const,
		confirmationTime: 30,
		explorerUrlMainnet: 'https://rootstock.blockscout.com/address/',
		explorerUrlTestnet: 'https://rootstock-testnet.blockscout.com/address/',
		recommended: true
	},
	{
		id: 56,
		testnetId: 97,
		network: 'usdt-bsc',
		label: 'Binance',
		asset: 'USDT',
		icon: '/images/chains/Binance-logo.svg',
		short: 'BSC',
		group: 'usdt' as const,
		confirmationTime: 1,
		explorerUrlMainnet: 'https://bscscan.com/address/',
		explorerUrlTestnet: 'https://testnet.bscscan.com/address/'
	},
	{
		id: 1,
		testnetId: 11155111,
		network: 'usdt-ethereum',
		label: 'Ethereum',
		asset: 'USDT',
		icon: '/images/chains/ethereum.png',
		short: 'ETH',
		group: 'usdt' as const,
		confirmationTime: 15,
		explorerUrlMainnet: 'https://etherscan.io/address/',
		explorerUrlTestnet: 'https://sepolia.etherscan.io/address/'
	},
	{
		id: 42161,
		testnetId: 421614,
		network: 'usdt0-arb',
		label: 'Arbitrum',
		asset: 'USDT',
		icon: '/images/chains/arbitrum.png',
		short: 'Arb',
		group: 'usdt' as const,
		confirmationTime: 15,
		explorerUrlMainnet: 'https://arbiscan.io/address/',
		explorerUrlTestnet: 'https://sepolia.arbiscan.io/address/',
		recommended: true
	},
	{
		id: 137,
		testnetId: 80002,
		network: 'usdt-polygon',
		label: 'Polygon',
		asset: 'USDT',
		icon: '/images/chains/polygon.png',
		short: 'Poly',
		group: 'usdt' as const,
		confirmationTime: 10,
		explorerUrlMainnet: 'https://polygonscan.com/address/',
		explorerUrlTestnet: 'https://amoy.polygonscan.com/address/'
	},
	{
		id: 10,
		testnetId: 11155420,
		network: 'usdt-optimism',
		label: 'Optimism',
		asset: 'USDT',
		icon: '/images/chains/optimism.png',
		short: 'OP',
		group: 'usdt' as const,
		confirmationTime: 10,
		explorerUrlMainnet: 'https://optimistic.etherscan.io/address/',
		explorerUrlTestnet: 'https://sepolia-optimism.etherscan.io/address/'
	},
	{
		id: 8453,
		testnetId: 84532,
		network: 'usdt-base',
		label: 'Base',
		asset: 'USDT',
		icon: '/images/chains/base.png',
		short: 'Base',
		group: 'usdt' as const,
		confirmationTime: 10,
		explorerUrlMainnet: 'https://basescan.org/address/',
		explorerUrlTestnet: 'https://sepolia.basescan.org/address/'
	},
	{
		id: 43114,
		testnetId: 43113,
		network: 'usdt-avalanche',
		label: 'Avalanche',
		asset: 'USDT',
		icon: '/images/chains/avalanche.png',
		short: 'Avax',
		group: 'usdt' as const,
		confirmationTime: 5,
		explorerUrlMainnet: 'https://snowtrace.io/address/',
		explorerUrlTestnet: 'https://testnet.snowtrace.io/address/'
	},
	{
		id: -1,
		network: 'lightning-bitcoin',
		label: 'Lightning',
		asset: 'BTC',
		icon: '/images/chains/lightning.svg',
		short: 'LN',
		group: 'btc' as const,
		confirmationTime: 0,
		explorerUrlMainnet: 'https://mempool.space/lightning/node/',
		explorerUrlTestnet: 'https://mempool.space/testnet/lightning/node/'
	},
	{
		id: -2,
		network: 'bitcoin',
		label: 'Bitcoin',
		asset: 'BTC',
		icon: '/images/chains/Bitcoin.svg',
		short: 'BTC',
		group: 'btc' as const,
		confirmationTime: 600,
		explorerUrlMainnet: 'https://blockstream.info/address/',
		explorerUrlTestnet: 'https://blockstream.info/testnet/address/'
	},
	{
		id: -3,
		network: 'usdt-tron',
		label: 'TRON',
		asset: 'USDT',
		icon: '/images/chains/tron.png',
		short: 'TRX',
		group: 'usdt' as const,
		confirmationTime: 60,
		explorerUrlMainnet: 'https://tronscan.org/#/address/',
		explorerUrlTestnet: 'https://shasta.tronscan.org/#/address/'
	},
	{
		id: -4,
		network: 'liquid-bitcoin',
		label: 'Liquid',
		asset: 'BTC',
		icon: '/images/chains/Liquid-Bitcoin.svg',
		short: 'L-BTC',
		group: 'btc' as const,
		confirmationTime: 60,
		explorerUrlMainnet: 'https://blockstream.info/liquid/address/',
		explorerUrlTestnet: 'https://blockstream.info/liquidtestnet/address/'
	}
] as const;

export type ChainOption = (typeof DESTINATION_CHAIN_OPTIONS)[number];

// ── Network config for functions that depend on env vars ───────────────────────

export interface NetworkConfig {
	rskNetwork?: string;
	bscNetwork?: string;
}

function resolveConfig(config?: NetworkConfig): { rskNetwork: string; bscNetwork: string } {
	return {
		rskNetwork: config?.rskNetwork ?? (import.meta.env.VITE_RSK_NETWORK as string) ?? 'testnet',
		bscNetwork: config?.bscNetwork ?? (import.meta.env.VITE_BSC_NETWORK as string) ?? 'testnet'
	};
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Get a chain option entry by network string, with display metadata for UI.
 * Returns icon, name, confirmation time, explorer URL.
 */
export function getNetworkDisplay(
	network: string,
	config?: NetworkConfig
): {
	icon: string;
	name: string;
	confirmationTime: number;
	explorerUrl: string | null;
} | null {
	const opt = DESTINATION_CHAIN_OPTIONS.find((c) => c.network === network);
	if (!opt) return null;
	const { rskNetwork, bscNetwork } = resolveConfig(config);
	const isMainnet = network === 'usdt-bsc' ? bscNetwork === 'mainnet' : rskNetwork === 'mainnet';
	const explorerBase = isMainnet
		? (((opt as Record<string, unknown>).explorerUrlMainnet as string) ?? null)
		: (((opt as Record<string, unknown>).explorerUrlTestnet as string) ??
			((opt as Record<string, unknown>).explorerUrlMainnet as string) ??
			null);
	return {
		icon: opt.icon,
		name: opt.label,
		confirmationTime: 'confirmationTime' in opt ? opt.confirmationTime : 0,
		explorerUrl: explorerBase
	};
}

/**
 * Map network string → mainnet chain ID.
 */
export const NETWORK_TO_CHAIN_ID: Record<string, number> = Object.fromEntries(
	DESTINATION_CHAIN_OPTIONS.map((opt) => [opt.network, opt.id])
);

/**
 * Map chain ID → network string (mainnet IDs only).
 */
export const CHAIN_ID_TO_NETWORK: Record<number, string> = Object.fromEntries(
	DESTINATION_CHAIN_OPTIONS.map((opt) => [opt.id, opt.network])
);

/**
 * Get the resolved chain ID for a network, respecting mainnet/testnet config.
 */
export function getResolvedChainId(network: string, config?: NetworkConfig): number {
	const opt = DESTINATION_CHAIN_OPTIONS.find((c) => c.network === network);
	if (!opt) return 0;
	if (!('testnetId' in opt)) return opt.id;
	const { rskNetwork, bscNetwork } = resolveConfig(config);
	const isMainnet = network === 'usdt-bsc' ? bscNetwork === 'mainnet' : rskNetwork === 'mainnet';
	return isMainnet ? opt.id : opt.testnetId;
}

/**
 * Build the destinations array for the SendDestinationSelector component.
 * Groups chains into 'btc' and 'usdt' tabs.
 */
export function toDestinations(): Array<{
	id: string;
	asset: string;
	label: string;
	icon: string;
	group: 'btc' | 'usdt';
	recommended?: boolean;
}> {
	return DESTINATION_CHAIN_OPTIONS.map((opt) => ({
		id: opt.network,
		asset: opt.asset,
		label: opt.label,
		icon: opt.icon,
		group: opt.group,
		recommended: 'recommended' in opt ? opt.recommended : undefined
	}));
}

/**
 * Get all network display entries as a Record keyed by network string.
 * Compatible with PendingTransactionScreen's networkOptions prop.
 */
export function getAllNetworkDisplays(config?: NetworkConfig): Record<
	string,
	{
		icon: string;
		name: string;
		confirmationTime: number;
	}
> {
	const result: Record<string, { icon: string; name: string; confirmationTime: number }> = {};
	for (const opt of DESTINATION_CHAIN_OPTIONS) {
		const display = getNetworkDisplay(opt.network, config);
		if (display) {
			result[opt.network] = {
				icon: display.icon,
				name: display.name,
				confirmationTime: display.confirmationTime
			};
		}
	}
	return result;
}

// ── toSourceWallet ──────────────────────────────────────────────────────────────

/**
 * Map a source wallet identifier (or detected network) to a canonical
 * SourceWallet type used by the route resolver.
 *
 * For explicit wallet IDs (e.g. "rootstock-bitcoin", "usdt-bsc") the mapping is
 * direct. For connected (external) wallets the chain is inferred from the
 * detectedNetwork parameter.
 */
export function toSourceWallet(source: string, detectedNetwork?: string | null): SourceWallet {
	if (source === 'rootstock-bitcoin') return 'rbtc';
	if (source === 'usdt-bsc') return 'usdt-bsc';
	if (source === 'usdt0-arb') return 'usdt0-arb';
	if (source === 'wbtc-arbitrum' || source === 'wbtc-arb') return 'wbtc-arb';
	if (source === 'tbtc-arbitrum' || source === 'tbtc-arb') return 'tbtc-arb';
	if (source === 'usdt-ethereum') return 'usdt-ethereum';
	if (source === 'usdt-avalanche') return 'usdt-avalanche';
	if (source === 'usdt-base') return 'usdt-base';
	if (source === 'usdt-optimism') return 'usdt-optimism';
	if (source === 'usdt-polygon') return 'usdt-polygon';
	// Connected wallet — infer chain from detected network for route resolution
	if (detectedNetwork === 'rootstock-bitcoin') return 'rbtc';
	if (detectedNetwork === 'usdt-bsc') return 'usdt-bsc';
	if (detectedNetwork === 'usdt0-arb') return 'usdt0-arb';
	if (detectedNetwork === 'wbtc-arbitrum' || detectedNetwork === 'wbtc-arb') return 'wbtc-arb';
	if (detectedNetwork === 'tbtc-arbitrum' || detectedNetwork === 'tbtc-arb') return 'tbtc-arb';
	if (detectedNetwork === 'usdt-ethereum') return 'usdt-ethereum';
	if (detectedNetwork === 'usdt-avalanche') return 'usdt-avalanche';
	if (detectedNetwork === 'usdt-base') return 'usdt-base';
	if (detectedNetwork === 'usdt-optimism') return 'usdt-optimism';
	if (detectedNetwork === 'usdt-polygon') return 'usdt-polygon';
	console.warn('Unknown source wallet:', source);
	return 'usdt-bsc';
}

// ── getChainOption ──────────────────────────────────────────────────────────────

/**
 * Look up a DESTINATION_CHAIN_OPTIONS entry by chain ID.
 *
 * First tries matching by `id` or `testnetId`. If no match is found and a
 * `detectedNetwork` is provided, falls back to matching by the `network` field.
 */
export function getChainOption(
	chainId: number | null,
	detectedNetwork?: string | null
): ChainOption | null {
	if (chainId === null) return null;
	// Match by id/testnetId
	const byId = DESTINATION_CHAIN_OPTIONS.find(
		(c) => c.id === chainId || ('testnetId' in c && c.testnetId === chainId)
	);
	if (byId) return byId;
	// Match by detected network
	if (detectedNetwork) {
		return (
			DESTINATION_CHAIN_OPTIONS.find((c) => 'network' in c && c.network === detectedNetwork) ?? null
		);
	}
	return null;
}

// ── toDestination ───────────────────────────────────────────────────────────────

/**
 * Convert a detected network + address into a typed Destination for the route
 * resolver. An explicit `overrideChainId` takes precedence for EVM-compatible
 * networks (not Lightning/Bitcoin/Liquid).
 */
export function toDestination(
	network: string | null,
	address: string,
	overrideChainId?: number | null,
	config?: NetworkConfig
): Destination | null {
	if (!network || !address) return null;

	// Explicit chain ID overrides network-based mapping
	// Override chain ID only for EVM-compatible networks (not Lightning/Bitcoin/Liquid)
	const isNonEVM =
		network === 'lightning-bitcoin' || network === 'bitcoin' || network === 'liquid-bitcoin';
	if (!isNonEVM && overrideChainId != null) {
		return { type: 'address', chainId: overrideChainId, address };
	}

	// Non-EVM destinations (invoice-based)
	if (network === 'lightning-bitcoin') {
		return { type: 'invoice', network: 'lightning', invoice: address };
	}
	if (network === 'bitcoin') {
		return { type: 'invoice', network: 'onchain', invoice: address };
	}

	// EVM destinations — resolve chain ID from DESTINATION_CHAIN_OPTIONS
	const chainId = getResolvedChainId(network, config);
	if (chainId !== 0) {
		return { type: 'address', chainId, address };
	}

	// TRON placeholder
	if (network === 'usdt-tron') {
		return { type: 'address', chainId: 0, address };
	}

	return null;
}

// ── getAddressExplorerUrl ───────────────────────────────────────────────────────

/**
 * Get a block-explorer URL for an address based on the detected network.
 * Returns null for networks without a known explorer or for empty/missing inputs.
 */
export function getAddressExplorerUrl(
	address: string,
	network: string | null,
	config?: NetworkConfig
): string | null {
	if (!address || !network) return null;

	const display = getNetworkDisplay(network, config);
	if (display?.explorerUrl) {
		return `${display.explorerUrl}${address}`;
	}

	return null;
}
