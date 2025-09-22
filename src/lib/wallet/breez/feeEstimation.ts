/**
 * Breez SDK Fee Estimation - Comprehensive Implementation
 * 
 * This module provides accurate fee estimation for all Breez SDK payment types:
 * 
 * 1. Lightning Payments (BOLT11/BOLT12/LNURL):
 *    - Uses prepareSendPayment with destination-specific amount handling
 *    - BOLT11: Amount embedded in invoice (no amount param needed)
 *    - BOLT12/LNURL: Requires amount specification
 *    - Supports L-BTC and asset payments through Lightning swaps
 * 
 * 2. Bitcoin On-chain Payments:
 *    - Uses preparePayOnchain (separate API from prepareSendPayment)
 *    - Handles submarine swaps from Liquid to Bitcoin network
 *    - Provides fallback estimates when API unavailable
 * 
 * 3. Liquid Network Payments:
 *    - Uses prepareSendPayment with asset-specific parameters
 *    - L-BTC: PayAmount.Bitcoin with receiverAmountSat
 *    - Other assets: PayAmount.Asset with assetId and receiverAmount
 *    - Supports asset fee estimation for fee-paying assets like USDt
 */

import {
	prepareSendPayment,
	preparePayOnchain,
	parseInput
} from '$lib/wallet/breez/walletService';
import { getAssetId, getCurrentNetwork, LIQUID_ASSET_IDS } from '$lib/utils/constants/assets';

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
	}

	// For all other assets (USDt, etc.), convert to base units
	return Math.floor(numericAmount * 100_000_000);
}

function convertToAssetAmount(inputAmount: string, selectedAsset: string, useMainUnit: boolean): number {
	const numericAmount = parseFloat(inputAmount);

	if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
		// Bitcoin amounts are handled in satoshis
		return convertToSatoshis(inputAmount, selectedAsset, useMainUnit);
	}

	// For other assets, return the decimal amount
	return numericAmount;
}

/**
 * Detect destination type to determine which fee estimation method to use
 */
async function detectDestinationType(destination: string): Promise<{
	type: 'lightning' | 'bitcoin' | 'liquid' | 'unknown';
	inputType?: any;
}> {
	try {
		const inputType = await parseInput(destination.trim());
		
		switch (inputType.type) {
			case 'bolt11':
			case 'bolt12Offer':
			case 'lnUrlPay':
			case 'lnUrlWithdraw':
			case 'lnUrlAuth':
				return { type: 'lightning', inputType };
			
			case 'bitcoinAddress':
				return { type: 'bitcoin', inputType };
			
			case 'liquidAddress':
				return { type: 'liquid', inputType };
			
			default:
				return { type: 'unknown', inputType };
		}
	} catch (error) {
		console.warn('Could not parse destination:', error);
		
		// Fallback to basic pattern matching
		const cleanDest = getCleanAddress(destination);
		
		// Lightning patterns
		if (cleanDest.startsWith('ln') || cleanDest.startsWith('lnbc') || cleanDest.startsWith('lntb')) {
			return { type: 'lightning' };
		}
		
		// Bitcoin patterns
		if (cleanDest.startsWith('bc1') || cleanDest.startsWith('tb1') || 
			cleanDest.startsWith('1') || cleanDest.startsWith('3') ||
			cleanDest.startsWith('m') || cleanDest.startsWith('n')) {
			return { type: 'bitcoin' };
		}
		
		// Liquid patterns
		if (cleanDest.startsWith('lq1') || cleanDest.startsWith('ex1') ||
			cleanDest.startsWith('VJL') || cleanDest.startsWith('VTP')) {
			return { type: 'liquid' };
		}
		
		return { type: 'unknown' };
	}
}

