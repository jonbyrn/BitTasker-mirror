/**
 * Pure utility function to parse a send payment address.
 *
 * Extracts the shared parsing logic that was duplicated between
 * handleQRScan and handleAddressInput in SendPaymentForm.svelte.
 *
 * This is a pure function — no Svelte imports, no store access.
 * Adds a Sentry breadcrumb on unexpected parse failure for observability.
 * LNURL resolution (async) is intentionally excluded; callers handle that separately.
 *
 * @module parseSendAddress
 */

import {
	parsePaymentAddress,
	isLNURL,
	type ParsedPaymentAddress
} from '$lib/utils/helpers/paymentAddressParser';
import * as Sentry from '@sentry/sveltekit';

/**
 * Normalized result from parsing a send address.
 * Maps directly to the parsedPayment state fields in SendPaymentForm.
 */
export interface SendAddressResult {
	/** Whether the address is valid and parseable */
	isValid: boolean;
	/** Full parsed data from parsePaymentAddress (null when invalid) */
	data: ParsedPaymentAddress | null;
	/** Detected network (e.g. 'lightning-bitcoin', 'rootstock-bitcoin') */
	network: ParsedPaymentAddress['network'];
	/** Detected amount in sats (null when not specified) */
	amount: number | null;
	/** Detected memo/description (null when not present) */
	memo: string | null;
	/** Whether the user must enter an amount manually */
	amountRequired: boolean;
	/** Error message key for display (null when no error) */
	addressError: string | null;
	/** Whether this address is an LNURL that needs async resolution */
	isLnurl: boolean;
}

const INVALID_RESULT: SendAddressResult = Object.freeze({
	isValid: false,
	data: null,
	network: null,
	amount: null,
	memo: null,
	amountRequired: true,
	addressError: null,
	isLnurl: false
});

/**
 * Parse a payment address string into a normalized SendAddressResult.
 *
 * Handles defensive input validation, delegates to parsePaymentAddress for
 * actual parsing, and normalizes the result into a consistent shape that
 * maps to SendPaymentForm's parsedPayment state.
 *
 * @param address - The raw address/invoice string (may be null, undefined, empty)
 * @param source - The source wallet type for EVM address disambiguation
 * @returns Normalized parsing result with all fields populated
 */
export function parseSendAddress(
	address: string | null | undefined,
	source: 'usdt0-arb' | 'rootstock-bitcoin' | 'usdt-bsc'
): SendAddressResult {
	// Defensive: handle non-string inputs
	if (address === null || address === undefined) {
		return { ...INVALID_RESULT };
	}

	if (typeof address !== 'string') {
		return { ...INVALID_RESULT };
	}

	const trimmed = address.trim();

	if (!trimmed) {
		return { ...INVALID_RESULT };
	}

	try {
		const parsed = parsePaymentAddress(trimmed, source);

		if (!parsed.isValid) {
			// Map error message to addressError for display
			const addressError =
				parsed.errorMessage === 'amountless_invoice'
					? 'amountless_invoice' // Caller maps to i18n key
					: parsed.errorMessage || null;

			return {
				isValid: false,
				data: null,
				network: parsed.network,
				amount: null,
				memo: parsed.memo || null,
				amountRequired: true,
				addressError,
				isLnurl: false
			};
		}

		// Valid address — normalize result
		const isLnurl = isLNURL(trimmed);
		const amountRequired = parsed.amount === null;

		return {
			isValid: true,
			data: parsed,
			network: parsed.network,
			amount: parsed.amount,
			memo: parsed.memo || null,
			amountRequired,
			addressError: null,
			isLnurl
		};
	} catch (e) {
		Sentry.addBreadcrumb({
			category: 'send',
			message: 'parseSendAddress unexpected error',
			level: 'warning',
			data: { error: (e as Error).message }
		});
		return { ...INVALID_RESULT };
	}
}
