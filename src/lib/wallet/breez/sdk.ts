import {
	connect,
	defaultConfig,
	setLogger,
	type BindingLiquidSdk,
	type ConnectRequest,
	type Config,
	type LogEntry
} from '@breeztech/breez-sdk-liquid/web';
import { writable, get } from 'svelte/store';
import { initWasm, isWasmInitialized } from './wasmLoader';
import { getAssetId } from '$lib/utils/constants/assets';

// Core SDK state
export const sdkStore = writable<BindingLiquidSdk | null>(null);
export const isConnectedStore = writable<boolean>(false);

// Logger initialization state - to prevent "Logger already created" error
export const isLoggerInitialized = writable<boolean>(false);

// Production logging system
class ProductionLogger {
	log = (entry: LogEntry) => {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}][${entry.level}]: ${entry.line}`;
		
		// Console logging for development
		// console.log(logMessage);
		
		// TODO: In production, send to logging service (e.g., Sentry, LogRocket)
		// this.sendToLoggingService(entry);
	}

	private sendToLoggingService(entry: LogEntry) {
		// Implementation for production logging service
		// e.g., Sentry.addBreadcrumb({ message: entry.line, level: entry.level })
	}
}

let productionLogger: ProductionLogger | null = null;

/**
 * Get or create SDK configuration
 */
export function createSdkConfig(network: 'mainnet' | 'testnet' = 'mainnet'): Config {
	// Get API key from environment
	const breezApiKey = import.meta.env.VITE_BREEZ_API_KEY;
	if (!breezApiKey) {
		throw new Error('Breez API key not found');
	}

	// Create default config
	const config: Config = defaultConfig(network, breezApiKey);

	// Configure multi-asset support
	if ('assetMetadata' in config) {
		const assetMetadata = [
			{
				assetId: getAssetId('USDT'),
				name: 'Tether USD',
				ticker: 'USDt',
				precision: 8,
				fiatId: 'USD'
			}
		];
		(config as any).assetMetadata = assetMetadata;
	}

	// Configure intervals based on network
	const intervals = network === 'testnet' 
		? { sync: 180000, rescan: 600000, status: 240000 }  // Testnet: longer intervals
		: { sync: 60000, rescan: 300000, status: 120000 };  // Mainnet: shorter intervals

	if ('syncIntervalMs' in config) {
		(config as any).syncIntervalMs = intervals.sync;
	}
	if ('rescanOnchainSwapsIntervalMs' in config) {
		(config as any).rescanOnchainSwapsIntervalMs = intervals.rescan;
	}
	if ('swapStatusCheckIntervalMs' in config) {
		(config as any).swapStatusCheckIntervalMs = intervals.status;
	}

	return config;
}

/**
 * Connect to Breez SDK
 */
export async function connectToBreezSdk(
	mnemonic: string, 
	network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<BindingLiquidSdk> {
	// Ensure WASM is initialized first
	if (!get(isWasmInitialized)) {
		await initWasm();
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