/**
 * @deprecated This file is a compatibility shim. The actual implementation
 * has been split into focused sub-modules under ./boltz/.
 *
 * See: boltz/setup.ts, boltz/executors.ts, boltz/polling.ts, boltz/claims.ts
 *
 * This file will be removed once all imports are confirmed to resolve through
 * the boltz/ directory barrel.
 */

// Re-export from the boltz/ sub-modules for backward compatibility
export { executeBoltzHop } from './boltz/executors';
export { pollBoltzChainSwapCompletion } from './boltz/polling';
export type { BoltzHopResult, SwapSetupResult } from './boltz/setup';