export async function estimateFees(params: {
	recipientAddress: string;
	amount: string;
	selectedAsset: string;
	addressType: string;
	useMainUnit: boolean;
	feeRate: 'slow' | 'medium' | 'fast';
}): Promise<{ estimatedFees: number; feeError: string | null }> {
	const { recipientAddress, amount, selectedAsset, useMainUnit } = params;

	if (!recipientAddress.trim() || !amount) {
		return { estimatedFees: 0, feeError: null };
	}

	try {
		// Detect what type of destination this is
		const destinationInfo = await detectDestinationType(recipientAddress);
		
		switch (destinationInfo.type) {
			case 'lightning':
				return await estimateLightningFees(recipientAddress, amount, selectedAsset, useMainUnit, destinationInfo.inputType);
			
			case 'bitcoin':
				return await estimateBitcoinOnchainFees(amount, selectedAsset, useMainUnit);
			
			case 'liquid':
				return await estimateLiquidFees(recipientAddress, amount, selectedAsset, useMainUnit);
			
			default:
				// Try to guess based on selected asset if destination type is unknown
				if (selectedAsset === 'BTC') {
					return await estimateBitcoinOnchainFees(amount, selectedAsset, useMainUnit);
				} else {
					return await estimateLiquidFees(recipientAddress, amount, selectedAsset, useMainUnit);
				}
		}
	} catch (err) {
		console.warn('Fee estimation failed:', err);
		// Set to 0 to indicate fees are unknown - no hardcoded fallbacks
		return {
			estimatedFees: 0,
			feeError: err instanceof Error ? err.message : 'Fee estimation failed'
		};
	}
}

/**
 * Estimate fees for Lightning payments (BOLT11/BOLT12)
 * 
 * Note: For BOLT11 invoices, the amount is embedded in the invoice.
 * If the user doesn't have enough funds to cover the invoice amount + fees,
 * prepareSendPayment will fail with "not enough funds". In this case,
 * we provide a reasonable fee estimate based on typical Lightning swap costs.
 */
async function estimateLightningFees(
	destination: string,
	amount: string,
	selectedAsset: string,
	useMainUnit: boolean,
	inputType?: any
): Promise<{ estimatedFees: number; feeError: string | null }> {
	const cleanDestination = getCleanAddress(destination);

	try {
		let prepareParams: any = {
			destination: cleanDestination
		};

		// Handle different Lightning payment types
		if (inputType?.type === 'bolt11') {
			// BOLT11 invoices have amount embedded - don't specify amount
			console.log('💡 BOLT11 invoice detected - amount embedded in invoice');
			// For fee estimation purposes, we can try with the embedded amount
			// If it fails due to insufficient funds, we'll catch and provide an estimate
		} else if (inputType?.type === 'bolt12Offer' || inputType?.type === 'lnUrlPay') {
			// BOLT12 offers and LNURL-Pay require amount specification
			if (selectedAsset === 'L-BTC') {
				const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);
				prepareParams.amount = {
					type: 'bitcoin',
					receiverAmountSat: amountSats
				};
			} else {
				// For non-Bitcoin assets sending to Lightning, we need to convert through L-BTC
				const assetAmount = convertToAssetAmount(amount, selectedAsset, useMainUnit);
				const network = getCurrentNetwork();
				const assetId = selectedAsset === 'USDt' ? getAssetId('USDT') : LIQUID_ASSET_IDS[network][selectedAsset as keyof typeof LIQUID_ASSET_IDS[typeof network]];
				
				if (assetId) {
					prepareParams.amount = {
						type: 'asset',
						assetId,
						receiverAmount: assetAmount,
						estimateAssetFees: true
					};
				}
			}
		}

		const prepareResponse = await prepareSendPayment(prepareParams);
		const fees = prepareResponse.feesSat || 0;

		console.log(`⚡ Lightning fees for ${selectedAsset}: ${fees} sats`);
		return { estimatedFees: fees, feeError: null };

	} catch (error) {
		console.warn('Lightning fee estimation failed:', error);
		
		// Handle "not enough funds" error during fee estimation
		if (error instanceof Error && (
			error.message.includes('not enough funds') || 
			error.message.includes('Cannot pay') ||
			error.message.includes('insufficient')
		)) {
			console.log('💡 Insufficient funds for exact fee calculation, providing estimate');
			
			// Provide a reasonable Lightning fee estimate based on typical Lightning swap fees
			// According to Breez SDK docs: ~34 sats (lockup) + ~19 sats (claim) + 0.1% service fee
			const baseAmount = convertToSatoshis(amount, selectedAsset, useMainUnit);
			const serviceFeePercent = 0.001; // 0.1%
			const baseFees = 34 + 19; // Typical lockup + claim transaction fees
			const serviceFee = Math.ceil(baseAmount * serviceFeePercent);
			const estimatedFees = baseFees + serviceFee;
			
			console.log(`⚡ Lightning fee estimate: ${estimatedFees} sats (${baseFees} base + ${serviceFee} service fee) for ${baseAmount} sats payment`);
			
			return { 
				estimatedFees, 
				feeError: null // Don't show error if we have a valid estimate
			};
		}
		
		// For other errors, re-throw
		throw error;
	}
}

