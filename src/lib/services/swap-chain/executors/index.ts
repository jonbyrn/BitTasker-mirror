/**
 * Swap Chain — Hop Executor Dispatcher
 *
 * Routes each hop to the correct service executor based on `hop.service`.
 * Re-exports the public API: `executeHop` and `executeConnectedERC20Transfer`.
 */

import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';
import type { RouteHop } from '$lib/services/route-resolver';
import type { SwapChainState } from '../state';
import { executeDirectHop, executeConnectedERC20Transfer } from './direct';
import { executeChangellyHop } from './changelly';
import { executeLifiHop } from './lifi';
import { executeSymbiosisHop } from './symbiosis';
import { executeUniswapV3Hop } from './uniswap-v3';
import { executeBoltzHop } from '../boltz';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Hop dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single hop based on its service type.
 *
 * @param hop - The route hop to execute
 * @param state - Current swap chain state
 * @param hopIndex - Zero-based index of this hop in the route
 * @returns Transaction hash or service swap ID on success
 */
export async function executeHop(
	hop: RouteHop,
	state: SwapChainState,
	hopIndex: number
): Promise<{ data: string | null; error: Error | null }> {
	d.log(
		'[executeHop] hop%d: service=%s from=%s/%s to=%s/%s connected=%s amount=%s',
		hopIndex,
		hop.service,
		hop.fromAsset,
		hop.fromChain,
		hop.toAsset,
		hop.toChain,
		state.sourceConnectedWalletId ?? 'builtin',
		state.amount
	);

	Sentry.addBreadcrumb({
		category: 'swap-chain.hop',
		message: `Executing hop ${hopIndex + 1}`,
		data: {
			service: hop.service,
			from: `${hop.fromAsset}/${hop.fromChain}`,
			to: `${hop.toAsset}/${hop.toChain}`
		}
	});

	// Dispatch based on service type
	switch (hop.service) {
		case 'direct':
			return executeDirectHop(hop, state);
		case 'changelly':
			return executeChangellyHop(hop, state, hopIndex);
		case 'boltz':
			d.log('[executeHop] Dispatching to executeBoltzHop...');
			return executeBoltzHop(hop, state);
		case 'lifi':
			return executeLifiHop(hop, state);
		case 'symbiosis':
			d.log('[executeHop] Dispatching to executeSymbiosisHop...');
			return executeSymbiosisHop(hop, state);
		case 'uniswap-v3':
			d.log('[executeHop] Dispatching to executeUniswapV3Hop...');
			return executeUniswapV3Hop(hop, state);
		default:
			return {
				data: null,
				error: new Error(`Unknown hop service: ${hop.service}`)
			};
	}
}

// Re-export for external consumers
export { executeConnectedERC20Transfer };
