/**
 * Route Engine — Core Type Definitions
 *
 * Re-exports existing types from route-resolver.ts (DO NOT redefine those).
 * Defines new types for the route engine abstraction layer.
 */

// Import existing types from route-resolver.ts — DO NOT redefine
import type { Route, RouteHop, SourceWallet, Destination } from '$lib/services/route-resolver';
import type { SmartRoute } from '$lib/services/SmartRouter';

// Re-export for consumers
export type { Route, RouteHop, SourceWallet, Destination, SmartRoute };

/**
 * A token in the registry. Represents a specific token on a specific chain.
 * Pure data — no logic.
 */
export interface Token {
	/** Unique key (e.g. 'rbtc', 'usdt0-arb', 'wbtc-arb', 'btc') */
	key: string;
	/** Human-readable symbol */
	symbol: string;
	/** Contract address (0x... for ERC-20, or special values for native) */
	address: string;
	/** Chain identifier (string: 'rsk', 'arbitrum', 'bsc', 'bitcoin', 'lightning') */
	chain: string;
	/** Chain ID (EVM numeric; -1 for Bitcoin, -2 for Lightning) */
	chainId: number;
	/** Token decimals */
	decimals: number;
	/** Is this the native gas token of its chain? */
	native: boolean;
}

/**
 * Result from the route engine for a source→destination query.
 */
export interface RouteEngineResult {
	/** All viable routes, ranked best-first */
	routes: Route[];
	/** The recommended route (alias for routes[0] if present) */
	recommended: Route | null;
	/** Provider-level errors (for debugging/UI) */
	errors: Array<{ provider: string; error: string }>;
	/** Whether the result was fetched live (true) or is a static fallback (false) */
	isLive: boolean;
}

/**
 * Contract that every swap provider must implement.
 * Providers are stateless adapters over existing service singletons.
 */
export interface SwapProvider {
	/** Human-readable name (used in Route.label and RouteHop.service) */
	name: RouteHop['service'];

	/**
	 * Whether this provider can service a given token pair.
	 * Pure, synchronous, no network calls. Used for filtering before getQuote.
	 */
	supports(from: Token, to: Token): boolean;

	/**
	 * Fetch a live quote for this pair.
	 * Returns a Route (with hops populated) or null if unavailable.
	 * Must respect AbortSignal for cancellation.
	 *
	 * @param amountSats - Input amount in BTC satoshis (works for BTC-pegged tokens)
	 * @param sourceAmountRaw - Input amount in source token's smallest unit (for non-BTC tokens like USDT0).
	 *   When provided, providers MUST use this instead of converting from amountSats.
	 *   For BTC-pegged tokens this will be undefined — use amountSats instead.
	 */
	getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		signal?: AbortSignal,
		sourceAmountRaw?: string
	): Promise<Route | null>;
}
