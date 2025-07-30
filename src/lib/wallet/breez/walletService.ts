import init, {
	connect,
	defaultConfig,
	type InputType,
	type BindingLiquidSdk,
	type PrepareSendRequest,
	type PrepareSendResponse,
	type SendPaymentRequest,
	type SendPaymentResponse,
	type LightningPaymentLimitsResponse,
	type PrepareReceiveRequest,
	type PrepareReceiveResponse,
	type ReceivePaymentResponse,
	type Rate,
	type SdkEvent,
	type EventListener,
	type ConnectRequest,
	type Config,
	type Payment,
	type GetInfoResponse
} from '@breeztech/breez-sdk-liquid/web';
import { get, writable } from 'svelte/store';
import { isWasmInitialized } from './wasmLoader';

// Global SDK store for application-wide access
export const sdkStore = writable<BindingLiquidSdk | null>(null);
export const isConnectedStore = writable<boolean>(false);

// Private variables
let eventListenerId: string | null = null;

/**
 * Initialize WASM module (must be called first in web environment)
 */
export async function initializeWasm(): Promise<void> {
	if (isWasmInitialized()) {
		console.log('WASM already initialized');
		return;
	}

	try {
		await init();
		console.log('WASM initialized successfully');
	} catch (error) {
		console.error('Failed to initialize WASM:', error);
		throw error;
	}
}

/**
 * Connect to Breez SDK
 */
export async function connectToBreez(mnemonic: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<BindingLiquidSdk> {
	// Ensure WASM is initialized first
	if (!isWasmInitialized) {
		await initializeWasm();
	}

	// Get API key from environment
	const breezApiKey = import.meta.env.VITE_BREEZ_API_KEY;
	if (!breezApiKey) {
		throw new Error('Breez API key not found');
	}

	// Create default config
	const config: Config = defaultConfig(network, breezApiKey);
	
	// Configure to reduce network activity
	// Note: These may not be available in the current SDK version, 
	// but worth trying if the properties exist
	if ('syncIntervalMs' in config) {
		// Testnet: Longer intervals due to lower rate limits and irregular block times
		// Mainnet: Shorter intervals due to more reliable infrastructure
		(config as any).syncIntervalMs = network === 'testnet' ? 180000 : 60000; // 3min vs 1min
	}
	if ('rescanOnchainSwapsIntervalMs' in config) {
		// Testnet needs longer intervals to avoid hitting Blockstream's lower rate limits
		(config as any).rescanOnchainSwapsIntervalMs = network === 'testnet' ? 600000 : 300000; // 10min vs 5min
	}
	if ('swapStatusCheckIntervalMs' in config) {
		// Additional config that might exist for swap monitoring
		(config as any).swapStatusCheckIntervalMs = network === 'testnet' ? 240000 : 120000; // 4min vs 2min
	}

	// Optional: customize working directory for web
	// config.workingDir = 'custom-path'; // Not needed for web, uses IndexedDB by default

	console.log('Connecting to Breez SDK...');

	// Connect to SDK
	const connectRequest: ConnectRequest = {
		config,
		mnemonic
	};

	const sdkInstance = await connect(connectRequest);
	console.log('Connected to Breez SDK successfully');

	// Update stores
	sdkStore.set(sdkInstance);
	isConnectedStore.set(true);

	// Add event listener
	const eventListener: EventListener = {
		onEvent: (event: SdkEvent) => {
			// Only log important events to reduce processing
			if (event.type === 'paymentSucceeded' || event.type === 'paymentFailed' || event.type === 'synced') {
				console.log('SDK Event:', event);
			}
		}
	};

	eventListenerId = await sdkInstance.addEventListener(eventListener);
	console.log('Event listener added:', eventListenerId);

	return sdkInstance;
}

// Add specific methods for actions components need to perform
// Payment Operations
export const parseInput = async (input: string): Promise<InputType> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.parse(input);
};

export const prepareSendPayment = async (
	params: PrepareSendRequest
): Promise<PrepareSendResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.prepareSendPayment(params);
};

