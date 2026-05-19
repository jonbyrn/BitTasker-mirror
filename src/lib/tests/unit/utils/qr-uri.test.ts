/**
 * QR URI Generation — Unit Tests
 *
 * Tests EIP-681 URI format construction for RSK and BSC payment QR codes.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// buildQrData — extracted from InvoiceDisplay.svelte for testability
// ---------------------------------------------------------------------------

function buildQrData(
	address: string,
	network?: string,
	amountSats?: number,
	isMainnet: boolean = false
): string {
	if (network === 'usdt-bsc') {
		return amountSats ? `bsc:${address}?value=${amountSats}` : `bsc:${address}`;
	}
	if (network === 'rootstock-bitcoin') {
		const chainId = isMainnet ? 30 : 31;
		const base = `rsk:${address}@${chainId}`;
		return amountSats ? `${base}?value=${amountSats}` : base;
	}
	return address;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildQrData', () => {
	const address = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

	describe('BSC (usdt-bsc)', () => {
		it('prefixes with bsc: scheme', () => {
			const result = buildQrData(address, 'usdt-bsc');
			expect(result).toBe(`bsc:${address}`);
		});

		it('includes value param when amount is provided', () => {
			const result = buildQrData(address, 'usdt-bsc', 100000);
			expect(result).toBe(`bsc:${address}?value=100000`);
		});

		it('does not include value when amount is 0', () => {
			const result = buildQrData(address, 'usdt-bsc', 0);
			expect(result).toBe(`bsc:${address}`);
		});
	});

	describe('RSK (rootstock-bitcoin)', () => {
		it('prefixes with rsk: scheme and mainnet chain ID', () => {
			const result = buildQrData(address, 'rootstock-bitcoin', undefined, true);
			expect(result).toBe(`rsk:${address}@30`);
		});

		it('uses testnet chain ID on testnet', () => {
			const result = buildQrData(address, 'rootstock-bitcoin', undefined, false);
			expect(result).toBe(`rsk:${address}@31`);
		});

		it('includes value param with amount', () => {
			const result = buildQrData(address, 'rootstock-bitcoin', 50000, true);
			expect(result).toBe(`rsk:${address}@30?value=50000`);
		});
	});

	describe('pass-through (no network transformation)', () => {
		const bolt11 = 'lnbc10u1p...';

		it('passes through Lightning invoices unchanged', () => {
			expect(buildQrData(bolt11, undefined)).toBe(bolt11);
			expect(buildQrData(bolt11, 'lightning-bitcoin')).toBe(bolt11);
		});

		it('passes through raw addresses when no network specified', () => {
			expect(buildQrData(address)).toBe(address);
		});

		it('passes through Bitcoin addresses unchanged', () => {
			const btcAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
			expect(buildQrData(btcAddr, 'bitcoin')).toBe(btcAddr);
		});

		it('passes through unknown network addresses unchanged', () => {
			expect(buildQrData(address, 'liquid-bitcoin')).toBe(address);
		});
	});

	describe('format validation', () => {
		it('BSB URI starts with bsc:', () => {
			expect(buildQrData(address, 'usdt-bsc').startsWith('bsc:')).toBe(true);
		});

		it('RSK URI starts with rsk: and contains @', () => {
			const result = buildQrData(address, 'rootstock-bitcoin', undefined, true);
			expect(result.startsWith('rsk:')).toBe(true);
			expect(result.includes('@')).toBe(true);
		});

		it('EIP-681 value parameter format is correct', () => {
			const result = buildQrData(address, 'usdt-bsc', 123456);
			expect(result).toContain('?value=123456');
		});
	});
});
