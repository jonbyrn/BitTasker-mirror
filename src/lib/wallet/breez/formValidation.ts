export interface ValidationParams {
	recipientAddress: string;
	amount: string;
	addressType: string;
	selectedAsset: string;
	availableBalance: number;
	estimatedFees: number;
	limits: any;
	useMainUnit: boolean;
}

function formatSatsDisplay(sats: number, selectedAsset: string): string {
	if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
		return `${sats.toLocaleString()} sats`;
	} else if (selectedAsset === 'USDt') {
		return `${(sats / 100_000_000).toFixed(2)} USDt`;
	}
	return `${sats} units`;
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

export function validateForm(params: ValidationParams): { isValid: boolean; error: string | null } {
	const {
		recipientAddress,
		amount,
		addressType,
		selectedAsset,
		availableBalance,
		estimatedFees,
		limits,
		useMainUnit
	} = params;

	let error: string | null = null;

	if (!recipientAddress.trim()) {
		error = 'Please enter a recipient address';
	} else if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
		error = 'Please enter a valid amount';
	} else if (addressType === 'unknown') {
		error = 'Invalid or unsupported address format';
	} else {
		// Convert amount to satoshis for validation
		const amountSats = convertToSatoshis(amount, selectedAsset, useMainUnit);

		// Check limits
		if (selectedAsset === 'L-BTC' && limits.lightning) {
			const minSats = limits.lightning.send?.minSat || 0;
			const maxSats = limits.lightning.send?.maxSat || Number.MAX_SAFE_INTEGER;

			if (amountSats < minSats) {
				error = `Minimum amount is ${formatSatsDisplay(minSats, selectedAsset)}`;
			} else if (amountSats > maxSats) {
				error = `Maximum amount is ${formatSatsDisplay(maxSats, selectedAsset)}`;
			}
		}

		if (selectedAsset === 'BTC' && limits.onchain) {
			const minSats = limits.onchain.send?.minSat || 0;
			const maxSats = limits.onchain.send?.maxSat || Number.MAX_SAFE_INTEGER;

			if (amountSats < minSats) {
				error = `Minimum amount is ${formatSatsDisplay(minSats, selectedAsset)}`;
			} else if (amountSats > maxSats) {
				error = `Maximum amount is ${formatSatsDisplay(maxSats, selectedAsset)}`;
			}
		}

		// Check for dust amounts (very small amounts that aren't economical)
		if (!error && amountSats < 546) {
			// Bitcoin dust limit
			error = 'Amount too small (below dust limit)';
		}

		// Check if user has enough balance including fees
		if (!error && estimatedFees > 0) {
			// We have dynamic fee information - do proper validation
			const totalRequired = amountSats + estimatedFees;
			if (availableBalance < totalRequired) {
				const maxSendable = Math.max(0, availableBalance - estimatedFees);
				if (maxSendable <= 0) {
					error = `Insufficient balance. You need at least ${formatSatsDisplay(estimatedFees, selectedAsset)} for fees.`;
				} else {
					error = `Insufficient balance. Maximum sendable: ${formatSatsDisplay(maxSendable, selectedAsset)} (${formatSatsDisplay(availableBalance, selectedAsset)} balance - ${formatSatsDisplay(estimatedFees, selectedAsset)} fees)`;
				}
			}
		} else if (!error && estimatedFees === 0 && recipientAddress.trim() && ['lightning', 'bitcoin', 'liquid', 'lnurlPay', 'bolt12'].includes(addressType)) {
			// Fees are unknown but we have a valid recipient - warn user
			console.warn(
				'⚠️ Proceeding without fee information - fees will be determined during transaction'
			);
			// Allow transaction to proceed - fees will be calculated during prepareSend
		}

		// Check asset compatibility
		if (!error && selectedAsset === 'BTC' && addressType === 'liquid') {
			error = 'Cannot send Bitcoin to Liquid address directly. Use swap functionality.';
		}

		if (!error && (selectedAsset === 'L-BTC' || selectedAsset === 'USDt') && addressType === 'bitcoin') {
			error = 'Cannot send Liquid assets to Bitcoin address directly. Use swap functionality.';
		}
	}

	const isValid = !error;
	return { error, isValid };
}