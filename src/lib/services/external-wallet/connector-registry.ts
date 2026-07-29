/**
 * Connector Registry — Pure Map-based registry of active wallet connectors.
 *
 * The registry is the single source of truth for which external wallets
 * are currently connected. Connectors register themselves on connect()
 * and unregister on disconnect(). The store subscribes to connector
 * events via the onEvent callback on each handle.
 *
 * All methods are synchronous except unregister() which calls the
 * handle's unsubscribe() function.
 */

import type { ConnectorHandle } from './types';

export class ConnectorRegistry {
	private connectors = new Map<string, ConnectorHandle>();

	/** Register a connector handle. Throws if the ID already exists. */
	register(handle: ConnectorHandle): void {
		if (this.connectors.has(handle.id)) {
			throw new Error(`Connector already registered: ${handle.id}`);
		}
		this.connectors.set(handle.id, handle);
	}

	/**
	 * Replace a connector handle WITHOUT calling unsubscribe() on the old
	 * one — used during auto-reconnect where the SDK session must survive
	 * the handle swap.
	 */
	replace(handle: ConnectorHandle): void {
		this.connectors.set(handle.id, handle);
	}

	/** Unregister and clean up a connector. Idempotent — no-op if not found. */
	unregister(id: string): void {
		const handle = this.connectors.get(id);
		if (handle) {
			handle.unsubscribe();
			this.connectors.delete(id);
		}
	}

	/** Get a connector handle by ID. Returns undefined if not found. */
	get(id: string): ConnectorHandle | undefined {
		return this.connectors.get(id);
	}

	/** List all active connector handles. */
	list(): ConnectorHandle[] {
		return Array.from(this.connectors.values());
	}

	/** Check if a connector ID is registered. */
	has(id: string): boolean {
		return this.connectors.has(id);
	}

	/** Number of active connectors. */
	get size(): number {
		return this.connectors.size;
	}

	/** Clear all connectors. Calls unsubscribe() on each. */
	clear(): void {
		for (const handle of this.connectors.values()) {
			handle.unsubscribe();
		}
		this.connectors.clear();
	}
}

/**
 * Select the appropriate signer from a connector handle for a given chain.
 *
 * Pure function — accepts registry and sourceId explicitly, no globals.
 *
 * @param registry - The connector registry
 * @param sourceId - The connector handle ID
 * @param chain - The target chain ('rsk' | 'bsc' | 'ethereum' | 'bitcoin')
 * @returns An EVMSigner or BitcoinSigner
 * @throws WalletNotConnectedError if source not found
 * @throws EVMSignerNotAvailableError if EVM signer not available for EVM chain
 * @throws BitcoinSignerNotAvailableError if Bitcoin signer not available for BTC
 */
import {
	WalletNotConnectedError,
	EVMSignerNotAvailableError,
	BitcoinSignerNotAvailableError,
	type EVMSigner,
	type BitcoinSigner
} from './types';

export function selectSigner(
	registry: ConnectorRegistry,
	sourceId: string,
	chain: 'rsk' | 'bsc' | 'ethereum' | 'bitcoin'
): EVMSigner | BitcoinSigner {
	const handle = registry.get(sourceId);
	if (!handle) {
		throw new WalletNotConnectedError(sourceId);
	}

	if (chain === 'bitcoin') {
		if (!handle.bitcoinSigner) {
			throw new BitcoinSignerNotAvailableError(sourceId);
		}
		return handle.bitcoinSigner;
	}

	if (!handle.evmSigner) {
		throw new EVMSignerNotAvailableError(sourceId);
	}
	return handle.evmSigner;
}

/** Singleton registry instance */
export const connectorRegistry = new ConnectorRegistry();
