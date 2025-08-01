import init, {
	connect,
	defaultConfig,
	setLogger,
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
	type PreparePayOnchainResponse,
	type PrepareLnUrlPayRequest,
	type PrepareLnUrlPayResponse,
	type LnUrlPayRequest,
	type LnUrlPayResult,
	type LnUrlWithdrawRequest,
	type LnUrlWithdrawResult,
	type ListPaymentsRequest,
	type GetPaymentRequest,
	type LogEntry
} from '@breeztech/breez-sdk-liquid/web';
import { get, writable, type Writable } from 'svelte/store';
import { isWasmInitialized } from './wasmLoader';
import { passkeyMiddleware, breezSecurity } from './security';

// Global SDK store for application-wide access
export const sdkStore = writable<BindingLiquidSdk | null>(null);
export const isConnectedStore = writable<boolean>(false);

// Payment state management
export const pendingPaymentsStore = writable<Payment[]>([]);
export const paymentEventsStore = writable<SdkEvent[]>([]);
export const logger: Writable<ProductionLogger | null> = writable(null);

// Private variables
let eventListenerId: string | null = null;
let pendingPaymentPollingInterval: NodeJS.Timeout | null = null;

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

// Payment event listener for production monitoring
class PaymentEventListener implements EventListener {
	onEvent = (event: SdkEvent) => {
		const timestamp = new Date().toISOString();
		console.log(`Payment Event:`, event);

		// Update event store for UI consumption
		paymentEventsStore.update(events => [...events.slice(-49), event]);

		// Handle specific payment events
		this.handlePaymentEvent(event);
	}

	private handlePaymentEvent(event: SdkEvent) {
		switch (event.type) {
			case 'paymentPending':
				this.handlePaymentPending(event);
				break;
			case 'paymentWaitingConfirmation':
				this.handlePaymentWaitingConfirmation(event);
				break;
			case 'paymentSucceeded':
				this.handlePaymentSucceeded(event);
				break;
			case 'paymentFailed':
				this.handlePaymentFailed(event);
				break;
			case 'paymentRefundPending':
				this.handlePaymentRefundPending(event);
				break;
			case 'paymentRefunded':
				this.handlePaymentRefunded(event);
				break;
		}
	}

	private handlePaymentPending(event: SdkEvent) {
		// Update UI to show pending status
		console.log('Payment pending - updating UI status');
	}

	private handlePaymentWaitingConfirmation(event: SdkEvent) {
		// Show confirmation waiting status
		console.log('Payment waiting for confirmation');
	}

	private handlePaymentSucceeded(event: SdkEvent) {
		// Show success notification
		console.log('Payment succeeded');
		this.refreshPendingPayments();
	}

	private handlePaymentFailed(event: SdkEvent) {
		// Show failure notification and enable retry
		console.log('Payment failed - enabling retry');
		this.refreshPendingPayments();
	}

	private handlePaymentRefundPending(event: SdkEvent) {
		// Show refund pending status
		console.log('Refund pending');
	}

	private handlePaymentRefunded(event: SdkEvent) {
		// Show refund completion
		console.log('Payment refunded');
		this.refreshPendingPayments();
	}

	private async refreshPendingPayments() {
		try {
			const payments = await listPendingPayments();
			pendingPaymentsStore.set(payments);
		} catch (error) {
			console.error('Failed to refresh pending payments:', error);
		}
	}
}

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
 * Connect to Breez SDK with production features
 */
