import type {
	PrepareLnUrlPayRequest,
	PrepareLnUrlPayResponse,
	LnUrlPayRequest,
	LnUrlPayResult,
	LnUrlWithdrawRequest,
	LnUrlWithdrawResult
} from '@breeztech/breez-sdk-liquid/web';
import { getSdk } from './sdk';
import { parseInput } from './payments';

/**
 * Prepare LNURL-Pay payment
 */
export async function prepareLnurlPayment(
	lnurlPayUrl: string,
	amountSat: number,
	comment?: string
): Promise<PrepareLnUrlPayResponse> {
	const sdk = getSdk();

	try {
		const input = await parseInput(lnurlPayUrl);
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
}

/**
 * Execute LNURL-Pay
 */
export async function executeLnurlPayment(
	prepareResponse: PrepareLnUrlPayResponse
): Promise<LnUrlPayResult> {
	const sdk = getSdk();

	try {
		const request: LnUrlPayRequest = { prepareResponse };
		return await sdk.lnurlPay(request);
	} catch (error) {
		console.error('Failed to execute LNURL-Pay:', error);
		throw error;
	}
}

/**
 * Execute LNURL-Withdraw
 */
export async function executeLnurlWithdraw(
	lnurlWithdrawUrl: string,
	amountMsat: number,
	description?: string
): Promise<LnUrlWithdrawResult> {
	const sdk = getSdk();

	try {
		const input = await parseInput(lnurlWithdrawUrl);
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
}

/**
 * Execute LNURL-Auth
 */
export async function executeLnurlAuth(
	lnurlAuthUrl: string
): Promise<any> {
	const sdk = getSdk();

	try {
		const input = await parseInput(lnurlAuthUrl);
		if (input.type !== 'lnUrlAuth') {
			throw new Error('Input is not a valid LNURL-Auth');
		}

		return await sdk.lnurlAuth(input.data);
	} catch (error) {
		console.error('Failed to execute LNURL-Auth:', error);
		throw error;
	}
}

/**
 * Prepare BOLT12 payment
 */
export async function prepareBolt12Payment(
	offer: string,
	amountSat?: number,
	comment?: string
): Promise<any> {
	const sdk = getSdk();

	try {
		const parsed = await parseInput(offer);
		if (parsed.type !== 'bolt12Offer') {
			throw new Error('Input is not a BOLT12 offer');
		}

		const prepareParams = {
			destination: offer,
			amount: amountSat ? {
				type: 'bitcoin' as const,
				receiverAmountSat: amountSat
			} : undefined
		};

		return await sdk.prepareSendPayment(prepareParams);
	} catch (error) {
		console.error('Failed to prepare BOLT12 payment:', error);
		throw error;
	}
}

/**
 * Detect Magic Routing Hints (MRH) for direct Liquid payments
 */
export async function detectMagicRoutingHints(invoice: string): Promise<boolean> {
	try {
		const parsed = await parseInput(invoice);
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
}