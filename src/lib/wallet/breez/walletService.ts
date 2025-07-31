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
	type GetInfoResponse,
	type OnchainPaymentLimitsResponse,
	type PreparePayOnchainRequest,
	type PreparePayOnchainResponse
} from '@breeztech/breez-sdk-liquid/web';
import { get, writable } from 'svelte/store';
import { isWasmInitialized } from './wasmLoader';
import { passkeyMiddleware, breezSecurity } from './security';

// Global SDK store for application-wide access
export const sdkStore = writable<BindingLiquidSdk | null>(null);
export const isConnectedStore = writable<boolean>(false);

// Private variables
let eventListenerId: string | null = null;

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
 * Connect to Breez SDK
 */
export async function connectToBreez(mnemonic: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<BindingLiquidSdk> {
	// Ensure WASM is initialized first
	if (!get(isWasmInitialized)) {
		await initializeWasm();
	}

	// Get API key from environment
	const breezApiKey = import.meta.env.VITE_BREEZ_API_KEY;
	if (!breezApiKey) {
		throw new Error('Breez API key not found');
	}

	// Create default config
	const config: Config = defaultConfig(network, breezApiKey);
	
	// Configure multi-asset support using centralized constants
	if ('assetMetadata' in config) {
		// Import asset constants
		const { getAssetId } = await import('$lib/constants/assets');
		
		// Add USDT and other asset metadata dynamically
		const assetMetadata = [
			// L-BTC is included by default in Breez SDK
			{
				assetId: getAssetId('USDT'),
				name: 'Tether USD',
				ticker: 'USDt',
				precision: 8,
				fiatId: 'USD' // This enables fee payment with USDT when available
			}
			// TODO: Add more assets here as needed - use getSupportedAssets() helper
		];
		(config as any).assetMetadata = assetMetadata;
	}
	
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

	// Connect to SDK
	const connectRequest: ConnectRequest = {
		config,
		mnemonic
	};

	const sdkInstance = await connect(connectRequest);

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
	
	// Apply passkey security middleware
	const isAuthorized = await passkeyMiddleware.secureSendPayment(
		{ destination: 'unknown' }, // We need to track the original prepare request
		params.prepareResponse
	);
	
	if (!isAuthorized) {
		throw new Error('Payment not authorized - passkey verification failed');
	}
	
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

// On-chain operations
export const fetchOnchainLimits = async (): Promise<OnchainPaymentLimitsResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.fetchOnchainLimits();
};

export const preparePayOnchain = async (
	params: PreparePayOnchainRequest
): Promise<PreparePayOnchainResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	return await sdk.preparePayOnchain(params);
};

// Note: Breez SDK Liquid doesn't have direct on-chain payments
// On-chain payments are handled through prepare/send payment flow
export const sendOnchainPayment = async (
	address: string,
	amountSat: number,
	description?: string
): Promise<SendPaymentResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	
	// Apply passkey security for on-chain payments (always off-platform)
	const isAuthorized = await breezSecurity.verifyPasskeyForOffPlatform(
		address,
		amountSat
	);
	
	if (!isAuthorized) {
		throw new Error('On-chain payment not authorized - passkey verification failed');
	}
	
	// Prepare the payment using Bitcoin address
	const prepareResponse = await sdk.prepareSendPayment({
		destination: address,
		amount: {
			type: 'bitcoin',
			receiverAmountSat: amountSat
		}
	});
	
	// Send the payment
	return await sdk.sendPayment({
		prepareResponse,
		payerNote: description
	});
};

// Asset operations
export const getAssetBalances = async (): Promise<any[]> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	
	const info = await sdk.getInfo();
	return info.walletInfo.assetBalances || [];
};

// Multi-asset send payment with passkey security
export const sendAssetPayment = async (
	destination: string,
	assetId: string,
	amount: number,
	description?: string
): Promise<SendPaymentResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');
	
	// Prepare asset payment
	const prepareResponse = await sdk.prepareSendPayment({
		destination,
		amount: {
			type: 'asset',
			assetId,
			receiverAmount: amount,
			estimateAssetFees: false
		}
	});
	
	// Apply passkey security
	const isAuthorized = await passkeyMiddleware.secureSendPayment(
		{ destination },
		prepareResponse
	);
	
	if (!isAuthorized) {
		throw new Error('Asset payment not authorized - passkey verification failed');
	}
	
	// Send payment
	return await sdk.sendPayment({
		prepareResponse,
		payerNote: description
	});
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