export async function connectToBreez(mnemonic: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<BindingLiquidSdk> {
	// Ensure WASM is initialized first
	if (!get(isWasmInitialized)) {
		await initializeWasm();
	}

	let log = get(logger)
	if (!log) {
		// Initialize production logging
		log = new ProductionLogger();
		logger.set(log);
		setLogger(log);
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

	// Add production event listener
	const eventListener = new PaymentEventListener();
	eventListenerId = await sdkInstance.addEventListener(eventListener);

	console.log('📡 Payment event listener registered');

	// Start pending payment monitoring
	startPendingPaymentMonitoring();

	console.log('⏱️ Pending payment monitoring started');

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
			// Stop pending payment monitoring
			stopPendingPaymentMonitoring();

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
 * Parse input to detect Lightning addresses, BOLT12 offers, LNURL, etc.
 */
export const parseInputAdvanced = async (input: string): Promise<InputType> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const parsed = await sdk.parse(input);
		console.log('📋 Input parsed:', { type: parsed.type, input });
		return parsed;
	} catch (error) {
		console.error('Failed to parse input:', error);
		throw error;
	}
};

/**
 * BOLT12 offer support
 */
export const prepareBolt12Payment = async (
	offer: string,
	amountSat?: number,
	comment?: string
): Promise<PrepareSendResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const parsed = await sdk.parse(offer);
		if (parsed.type !== 'bolt12Offer') {
			throw new Error('Input is not a BOLT12 offer');
		}

		const prepareParams: PrepareSendRequest = {
			destination: offer,
			amount: amountSat ? {
				type: 'bitcoin',
				receiverAmountSat: amountSat
			} : undefined
		};

		return await sdk.prepareSendPayment(prepareParams);
	} catch (error) {
		console.error('Failed to prepare BOLT12 payment:', error);
		throw error;
	}
};

/**
 * LNURL-Pay integration
 */
export const prepareLnurlPayment = async (
	lnurlPayUrl: string,
	amountSat: number,
	comment?: string
): Promise<PrepareLnUrlPayResponse> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const input = await sdk.parse(lnurlPayUrl);
		if (input.type !== 'lnUrlPay') {
			throw new Error('Input is not a valid LNURL-Pay');
		}

		const prepareRequest: PrepareLnUrlPayRequest = {
			data: input.data,
			amount: {
				type: 'bitcoin',
				receiverAmountSat: amountSat
			},
			comment,
			validateSuccessActionUrl: true
		};

		return await sdk.prepareLnurlPay(prepareRequest);
	} catch (error) {
		console.error('Failed to prepare LNURL-Pay:', error);
		throw error;
	}
};

/**
 * Execute LNURL-Pay
 */
export const executeLnurlPayment = async (
	prepareResponse: PrepareLnUrlPayResponse
): Promise<LnUrlPayResult> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const request: LnUrlPayRequest = { prepareResponse };
		return await sdk.lnurlPay(request);
	} catch (error) {
		console.error('Failed to execute LNURL-Pay:', error);
		throw error;
	}
};

/**
 * LNURL-Withdraw support
 */
export const executeLnurlWithdraw = async (
	lnurlWithdrawUrl: string,
	amountMsat: number,
	description?: string
): Promise<LnUrlWithdrawResult> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const input = await sdk.parse(lnurlWithdrawUrl);
		if (input.type !== 'lnUrlWithdraw') {
			throw new Error('Input is not a valid LNURL-Withdraw');
		}

		const request: LnUrlWithdrawRequest = {
			data: input.data,
			amountMsat,
			description: description || 'LNURL Withdraw'
		};

		return await sdk.lnurlWithdraw(request);
	} catch (error) {
		console.error('Failed to execute LNURL-Withdraw:', error);
		throw error;
	}
};

/**
 * LNURL-Auth support
 */
export const executeLnurlAuth = async (
	lnurlAuthUrl: string
): Promise<any> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const input = await sdk.parse(lnurlAuthUrl);
		if (input.type !== 'lnUrlAuth') {
			throw new Error('Input is not a valid LNURL-Auth');
		}

		return await sdk.lnurlAuth(input.data);
	} catch (error) {
		console.error('Failed to execute LNURL-Auth:', error);
		throw error;
	}
};

/**
 * List pending payments that may need user action
 */
export const listPendingPayments = async (): Promise<Payment[]> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const request: ListPaymentsRequest = {
			states: ['pending', 'waitingFeeAcceptance']
		};

		return await sdk.listPayments(request);
	} catch (error) {
		console.error('Failed to list pending payments:', error);
		throw error;
	}
};

/**
 * Get payment by hash or swap ID
 */
