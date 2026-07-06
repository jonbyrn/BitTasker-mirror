/**
 * Unified Wallet Store — re-export from split modules
 *
 * All wallet logic lives in src/lib/stores/wallet/*.ts.
 * This file re-exports every public symbol so that the 100+ consumers
 * that import from '$lib/stores/wallet.store' continue to work unchanged.
 */
export * from './wallet/index';
