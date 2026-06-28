/**
 * Swap Chain Service — Backward Compatibility Re-export
 *
 * All swap chain logic has been split into focused modules under
 * `src/lib/services/swap-chain/`:
 *
 *   - state.ts       — types, transitions, state persistence
 *   - persistence.ts — claim/refund data (in-memory + Preferences + Nostr)
 *   - executors.ts   — hop execution (direct, Changelly, LI.FI, Symbiosis)
 *   - boltz.ts       — Boltz-specific swap logic
 *   - recovery.ts    — refund/recovery functions
 *   - orchestrator.ts — startSwapChain / resumeSwapChain
 *
 * This file re-exports everything so existing importers continue to work.
 * New code should import from `$lib/services/swap-chain` instead.
 */

export * from './swap-chain';