export const getPaymentDetails = async (
	paymentHash?: string,
	swapId?: string
): Promise<Payment | null> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		let request: GetPaymentRequest;

		if (paymentHash) {
			request = { type: 'paymentHash', paymentHash };
		} else if (swapId) {
			request = { type: 'swapId', swapId };
		} else {
			throw new Error('Either paymentHash or swapId must be provided');
		}

		const result = await sdk.getPayment(request);
		return result || null;
	} catch (error) {
		console.error('Failed to get payment details:', error);
		return null;
	}
};

/**
 * Handle amountless Bitcoin payments that need fee acceptance
 */
export const handleAmountlessBitcoinPayments = async (): Promise<void> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		const payments = await sdk.listPayments({
			states: ['waitingFeeAcceptance']
		});

		for (const payment of payments) {
			if (payment.details?.type !== 'bitcoin') continue;

			console.log('📋 Processing amountless Bitcoin payment:', payment.timestamp || 'unknown');

			// Fetch proposed fees
			const feeResponse = await sdk.fetchPaymentProposedFees({
				swapId: payment.details.swapId
			});

			console.log(`💰 Proposed fees: ${feeResponse.feesSat} sats for ${feeResponse.payerAmountSat} sats`);

			// Auto-accept fees under reasonable threshold (e.g., 2%)
			const feePercentage = (feeResponse.feesSat / feeResponse.payerAmountSat) * 100;

			if (feePercentage <= 2.0) {
				console.log('✅ Auto-accepting reasonable fee');
				await sdk.acceptPaymentProposedFees({ response: feeResponse });
			} else {
				console.log('⚠️ High fee detected, requires manual approval');
				// Store for manual review - in production, show UI notification
			}
		}
	} catch (error) {
		console.error('Failed to handle amountless Bitcoin payments:', error);
		throw error;
	}
};

/**
 * Register webhook for offline payment notifications
 */
export const registerNotificationWebhook = async (
	webhookUrl: string
): Promise<void> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		await sdk.registerWebhook(webhookUrl);
		console.log('🔔 Notification webhook registered:', webhookUrl);
	} catch (error) {
		console.error('Failed to register webhook:', error);
		throw error;
	}
};

/**
 * Unregister webhook
 */
export const unregisterNotificationWebhook = async (): Promise<void> => {
	const sdk = get(sdkStore);
	if (!sdk) throw new Error('SDK not initialized');

	try {
		await sdk.unregisterWebhook();
		console.log('🔕 Notification webhook unregistered');
	} catch (error) {
		console.error('Failed to unregister webhook:', error);
		throw error;
	}
};

/**
 * Detect Magic Routing Hints (MRH) for direct Liquid payments
 */
export const detectMagicRoutingHints = async (invoice: string): Promise<boolean> => {
	try {
		const parsed = await parseInputAdvanced(invoice);
		if (parsed.type === 'bolt11') {
			// TODO: Check if the invoice contains Magic Routing Hints
			// This is a simplified check - in production, you'd parse the BOLT11 more thoroughly
			return invoice.includes('liquid') || invoice.includes('mrh');
		}
		return false;
	} catch (error) {
		console.error('Failed to detect Magic Routing Hints:', error);
		return false;
	}
};

/**
 * Start monitoring pending payments
 */
function startPendingPaymentMonitoring(): void {
	// Poll every 30 seconds for pending payment updates
	pendingPaymentPollingInterval = setInterval(async () => {
		try {
			const pendingPayments = await listPendingPayments();
			pendingPaymentsStore.set(pendingPayments);

			// Handle amountless Bitcoin payments automatically
			await handleAmountlessBitcoinPayments();
		} catch (error) {
			console.error('Pending payment monitoring error:', error);
		}
	}, 30000); // 30 seconds
}

/**
 * Stop monitoring pending payments
 */
function stopPendingPaymentMonitoring(): void {
	if (pendingPaymentPollingInterval) {
		clearInterval(pendingPaymentPollingInterval);
		pendingPaymentPollingInterval = null;
		console.log('⏹️ Pending payment monitoring stopped');
	}
}
