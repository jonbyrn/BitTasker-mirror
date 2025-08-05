import {
	prepareSendPayment
} from '$lib/wallet/breez/walletService';
import { getAssetId } from '$lib/constants/assets';
import { BoltzClient } from '$lib/integrations/boltz/client';
import { getCurrentNetwork } from '$lib/constants/assets';
import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';

// Bitcoin wallet for BTC transactions
const bitcoinWallet = createBitcoinWallet();

// Boltz client for swap operations
const currentNetwork = getCurrentNetwork();
const boltzClient = new BoltzClient({
	apiUrl: 'https://api.boltz.exchange',
	network: currentNetwork
});

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
			// Use dynamic Bitcoin wallet fees for BTC transactions
			return await estimateBitcoinFees(amountSats, addressType, feeRate);
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

async function estimateBitcoinFees(amountSats: number, addressType: string, feeRate: 'slow' | 'medium' | 'fast'): Promise<{ estimatedFees: number; feeError: string | null }> {
	if (addressType === 'lightning') {
		// For Bitcoin to Lightning swaps, try to get dynamic fees from Boltz
		try {
			const boltzFees = await boltzClient.getSwapFees();
			// Use dynamic reverse swap fees (Bitcoin to Lightning)
			const baseFee = Math.ceil(amountSats * (boltzFees.percentage / 100));
			const minerFees = boltzFees.miner.reverse.lockup + boltzFees.miner.reverse.claim;
			const estimatedFees = baseFee + minerFees;
			console.log(
				`💰 Dynamic Boltz swap fees: ${estimatedFees} sats (${boltzFees.percentage}% + ${minerFees} mining fees)`
			);
			return { estimatedFees, feeError: null };
		} catch (boltzError) {
			console.warn('Could not get dynamic Boltz fees:', boltzError);
			return { estimatedFees: 0, feeError: null }; // Unknown fees
		}
	} else {
		// Direct Bitcoin transaction - use dynamic fee rates
		try {
			const feeRates = await bitcoinWallet.getFeeEstimates();
			const selectedFeeRate = feeRates[feeRate];

			// Estimate transaction size more accurately
			const estimatedTxSize = 250; // Conservative estimate for typical tx
			const estimatedFees = Math.ceil(selectedFeeRate * estimatedTxSize);

			console.log(`💰 Dynamic Bitcoin fees: ${estimatedFees} sats (${selectedFeeRate} sat/vB)`);
			return { estimatedFees, feeError: null };
		} catch (btcError) {
			console.warn('Could not get dynamic Bitcoin fees:', btcError);
			return { estimatedFees: 0, feeError: null }; // Unknown fees
		}
	}
}