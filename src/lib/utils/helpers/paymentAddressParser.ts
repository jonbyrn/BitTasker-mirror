import { detectLightningType, parseLightningInvoice } from './lightningInvoice';
import { validateRSKAddress, validateBitcoinAddress } from './validators';

export interface ParsedPaymentAddress {
	isValid: boolean;
	address: string;
	network: 'lightning-bitcoin' | 'rootstock-bitcoin' | 'liquid-bitcoin' | 'bitcoin' | 'usdt-bsc' | null;
	amount: number | null; // Amount in sats, null if not specified
	memo: string | null;
}

/**
 * Parse payment address/invoice and extract network, amount, and memo
 * Supports Lightning invoices, Lightning addresses, RSK addresses, Bitcoin addresses
 */
export async function parsePaymentAddress(input: string): Promise<ParsedPaymentAddress> {
	const trimmed = input.trim();

	if (!trimmed) {
		return {
			isValid: false,
			address: '',
			network: null,
			amount: null,
			memo: null
		};
	}

	// 1. Check for Lightning invoice/address
	const lightningType = detectLightningType(trimmed);
	if (lightningType === 'bolt11') {
		const parsed = parseLightningInvoice(trimmed);
		return {
			isValid: parsed.isValid,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: parsed.amountSats,
			memo: null // Lightning invoices don't typically include memo in QR code
		};
	}

	if (lightningType === 'lightning-address') {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null, // Lightning addresses require amount to be specified
			memo: null
		};
	}

	// 2. Check for RSK address (with optional query params)
	const rskAddressPart = trimmed.split('?')[0];
	if (validateRSKAddress(rskAddressPart).isValid) {
		try {
			// Handle RSK URI format: rsk:0x...?value=...&message=...
			const uri = trimmed.includes('://') ? trimmed : `rsk:${trimmed}`;
			const url = new URL(uri);

			let amount: number | null = null;
			if (url.searchParams.has('value')) {
				// Convert wei to sats: 1 sat = 1e10 wei (since 1 BTC = 1e8 sats = 1e18 wei)
				const wei = BigInt(url.searchParams.get('value')!);
				amount = Number(wei / BigInt(1e10));
			}

			return {
				isValid: true,
				address: url.pathname || rskAddressPart,
				network: 'rootstock-bitcoin',
				amount,
				memo: url.searchParams.get('message') || null
			};
		} catch (error) {
			// If URL parsing fails, return basic RSK address
			return {
				isValid: true,
				address: rskAddressPart,
				network: 'rootstock-bitcoin',
				amount: null,
				memo: null
			};
		}
	}

	// 3. Check for Bitcoin address (with optional amount/memo)
	const btcAddressPart = trimmed.split('?')[0];
	if (validateBitcoinAddress(btcAddressPart).isValid) {
		try {
			// Handle Bitcoin URI format: bitcoin:address?amount=...&label=...&message=...
			const uri = trimmed.includes('://') ? trimmed : `bitcoin:${trimmed}`;
			const url = new URL(uri);

			let amount: number | null = null;
			if (url.searchParams.has('amount')) {
				// Convert BTC to sats
				const btc = parseFloat(url.searchParams.get('amount')!);
				if (!isNaN(btc)) {
					amount = Math.floor(btc * 100_000_000);
				}
			}

			const memo = url.searchParams.get('label') || url.searchParams.get('message') || null;

			return {
				isValid: true,
				address: url.pathname || btcAddressPart,
				network: 'bitcoin',
				amount,
				memo
			};
		} catch (error) {
			// If URL parsing fails, return basic Bitcoin address
			return {
				isValid: true,
				address: btcAddressPart,
				network: 'bitcoin',
				amount: null,
				memo: null
			};
		}
	}

	// 4. TODO: Check for Liquid address (similar to Bitcoin)
	// 5. TODO: Check for BSC USDT address

	// Invalid address format
	return {
		isValid: false,
		address: trimmed,
		network: null,
		amount: null,
		memo: null
	};
}

