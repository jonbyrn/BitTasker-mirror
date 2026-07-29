/**
 * Route Engine — Barrel Re-export
 *
 * Clean import surface for consumers:
 *   import { TOKENS, resolveDestinationTokens, directProvider } from '$lib/services/route-engine';
 */

// Types
export type {
	Route,
	RouteHop,
	SourceWallet,
	Destination,
	Token,
	RouteEngineResult,
	SwapProvider,
	SmartRoute
} from './types';

// Token registry
export {
	TOKENS,
	SOURCE_WALLET_TOKENS,
	RSK_CHAIN_IDS,
	BSC_CHAIN_IDS,
	ARB_CHAIN_IDS,
	getTokenByKey,
	resolveTokenKey,
	resolveDestinationTokens
} from './token-registry';

// Providers
export { directProvider } from './providers/direct.provider';
export { boltzProvider } from './providers/boltz.provider';
export { symbiosisProvider } from './providers/symbiosis.provider';
export { lifiProvider } from './providers/lifi.provider';
export { changellyProvider, loadCurrencies } from './providers/changelly.provider';
export { uniswapV3Provider } from './providers/uniswap-v3.provider';

// Engine
export { resolveRoutes, rankRoutes, shouldCheckBoltzOptimization } from './engine';

// Boltz 2-hop optimization
export { buildBoltzTwoHopRoute, BOLTZ_TWO_HOP_PAIRS } from './boltz-two-hop';
