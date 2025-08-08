import {
	prepareSendPayment
} from '$lib/wallet/breez/walletService';
import { getAssetId } from '$lib/constants/assets';
import { getCurrentNetwork } from '$lib/constants/assets';

function getCleanAddress(input: string): string {
	// Handle BIP21 URIs
	if (input.startsWith('bitcoin:') || input.startsWith('liquidnetwork:')) {
		return input.split('?')[0].replace(/^(bitcoin|liquidnetwork):/, '');
	}

	// Handle addresses with query parameters (malformed BIP21)
	if (
		input.includes('?') &&
		(input.startsWith('lq1') ||
			input.startsWith('ex1') ||
			input.startsWith('bc1') ||
			input.startsWith('1') ||
			input.startsWith('3'))
	) {
		return input.split('?')[0];
	}

	return input;
}

function convertToSatoshis(inputAmount: string, selectedAsset: string, useMainUnit: boolean): number {
	const numericAmount = parseFloat(inputAmount);

	if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
		if (useMainUnit) {
			// Input is in BTC, convert to sats
			return Math.floor(numericAmount * 100_000_000);
		} else {
			// Input is already in sats
			return Math.floor(numericAmount);
		}
	} else if (selectedAsset === 'USDt') {
		// For USDT, use the amount as-is (asset amount, not sats)
		return Math.floor(numericAmount * 100_000_000); // Convert to asset base units
	}

	return Math.floor(numericAmount);
}

export async function estimateFees(params: {
	recipientAddress: string;
	amount: string;
	selectedAsset: string;
	addressType: string;
	useMainUnit: boolean;
	feeRate: 'slow' | 'medium' | 'fast';
}): Promise<{ estimatedFees: number; feeError: string | null }> {
	const { recipientAddress, amount, selectedAsset, addressType, useMainUnit, feeRate } = params;

	if (!recipientAddress.trim() || !amount /* || addressType === 'unknown' */) {
		return { estimatedFees: 0, feeError: null };
	}

	try {
		const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);

		if (selectedAsset === 'L-BTC' || selectedAsset === 'USDt') {
			// Use ONLY Breez SDK's dynamic fee estimation - no fallbacks
			return await estimateBreezFees(amountSats, recipientAddress, selectedAsset);
		} else if (selectedAsset === 'BTC') {
			// For Bitcoin transactions, use Breez SDK to get real fee estimates
			return await estimateBitcoinFees(amountSats, recipientAddress);
		}

		return { estimatedFees: 0, feeError: null };
	} catch (err) {
		console.warn('Fee estimation failed:', err);
		// Set to 0 to indicate fees are unknown - no hardcoded fallbacks
		return {
			estimatedFees: 0,
			feeError: err instanceof Error ? err.message : 'Fee estimation failed'
		};
	}
}

async function estimateBreezFees(amountSats: number, recipientAddress: string, selectedAsset: string): Promise<{ estimatedFees: number; feeError: string | null }> {
	const cleanDestination = getCleanAddress(recipientAddress);

	// Build the prepare request parameters
	const prepareParams = {
		destination: cleanDestination,
		amount:
			selectedAsset === 'USDt'
				? {
					type: 'asset' as const,
					assetId: getAssetId('USDT'),
					receiverAmount: amountSats / 100_000_000, // Convert from base units back to asset units
					estimateAssetFees: true // Try to get asset fees too
				}
				: {
					type: 'bitcoin' as const,
					receiverAmountSat: amountSats
				}
	};

	try {
		// Get REAL dynamic fees from Breez SDK
		const prepareResponse = await prepareSendPayment(prepareParams);

		// Use the actual fee that Breez calculated
		const fees = prepareResponse.feesSat || 0;

		// Log for debugging - this shows the REAL fees Breez will charge
		console.log(`💰 Dynamic Breez fees for ${selectedAsset}:`, {
			destination: cleanDestination,
			amount: amountSats,
			calculatedFees: prepareResponse.feesSat,
			estimatedAssetFees: prepareResponse.estimatedAssetFees
		});

		return { estimatedFees: fees, feeError: null };

	} catch (error) {
		throw error;
	}
}

async function estimateBitcoinFees(amountSats: number, recipientAddress: string): Promise<{ estimatedFees: number; feeError: string | null }> {
	try {
		const cleanDestination = getCleanAddress(recipientAddress);
		
		// Use Breez SDK to prepare the Bitcoin transaction and get real fees
		const prepareParams = {
			destination: cleanDestination,
			amount: {
				type: 'bitcoin' as const,
				receiverAmountSat: amountSats
			}
		};

		const prepareResponse = await prepareSendPayment(prepareParams);
		const fees = prepareResponse.feesSat || 0;

		console.log(`💰 Breez Bitcoin fees: ${fees} sats for ${amountSats} sats to ${cleanDestination}`);
		return { estimatedFees: fees, feeError: null };

	} catch (error) {
		console.warn('Could not get Breez Bitcoin fees:', error);
		// Return a reasonable fee estimate as fallback
		const fallbackFees = Math.ceil(amountSats * 0.01); // 1% fallback
		return { 
			estimatedFees: fallbackFees, 
			feeError: 'Using estimated fees - actual fees may vary' 
		};
	}
}