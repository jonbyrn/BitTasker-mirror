// =============================================================================
// Gasless Store — Client-side state and API helpers for gasless transfers
// =============================================================================

import type { FeeEstimate } from '../../types/gasless.types';

// =============================================================================
// API helpers
// =============================================================================

/**
 * Estimate the fee for a gasless token transfer via the relay API.
 *
 * @param token - Token contract address
 * @param amount - Transfer amount in token's smallest unit (bigint)
 * @param recipient - Recipient address
 * @param jwt - Auth token for the relay API
 * @returns Fee estimate with buffer and cost details
 */
export async function estimateFee(
	token: string,
	amount: bigint,
	recipient: string,
	jwt: string
): Promise<FeeEstimate> {
	const relayUrl = getRelayBaseUrl();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

	const response = await fetch(`${relayUrl}/gasless/estimate`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			token,
			amount: amount.toString(),
			recipient
		})
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Fee estimation failed: ${error.message ?? response.statusText}`);
	}

	return response.json();
}

/**
 * Send a gasless token transfer via the relay API.
 *
 * @param token - Token contract address
 * @param recipient - Recipient address
 * @param amount - Transfer amount in token's smallest unit (bigint)
 * @param feeBuffer - Fee buffer amount in token's smallest unit (bigint)
 * @param gasLimits - Optional gas limit overrides
 * @param jwt - Auth token for the relay API
 * @param smartAccount - Smart account address (optional)
 * @returns Transaction hash from the bundler
 */
export async function sendToken(
	token: string,
	recipient: string,
	amount: bigint,
	feeBuffer: bigint,
	gasLimits: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint },
	jwt: string,
	smartAccount: string | null
): Promise<string> {
	const relayUrl = getRelayBaseUrl();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

	const response = await fetch(`${relayUrl}/gasless/relay`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			token,
			recipient,
			amount: amount.toString(),
			feeBuffer: feeBuffer.toString(),
			gasLimits: {
				callGasLimit: gasLimits.callGasLimit.toString(),
				verificationGasLimit: gasLimits.verificationGasLimit.toString(),
				preVerificationGas: gasLimits.preVerificationGas.toString()
			},
			smartAccount
		})
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Gasless send failed: ${error.message ?? response.statusText}`);
	}

	const result = await response.json();
	return result.txHash as string;
}

/**
 * Check if the user's balance is sufficient to cover the transfer amount + fee buffer.
 *
 * @param token - Token contract address
 * @param recipient - Recipient address (unused in check, reserved for future recipient-based checks)
 * @param amount - Transfer amount in token's smallest unit
 * @param feeBuffer - Fee buffer amount in token's smallest unit
 * @returns Balance check result
 */
export async function checkSufficientBalance(
	token: string,
	recipient: string,
	amount: bigint,
	feeBuffer: bigint
): Promise<{
	sufficient: boolean;
	balance: bigint;
	required: bigint;
}> {
	const relayUrl = getRelayBaseUrl();

	const response = await fetch(`${relayUrl}/gasless/balance`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			token,
			amount: amount.toString(),
			feeBuffer: feeBuffer.toString()
		})
	});

	if (!response.ok) {
		throw new Error(`Balance check failed: ${response.statusText}`);
	}

	const result = await response.json();
	return {
		sufficient: result.sufficient as boolean,
		balance: BigInt(result.balance ?? '0'),
		required: BigInt(result.required ?? '0')
	};
}

// =============================================================================
// Helpers
// =============================================================================

function getRelayBaseUrl(): string {
	const url = import.meta.env.VITE_TX_RELAY_BASE_URL;
	if (!url) throw new Error('VITE_TX_RELAY_BASE_URL not configured');
	return url.replace(/\/$/, '');
}
