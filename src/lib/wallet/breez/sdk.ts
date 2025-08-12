import init, {
	connect,
	defaultConfig,
	setLogger,
	type BindingLiquidSdk,
	type ConnectRequest,
	type Config
} from '@breeztech/breez-sdk-liquid/web';
import { writable, get } from 'svelte/store';
import { isWasmInitialized } from './wasmLoader';
import { getAssetId } from '$lib/constants/assets';

// Core SDK state
export const sdkStore = writable<BindingLiquidSdk | null>(null);
export const isConnectedStore = writable<boolean>(false);

// Logger initialization state - to prevent "Logger already created" error
export const isLoggerInitialized = writable<boolean>(false);

// Production logging system
class ProductionLogger {
	log = () => {
		// const timestamp = new Date().toISOString();
		// Console logging for development (enable if needed)
		// console.log(`[${timestamp}][${entry.level}]: ${entry.line}`);
		// TODO: In production, send to logging service (e.g., Sentry, LogRocket)
		// this.sendToLoggingService(entry);
	};

	private sendToLoggingService(): void {
		// Implementation for production logging service
		// e.g., Sentry.addBreadcrumb({ message: entry.line, level: entry.level })
	}
}

let productionLogger: ProductionLogger | null = null;

/**
 * Initialize WASM module (must be called first in web environment)
 */
export async function initializeWasm(): Promise<void> {
	try {
		await init();
	} catch (error) {
		console.error('Failed to initialize WASM:', error);
		throw error;
	}
}

/**
 * Get or create SDK configuration
 */
type MutableConfig = Config & {
	assetMetadata?: Array<{
		assetId: string;
		name: string;
		ticker: string;
		precision: number;
		fiatId?: string;
	}>;
	syncIntervalMs?: number;
	rescanOnchainSwapsIntervalMs?: number;
	swapStatusCheckIntervalMs?: number;
	workingDir?: string;
};

export function createSdkConfig(
	network: 'mainnet' | 'testnet' = (import.meta?.env?.VITE_WALLET_NETWORK as
		| 'mainnet'
		| 'testnet') ?? 'testnet'
): Config {
	// Get API key from environment
	const breezApiKey = import.meta.env.VITE_BREEZ_API_KEY;
	if (!breezApiKey) {
		throw new Error('Breez API key not found');
	}

	// Create default config
	const config: Config = defaultConfig(network, breezApiKey);

	const mutableConfig = config as MutableConfig;
	// Do not override default asset metadata to avoid UNIQUE constraint errors
	// The SDK already includes L-BTC and USDt metadata for the selected network
	// If in future we add custom assets, ensure they don't duplicate existing IDs

	// Use a per-network working directory to avoid cross-network state conflicts
	mutableConfig.workingDir = `breez_${network}`;

	// Configure intervals based on network
	const intervals =
		network === 'testnet'
			? { sync: 180000, rescan: 600000, status: 240000 } // Testnet: longer intervals
			: { sync: 60000, rescan: 300000, status: 120000 }; // Mainnet: shorter intervals

	mutableConfig.syncIntervalMs = intervals.sync;
	mutableConfig.rescanOnchainSwapsIntervalMs = intervals.rescan;
	mutableConfig.swapStatusCheckIntervalMs = intervals.status;

	return config;
}

/**
 * Connect to Breez SDK
 */
export async function connectToBreezSdk(
	mnemonic: string,
	network: 'mainnet' | 'testnet' = (import.meta?.env?.VITE_WALLET_NETWORK as
		| 'mainnet'
		| 'testnet') ?? 'testnet'
): Promise<BindingLiquidSdk> {
	// Ensure WASM is initialized first
	if (!get(isWasmInitialized)) {
		await initializeWasm();
	}

	// Initialize production logging if not already done
	if (!get(isLoggerInitialized)) {
		if (!productionLogger) {
			productionLogger = new ProductionLogger();
		}
		try {
			setLogger(productionLogger);
			isLoggerInitialized.set(true);
		} catch (error) {
			// If logger is already set, just update our tracking
			if (error instanceof Error && error.message?.includes('Logger already created')) {
				isLoggerInitialized.set(true);
			} else {
				throw error;
			}
		}
	}

	// Create config and connect
	const config = createSdkConfig(network);
	const connectRequest: ConnectRequest = { config, mnemonic };

	const sdkInstance = await connect(connectRequest);

	// Update stores
	sdkStore.set(sdkInstance);
	isConnectedStore.set(true);

	return sdkInstance;
}

/**
 * Disconnect from SDK
 */
export async function disconnectSdk(): Promise<void> {
	const sdk = get(sdkStore);
	if (sdk) {
		try {
			await sdk.disconnect();
			sdkStore.set(null);
			isConnectedStore.set(false);
			console.log('SDK disconnected successfully');
		} catch (error) {
			console.error('Failed to disconnect SDK:', error);
			throw error;
		}
	}
}

/**
 * Get current SDK instance (throws if not connected)
 */
export function getSdk(): BindingLiquidSdk {
	const sdk = get(sdkStore);
	if (!sdk) {
		throw new Error('SDK not initialized');
	}
	return sdk;
}

/**
 * Check if SDK is connected
 */
export function isSdkConnected(): boolean {
	return get(isConnectedStore);
}

/**
 * Check if logger is initialized
 */
export function isLoggerReady(): boolean {
	return get(isLoggerInitialized);
}

/**
 * Reset logger state (for testing/debugging purposes)
 * Note: This doesn't actually remove the logger from the SDK, just resets our tracking
 */
export function resetLoggerState(): void {
	isLoggerInitialized.set(false);
	productionLogger = null;
}