/**
 * Estimate fees for Bitcoin on-chain payments
 */
async function estimateBitcoinOnchainFees(
	amount: string,
	selectedAsset: string,
	useMainUnit: boolean
): Promise<{ estimatedFees: number; feeError: string | null }> {
	try {
		const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);

		// Use preparePayOnchain for Bitcoin on-chain transactions
		const prepareResponse = await preparePayOnchain({
			amount: {
				type: 'bitcoin',
				receiverAmountSat: amountSats
			}
		});

		const totalFees = prepareResponse.totalFeesSat || 0;

		console.log(`₿ Bitcoin on-chain fees: ${totalFees} sats for ${amountSats} sats`);
		return { estimatedFees: totalFees, feeError: null };

	} catch (error) {
		console.warn('Bitcoin on-chain fee estimation failed:', error);
		// Provide a reasonable fallback estimate
		const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);
		const fallbackFees = Math.max(1000, Math.ceil(amountSats * 0.01)); // At least 1000 sats or 1%
		return {
			estimatedFees: fallbackFees,
			feeError: 'Using estimated fees - actual fees may vary'
		};
	}
}

/**
 * Estimate fees for Liquid payments (L-BTC and other assets)
 */
async function estimateLiquidFees(
	destination: string,
	amount: string,
	selectedAsset: string,
	useMainUnit: boolean
): Promise<{ estimatedFees: number; feeError: string | null }> {
	const cleanDestination = getCleanAddress(destination);
	const network = getCurrentNetwork();

	try {
		let prepareParams: any = {
			destination: cleanDestination
		};

		if (selectedAsset === 'L-BTC') {
			// L-BTC transactions
			const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);
			prepareParams.amount = {
				type: 'bitcoin',
				receiverAmountSat: amountSats
			};
		} else {
			// Other Liquid assets (USDt, etc.)
			const assetAmount = convertToAssetAmount(amount, selectedAsset, useMainUnit);
			let assetId: string;

			if (selectedAsset === 'USDt') {
				assetId = getAssetId('USDT');
			} else {
				// Try to get asset ID from constants
				assetId = LIQUID_ASSET_IDS[network][selectedAsset as keyof typeof LIQUID_ASSET_IDS[typeof network]];
				if (!assetId) {
					throw new Error(`Unsupported asset: ${selectedAsset}`);
				}
			}

			prepareParams.amount = {
				type: 'asset',
				assetId,
				receiverAmount: assetAmount,
				estimateAssetFees: true // Try to get asset fees for fee-paying assets like USDt
			};
		}

		const prepareResponse = await prepareSendPayment(prepareParams);
		const fees = prepareResponse.feesSat || 0;

		console.log(`🌊 Liquid fees for ${selectedAsset}: ${fees} sats`, {
			destination: cleanDestination,
			estimatedAssetFees: prepareResponse.estimatedAssetFees
		});

		return { estimatedFees: fees, feeError: null };

	} catch (error) {
		console.warn('Liquid fee estimation failed:', error);
		throw error;
	}
}