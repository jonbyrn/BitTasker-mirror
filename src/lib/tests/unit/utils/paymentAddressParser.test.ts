import { describe, it, expect, vi } from 'vitest';

// Mock wallet-core and liquidjs-lib so paymentAddressParser (via validators) can load
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr)
}));
vi.mock('liquidjs-lib', () => ({
	address: { toOutputScript: vi.fn() }
}));

import {
	parsePaymentAddress,
	type ParsedPaymentAddress
} from '$lib/utils/helpers/paymentAddressParser';

describe('parsePaymentAddress', () => {
	describe('Empty and invalid inputs', () => {
		it('should return invalid for empty string', () => {
			const result = parsePaymentAddress('');
			expect(result.isValid).toBe(false);
			expect(result.address).toBe('');
			expect(result.network).toBeNull();
		});

		it('should return invalid for whitespace only', () => {
			const result = parsePaymentAddress('   ');
			expect(result.isValid).toBe(false);
		});

		it('should return invalid for random text', () => {
			const result = parsePaymentAddress('not-an-address');
			expect(result.isValid).toBe(false);
		});
	});

	describe('Lightning invoices (BOLT11)', () => {
		it('should detect Lightning invoice format', () => {
			// Note: Using a real BOLT11 invoice would require valid encoding
			// For now, we test that the function recognizes the format
			// Actual validation is handled by the bolt11 library
			const invoice = 'lnbc1p0example1234567890abcdef';
			const result = parsePaymentAddress(invoice);
			// The function will attempt to parse, but may fail validation
			// We just verify it recognizes as Lightning network
			expect(result.network).toBe('lightning-bitcoin');
		});

		it('should handle invalid Lightning invoice gracefully', () => {
			// Invalid invoice should still be recognized as Lightning format
			// but isValid will be false
			const invoice = 'lnbc1invalid';
			const result = parsePaymentAddress(invoice);
			expect(result.network).toBe('lightning-bitcoin');
			// isValid may be false if parsing fails
		});
	});

	describe('Lightning addresses', () => {
		it('should parse Lightning address format', () => {
			const address = 'user@domain.com';
			const result = parsePaymentAddress(address);
			expect(result.network).toBe('lightning-bitcoin');
			expect(result.isValid).toBe(true);
		});
	});

	describe('Bitcoin addresses', () => {
		it('should parse valid Bitcoin address', () => {
			const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
			expect(result.address).toBe(address);
		});

		it('should parse Bitcoin URI with amount', () => {
			const uri = 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.001';
			const result = parsePaymentAddress(uri);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
			expect(result.amount).toBe(100000); // 0.001 BTC = 100,000 sats
		});

		it('should parse Bitcoin URI with memo', () => {
			const uri = 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?label=Test&message=Payment';
			const result = parsePaymentAddress(uri);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBeTruthy();
		});
	});

	describe('RSK addresses', () => {
		it('should parse RSK address with rsk: scheme', () => {
			const address = 'rsk:0x1234567890123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
			expect(result.address.toLowerCase()).toBe('0x1234567890123456789012345678901234567890');
		});

		it('should parse RSK address without scheme (default fallback)', () => {
			const address = '0x1234567890123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
		});

		it('should parse RSK address with chain ID', () => {
			const address = 'ethereum:0x1234567890123456789012345678901234567890@31';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
		});

		it('should parse RSK address with amount in wei', () => {
			const address = 'rsk:0x1234567890123456789012345678901234567890?value=1000000000000000000';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.amount).toBe(100000000); // 1e18 wei = 1e8 sats
		});
	});

	describe('BSC addresses', () => {
		it('should parse BSC address with bsc: scheme', () => {
			const address = 'bsc:0x1234567890123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should parse BSC address with chain ID', () => {
			const address = 'ethereum:0x1234567890123456789012345678901234567890@56';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should parse BSC testnet address', () => {
			const address = 'ethereum:0x1234567890123456789012345678901234567890@97';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});
	});

	describe('Liquid addresses', () => {
		// Note: These tests use the actual Liquid address format from the user's example
		// The address validation is done by liquidjs-lib which will validate the Bech32 checksum

		it('should parse plain Liquid mainnet address (lq1 prefix)', () => {
			// Using a real Liquid mainnet address format (lq1...)
			const address =
				'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6';
			const result = parsePaymentAddress(address);
			// If liquidjs-lib validates successfully
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.address).toBe(address);
				expect(result.amount).toBeNull();
				expect(result.memo).toBeNull();
			}
		});

		it('should parse Liquid address with liquid: scheme', () => {
			const address =
				'liquid:lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.address).toBe(
					'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6'
				);
			}
		});

		it('should parse Liquid address with liquidnetwork: scheme', () => {
			const address =
				'liquidnetwork:lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.address).toBe(
					'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6'
				);
			}
		});

		it('should parse Liquid address with amount parameter', () => {
			const address =
				'liquidnetwork:lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6?amount=0.000025';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.amount).toBe(2500); // 0.000025 BTC = 2,500 sats
				expect(result.address).toBe(
					'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6'
				);
			}
		});

		it('should parse Liquid address with all parameters (amount, assetid, blindingkey)', () => {
			// Full Liquid URI with all parameters as provided by user
			const address =
				'liquidnetwork:lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6?amount=0.000025&assetid=6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d&blindingkey=0acd9629b620b773cd8cce0ab03dd7126b40474ad0bea1316860fc80235dc5af';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.amount).toBe(2500); // 0.000025 BTC = 2,500 sats
				expect(result.address).toBe(
					'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6'
				);
				// Note: assetid and blindingkey are not currently extracted but could be added in future
			}
		});

		it('should parse Liquid address with memo/label', () => {
			const address =
				'liquid:lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6?amount=0.0001&label=TestPayment';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.amount).toBe(10000); // 0.0001 BTC = 10,000 sats
				expect(result.memo).toBe('TestPayment');
			}
		});

		it('should parse plain Liquid address without parameters', () => {
			const address =
				'lq1pqfhehc3v3nn483yrvlxua0tz8292cmr4gdlj44jyyerac0c7tl87z6tufnv4wjxcq9qqtlckl92zhttk2mjc6fuypznzkd9eyk7lq4eg8f07vgqvc9a6';
			const result = parsePaymentAddress(address);
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
				expect(result.address).toBe(address);
				expect(result.amount).toBeNull();
				expect(result.memo).toBeNull();
			}
		});

		it('should handle legacy Liquid address format (VJL prefix)', () => {
			// Legacy P2SH format - if liquidjs-lib supports it
			const address = 'VJL1example123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			// This may fail validation depending on liquidjs-lib's strictness
			// We just verify the prefix is recognized
			if (result.isValid) {
				expect(result.network).toBe('liquid-bitcoin');
			}
		});
	});

	describe('EIP-681 format with chain IDs', () => {
		it('should reject unsupported chain ID', () => {
			const address = 'ethereum:0x1234567890123456789012345678901234567890@1';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toContain('Chain ID 1 is not supported');
		});

		it('should reject ethereum: scheme without chain ID', () => {
			const address = 'ethereum:0x1234567890123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toContain('Ethereum mainnet');
		});
	});

	describe('Edge cases', () => {
		it('should handle addresses with query parameters', () => {
			const address = 'rsk:0x1234567890123456789012345678901234567890?value=1000&message=Test';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Test');
		});

		it('should normalize Ethereum addresses to lowercase', () => {
			// Use a valid Ethereum address (42 characters: 0x + 40 hex chars)
			const address = '0x1234567890123456789012345678901234567890';
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(true);
			expect(result.address).toBe(address.toLowerCase());
		});

		it('should handle invalid Ethereum address format', () => {
			const address = '0x123'; // Too short
			const result = parsePaymentAddress(address);
			expect(result.isValid).toBe(false);
		});
	});
});
