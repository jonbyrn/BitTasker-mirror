/**
 * Swap Chain — Hop Executors (Re-export Shim)
 *
 * This file is a backward-compatible shim. The real implementation has been
 * split into per-service files under ./executors/.
 *
 * All consumers can keep their existing `from './executors'` imports — they
 * resolve to this file, which re-exports from ./executors/index.
 */

export { executeHop, executeConnectedERC20Transfer } from './executors/index';