export const sendPayment = async (
	params: SendPaymentRequest
): Promise<SendPaymentResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.sendPayment(params);
};

// Invoice and Receiving Operations
export const fetchLightningLimits = async (): Promise<LightningPaymentLimitsResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.fetchLightningLimits();
};

export const prepareReceivePayment = async (
	params: PrepareReceiveRequest
): Promise<PrepareReceiveResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.prepareReceivePayment(params);
};

export const receivePayment = async (params: {
	prepareResponse: PrepareReceiveResponse;
	description: string;
}): Promise<ReceivePaymentResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.receivePayment(params);
};

// Fiat rate operations
export const fetchFiatRates = async (): Promise<Rate[]> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.fetchFiatRates();
};

// Event handling
export const addEventListener = async (
	callback: (event: SdkEvent) => void
): Promise<string> => {
	const sdk = get(sdkStore);
	if (!sdk) {
		throw new Error('SDK not initialized');
	}

	try {
		// Create event listener
		const listener: EventListener = {
			onEvent: callback
		};

		// Add event listener to SDK and return its ID
		const listenerId = await sdk.addEventListener(listener);
		console.log('Event listener added with ID:', listenerId);
		return listenerId;
	} catch (error) {
		console.error('Failed to add event listener:', error);
		throw error;
	}
};

// Remove event listener directly from the SDK
export const removeEventListener = async (listenerId: string): Promise<void> => {
	const sdk = get(sdkStore);
	if (!sdk || !listenerId) {
		return;
	}

	try {
		await sdk.removeEventListener(listenerId);
		console.log('Event listener removed:', listenerId);
	} catch (error) {
		console.error(`Failed to remove event listener ${listenerId}:`, error);
		throw error;
	}
};

/**
 * Get wallet information
 */
export async function getWalletInfo(): Promise<GetInfoResponse> {
	const sdk = get(sdkStore);
	if (!sdk) {
		throw new Error('SDK not connected. Call connectToBreez first.');
	}

	try {
		return await sdk.getInfo();
	} catch (error) {
		console.error('Failed to get wallet info:', error);
		throw error;
	}
};

export const getTransactions = async (): Promise<Payment[]> => {
	const sdk = get(sdkStore);
	if (!sdk) {
		throw new Error('SDK not connected. Call connectToBreez first.');
	}

	try {
		return await sdk.listPayments({
			sortAscending: false // Most recent first
		});
	} catch (error) {
		console.error('Failed to get transactions:', error);
		throw error;
	}
};

/**
 * Disconnect from SDK
 */
export const disconnect = async (): Promise<void> => {
	const sdk = get(sdkStore);
	if (sdk) {
		try {
			// Remove our event listener first
			if (eventListenerId) {
				await sdk.removeEventListener(eventListenerId);
				eventListenerId = null;
			}

			// Disconnect SDK (this will clean up all listeners registered with it)
			await sdk.disconnect();
			sdkStore.set(null);
			isConnectedStore.set(false);
			console.log('Wallet disconnected successfully');
		} catch (error) {
			console.error('Failed to disconnect wallet:', error);
			throw error;
		}
	}
};

/**
 * Report excessive API usage issue to Breez team
 * This should be called if you notice rate limiting from Blockstream
 */
export const reportExcessiveApiUsage = () => {
	const issueDetails = {
		sdkVersion: '@breeztech/breez-sdk-liquid',
		issue: 'Excessive Blockstream API requests causing rate limiting',
		endpoint: 'https://blockstream.info/liquidtestnet/api/address/*/txs',
		impact: 'Application blocked due to too many requests',
		timestamp: new Date().toISOString(),
		userAgent: navigator.userAgent,
		platform: 'web'
	};
	
	console.error('[Breez SDK Issue]', issueDetails);
	console.log('📧 Please report this to Breez support:');
	console.log('• Telegram: https://t.me/breezsdk');
	console.log('• Email: contact@breez.technology');
	console.log('• Include the above issue details');
	
	return issueDetails;
};
