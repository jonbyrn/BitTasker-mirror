import type {
	InputType,
	PrepareSendRequest,
	PrepareSendResponse,
	SendPaymentRequest,
	SendPaymentResponse,
	PrepareReceiveRequest,
	PrepareReceiveResponse,
	ReceivePaymentResponse,
	LightningPaymentLimitsResponse,
	OnchainPaymentLimitsResponse,
	PreparePayOnchainRequest,
	PreparePayOnchainResponse,
	ListPaymentsRequest,
	GetPaymentRequest,
	Payment
} from '@breeztech/breez-sdk-liquid/web';
import { getSdk } from './sdk';
import { passkeyMiddleware, breezSecurity } from './security';

/**
 * Parse input to detect Lightning addresses, BOLT12 offers, LNURL, etc.
 */
export async function parseInput(input: string): Promise<InputType> {
	const sdk = getSdk();
	return await sdk.parse(input);
}

/**
 * Prepare send payment
 */
export async function prepareSendPayment(
	params: PrepareSendRequest
): Promise<PrepareSendResponse> {
	const sdk = getSdk();
	return await sdk.prepareSendPayment(params);
}

/**
 * Send payment with security middleware
 */
export async function sendPayment(
	params: SendPaymentRequest
): Promise<SendPaymentResponse> {
	const sdk = getSdk();

	// Apply passkey security middleware
	const isAuthorized = await passkeyMiddleware.secureSendPayment(
		{ destination: 'unknown' }, // We need to track the original prepare request
		params.prepareResponse
	);

	if (!isAuthorized) {
		throw new Error('Payment not authorized - passkey verification failed');
	}

	return await sdk.sendPayment(params);
}

/**
 * Get Lightning payment limits
 */
export async function fetchLightningLimits(): Promise<LightningPaymentLimitsResponse> {
	const sdk = getSdk();
	return await sdk.fetchLightningLimits();
}

/**
 * Prepare receive payment
 */
export async function prepareReceivePayment(
	params: PrepareReceiveRequest
): Promise<PrepareReceiveResponse> {
	const sdk = getSdk();
	return await sdk.prepareReceivePayment(params);
}

/**
 * Create receive payment
 */
export async function receivePayment(params: {
	prepareResponse: PrepareReceiveResponse;
	description: string;
}): Promise<ReceivePaymentResponse> {
	const sdk = getSdk();
	return await sdk.receivePayment(params);
}

/**
 * Get on-chain payment limits
 */
export async function fetchOnchainLimits(): Promise<OnchainPaymentLimitsResponse> {
	const sdk = getSdk();
	return await sdk.fetchOnchainLimits();
}

/**
 * Prepare on-chain payment
 */
export async function preparePayOnchain(
	params: PreparePayOnchainRequest
): Promise<PreparePayOnchainResponse> {
	const sdk = getSdk();
	return await sdk.preparePayOnchain(params);
}

/**
 * Send on-chain payment (Bitcoin address)
 */
export async function sendOnchainPayment(
	address: string,
	amountSat: number,
	description?: string
): Promise<SendPaymentResponse> {
	const sdk = getSdk();

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
}

/**
 * Send asset payment with security
 */
export async function sendAssetPayment(
	destination: string,
	assetId: string,
	amount: number,
	description?: string
): Promise<SendPaymentResponse> {
	const sdk = getSdk();

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
}

/**
 * Get payment details by hash or swap ID
 */
export async function getPaymentDetails(
	paymentHash?: string,
	swapId?: string
): Promise<Payment | null> {
	const sdk = getSdk();

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
}

/**
 * List transactions
 */
export async function getTransactions(): Promise<Payment[]> {
	const sdk = getSdk();
	return await sdk.listPayments({
		sortAscending: false // Most recent first
	});
}

/**
 * List payments with filters
 */
export async function listPayments(request: ListPaymentsRequest): Promise<Payment[]> {
	const sdk = getSdk();
	return await sdk.listPayments(request);
}